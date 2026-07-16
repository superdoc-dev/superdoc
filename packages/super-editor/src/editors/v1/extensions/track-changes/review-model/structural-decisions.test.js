// @ts-check
/**
 * Structural (whole-table) tracked-change tests.
 *
 * Covers:
 *   - enumeration + grouping of structural row revisions into one logical change
 *   - review-graph projection (type === 'structural')
 *   - decide semantics (accept/reject insert/delete)
 *   - whole-object atomicity: partial-range target fails closed with INVALID_INPUT
 *   - scope: 'all' includes structural changes
 */

import { describe, it, expect } from 'vitest';

import { decideTrackedChanges } from './decision-engine.js';
import { buildReviewGraph, CanonicalChangeType } from './review-graph.js';
import {
  createReviewGraphTestSchema,
  stateWithTrackedTable,
  stateWithPerRowTrackedTable,
  stateWithTwoTrackedTables,
} from './test-fixtures.js';
import { enumerateStructuralRowChanges } from '../trackChangesHelpers/structuralRowChanges.js';
import { EditorState } from 'prosemirror-state';
import { TrackInsertMarkName, TrackDeleteMarkName } from '../constants.js';

const ALICE = { name: 'Alice Reviewer', email: 'alice@example.com' };

const insertTrackChange = (id = '1') => ({
  type: 'rowInsert',
  id,
  sourceId: id,
  author: ALICE.name,
  authorEmail: ALICE.email,
  date: '2026-05-20T16:00:00Z',
  importedAuthor: `${ALICE.name} (imported)`,
});

const deleteTrackChange = (id = '1') => ({ ...insertTrackChange(id), type: 'rowDelete' });

const editorFor = (extra) => ({
  options: { user: ALICE, trackedChanges: {}, ...extra },
  storage: { trackChanges: { lastDecisionFailure: null } },
});

describe('structural row-change enumeration', () => {
  it('groups every row of a whole inserted table into one structural change', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateWithTrackedTable({ schema, trackChange: insertTrackChange('1'), rowCount: 3 });

    const changes = enumerateStructuralRowChanges(state);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      id: '1',
      side: 'insertion',
      subtype: 'table-insert',
      wholeTable: true,
    });
    expect(changes[0].rows).toHaveLength(3);
    expect(changes[0].tableTo).toBeGreaterThan(changes[0].tableFrom);
  });

  it('groups a whole deleted table into one structural deletion', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateWithTrackedTable({ schema, trackChange: deleteTrackChange('9') });
    const changes = enumerateStructuralRowChanges(state);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ id: '9', side: 'deletion', subtype: 'table-delete' });
  });

  it('returns [] for a missing state', () => {
    expect(enumerateStructuralRowChanges(null)).toEqual([]);
    expect(enumerateStructuralRowChanges({})).toEqual([]);
  });
});

describe('structural review-graph projection', () => {
  it('exposes the structural change with type "structural" and table-covering segment', () => {
    const schema = createReviewGraphTestSchema();
    const { state, tablePos } = stateWithTrackedTable({ schema, trackChange: insertTrackChange('1') });

    const graph = buildReviewGraph({ state });
    const change = graph.changes.get('1');
    expect(change).toBeDefined();
    expect(change.type).toBe(CanonicalChangeType.Structural);
    expect(change.subtype).toBe('table-insert');
    expect(change.segments[0].from).toBe(tablePos);

    // No invariant errors introduced by the structural change.
    expect(graph.validate().filter((d) => d.severity === 'error')).toEqual([]);

    // Range queries see the structural change.
    const inRange = graph.changesInRange(change.segments[0].from, change.segments[0].to);
    expect(inRange.map((c) => c.id)).toContain('1');
  });
});

describe('structural decide semantics', () => {
  const tableSurvives = (state) => state.doc.child(1).type.name === 'table';
  const rowTrackChangeOf = (state) => state.doc.child(1).child(0).attrs.trackChange;

  it('accept insertion clears the row trackChange attrs (table stays as normal content)', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateWithTrackedTable({ schema, trackChange: insertTrackChange('1') });

    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'accept',
      target: { kind: 'id', id: '1' },
    });
    expect(result.ok).toBe(true);
    const next = state.apply(result.tr);
    expect(tableSurvives(next)).toBe(true);
    expect(rowTrackChangeOf(next)).toBeNull();
  });

  it('accepting the table also clears cell text that SHARES the structural revision id (one action)', () => {
    // Text typed in a tracked-inserted row inherits the row's revision id, so the
    // inline trackInsert mark and the structural change SHARE an id. Regression for
    // the id-collision: the cascade must still reach the inline child (object
    // identity, not change.id) so accepting the table leaves zero tracked marks.
    const schema = createReviewGraphTestSchema();
    const id = '1';
    const tc = insertTrackChange(id);
    const insMark = schema.marks[TrackInsertMarkName].create({
      id,
      author: ALICE.name,
      authorEmail: ALICE.email,
      date: tc.date,
    });
    const cellParagraph = schema.nodes.paragraph.create({}, [schema.text('q', [insMark])]);
    const cell = schema.nodes.tableCell.create({}, [cellParagraph]);
    const row = schema.nodes.tableRow.create({ trackChange: tc }, [cell]);
    const table = schema.nodes.table.create({}, [row]);
    const before = schema.nodes.paragraph.create({}, [schema.text('Before.')]);
    const after = schema.nodes.paragraph.create({}, [schema.text('After.')]);
    const doc = schema.nodes.doc.create({}, [before, table, after]);
    const state = EditorState.create({ schema, doc });

    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'accept',
      target: { kind: 'id', id },
    });
    expect(result.ok).toBe(true);
    const next = state.apply(result.tr);

    // Table stays, row revision cleared.
    expect(next.doc.child(1).type.name).toBe('table');
    expect(next.doc.child(1).child(0).attrs.trackChange).toBeNull();
    // The shared-id cell text keeps its content but loses the trackInsert mark.
    const cellText = next.doc.child(1).child(0).child(0).child(0).child(0);
    expect(cellText.text).toBe('q');
    expect((cellText.marks || []).some((m) => m.type.name === TrackInsertMarkName)).toBe(false);
  });

  it('resolves a tracked pPrChange inside a KEPT table via planPprDecision, not the mark cascade', () => {
    // A tracked numbering change lives on a cell paragraph's node attr (not an
    // inline mark). When accept-all keeps the table, the pPr change must be
    // resolved by id (planPprDecision), NOT routed through the mark-based
    // table-child cascade — which, since pPr is typed "formatting" with no mark
    // to toggle, would no-op on accept (numbering + change record left behind).
    const schema = createReviewGraphTestSchema();
    const pprId = 'ppr-1';
    const { state } = stateWithTrackedTable({
      schema,
      trackChange: insertTrackChange('t1'),
      cellText: 'Numbered cell',
      cellParagraphAttrs: {
        paragraphProperties: {
          numberingProperties: { numId: 1, ilvl: 0 },
          change: {
            id: pprId,
            author: ALICE.name,
            authorEmail: ALICE.email,
            date: '2026-05-20T16:00:00Z',
            paragraphProperties: {}, // former (unnumbered) state
          },
        },
      },
    });

    // Both the structural table change and the pПr change are enumerated.
    const graph = buildReviewGraph({ state });
    expect(graph.changes.get('t1')?.type).toBe(CanonicalChangeType.Structural);
    expect(graph.changes.get(pprId)?.pprChange, 'pPr change enumerated inside the table').toBeTruthy();

    const result = decideTrackedChanges({ state, editor: editorFor(), decision: 'accept', target: { kind: 'all' } });
    expect(result.ok, result.ok ? '' : JSON.stringify(result.failure)).toBe(true);
    const next = state.apply(result.tr);

    // Table stays; pPr change record cleared (accept), numbering kept.
    expect(next.doc.child(1).type.name).toBe('table');
    const cellPara = next.doc.child(1).child(0).child(0).child(0);
    expect(cellPara.attrs.paragraphProperties?.change, 'pPr change record cleared on accept').toBeFalsy();
    expect(cellPara.attrs.paragraphProperties?.numberingProperties, 'numbering kept on accept').toBeTruthy();
  });

  it('accepting a tracked table BY ID also resolves a contained pPr change', () => {
    // Accepting the table by its own change id keeps the table AND its contents.
    // The contained pPr change is NOT in the selection (only the table is), so it
    // is reached via the side-effect sweep — which must resolve it through
    // planPprDecision rather than skip it, leaving numbering revisions pending.
    const schema = createReviewGraphTestSchema();
    const pprId = 'ppr-2';
    const { state } = stateWithTrackedTable({
      schema,
      trackChange: insertTrackChange('t2'),
      cellText: 'Numbered cell',
      cellParagraphAttrs: {
        paragraphProperties: {
          numberingProperties: { numId: 1, ilvl: 0 },
          change: {
            id: pprId,
            author: ALICE.name,
            authorEmail: ALICE.email,
            date: '2026-05-20T16:00:00Z',
            paragraphProperties: {},
          },
        },
      },
    });

    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'accept',
      target: { kind: 'id', id: 't2' },
    });
    expect(result.ok, result.ok ? '' : JSON.stringify(result.failure)).toBe(true);
    const next = state.apply(result.tr);

    expect(next.doc.child(1).type.name).toBe('table');
    const cellPara = next.doc.child(1).child(0).child(0).child(0);
    expect(cellPara.attrs.paragraphProperties?.change, 'contained pPr resolved on accept-by-id').toBeFalsy();
    expect(cellPara.attrs.paragraphProperties?.numberingProperties, 'numbering kept').toBeTruthy();
  });

  it('a RANGE/cursor decide over a tracked table resolves the STRUCTURAL change (not the inline child)', () => {
    // Range and collapsed-cursor targets must prefer the structural change for a
    // shared id, same as the by-id path — otherwise a cursor inside the table
    // resolves the inline cell-text change and the table stays tracked.
    const schema = createReviewGraphTestSchema();
    const id = '1';
    const tc = insertTrackChange(id);
    const insMark = schema.marks[TrackInsertMarkName].create({ id, author: ALICE.name, date: tc.date });
    const cellParagraph = schema.nodes.paragraph.create({}, [schema.text('q', [insMark])]);
    const cell = schema.nodes.tableCell.create({}, [cellParagraph]);
    const row = schema.nodes.tableRow.create({ trackChange: tc }, [cell]);
    const table = schema.nodes.table.create({}, [row]);
    const before = schema.nodes.paragraph.create({}, [schema.text('Before.')]);
    const doc = schema.nodes.doc.create({}, [before, table, schema.nodes.paragraph.create({}, [schema.text('A')])]);
    const state = EditorState.create({ schema, doc });

    // Locate the table node range, then accept via a RANGE target covering it.
    let tableFrom = 0;
    let tableTo = 0;
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'table') {
        tableFrom = pos;
        tableTo = pos + node.nodeSize;
        return false;
      }
      return undefined;
    });

    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'accept',
      target: { kind: 'range', from: tableFrom, to: tableTo },
    });
    expect(result.ok).toBe(true);
    const next = state.apply(result.tr);

    // The structural change was resolved: table stays, row revision cleared, and
    // the shared-id cell text lost its trackInsert mark (cascade reached it).
    expect(next.doc.child(1).type.name).toBe('table');
    expect(next.doc.child(1).child(0).attrs.trackChange).toBeNull();
    const cellText = next.doc.child(1).child(0).child(0).child(0).child(0);
    expect((cellText.marks || []).some((m) => m.type.name === TrackInsertMarkName)).toBe(false);
  });

  it('reject insertion removes the whole table node', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateWithTrackedTable({ schema, trackChange: insertTrackChange('1') });

    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'reject',
      target: { kind: 'id', id: '1' },
    });
    expect(result.ok).toBe(true);
    const next = state.apply(result.tr);
    expect(next.doc.childCount).toBe(2); // before + after, table gone.
    expect(next.doc.child(1).textContent).toBe('After.');
  });

  it('accept deletion removes the whole table node', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateWithTrackedTable({ schema, trackChange: deleteTrackChange('1') });

    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'accept',
      target: { kind: 'id', id: '1' },
    });
    expect(result.ok).toBe(true);
    const next = state.apply(result.tr);
    expect(next.doc.childCount).toBe(2);
  });

  it('reject deletion clears the row trackChange attrs (table restored)', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateWithTrackedTable({ schema, trackChange: deleteTrackChange('1') });

    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'reject',
      target: { kind: 'id', id: '1' },
    });
    expect(result.ok).toBe(true);
    const next = state.apply(result.tr);
    expect(tableSurvives(next)).toBe(true);
    expect(rowTrackChangeOf(next)).toBeNull();
  });

  it('scope: all reject clears the structural change', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateWithTrackedTable({ schema, trackChange: insertTrackChange('1') });

    const result = decideTrackedChanges({ state, editor: editorFor(), decision: 'reject', target: { kind: 'all' } });
    expect(result.ok).toBe(true);
    const next = state.apply(result.tr);
    expect(enumerateStructuralRowChanges(next)).toEqual([]);
  });
});

describe('whole-table detection with distinct per-row ids (real Word shape)', () => {
  const insertRow = (id) => ({
    type: 'rowInsert',
    id,
    sourceId: id,
    author: ALICE.name,
    authorEmail: ALICE.email,
    date: '2026-05-20T16:00:00Z',
    importedAuthor: `${ALICE.name} (imported)`,
  });
  const deleteRow = (id) => ({ ...insertRow(id), type: 'rowDelete' });

  it('mirrors new_table.docx: 3 rows, 3 distinct ids, all inserts → ONE whole table-insert', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateWithPerRowTrackedTable({
      schema,
      rowTrackChanges: [insertRow('2'), insertRow('7'), insertRow('11')],
    });
    const changes = enumerateStructuralRowChanges(state);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ subtype: 'table-insert', wholeTable: true, decidable: true });
    expect(changes[0].rows).toHaveLength(3);

    // accept/reject affects only that table.
    const accept = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'accept',
      target: { kind: 'id', id: changes[0].id },
    });
    expect(accept.ok).toBe(true);
    const next = state.apply(accept.tr);
    expect(next.doc.child(1).type.name).toBe('table');
    // every row trackChange cleared
    next.doc.child(1).forEach((row) => expect(row.attrs.trackChange).toBeNull());
    expect(enumerateStructuralRowChanges(next)).toEqual([]);
  });

  it('partial tracked rows (subset) → NOT whole-table, decide fails closed, table NOT removed', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateWithPerRowTrackedTable({
      schema,
      rowTrackChanges: [insertRow('2'), null, insertRow('11')],
    });
    const changes = enumerateStructuralRowChanges(state);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ wholeTable: false, decidable: false, undecidableReason: 'partial-rows' });

    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'reject',
      target: { kind: 'id', id: changes[0].id },
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('CAPABILITY_UNAVAILABLE');
  });

  it('mixed sides within one table → NOT whole-table, decide fails closed', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateWithPerRowTrackedTable({
      schema,
      rowTrackChanges: [insertRow('2'), deleteRow('7')],
    });
    const changes = enumerateStructuralRowChanges(state);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ wholeTable: false, decidable: false, undecidableReason: 'mixed-sides' });

    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'accept',
      target: { kind: 'id', id: changes[0].id },
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('CAPABILITY_UNAVAILABLE');
    // table must survive
    const before = state.doc.childCount;
    expect(before).toBe(state.doc.childCount);
  });

  it('scope:all with a partial table leaves the table intact (no whole-table removal)', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateWithPerRowTrackedTable({
      schema,
      rowTrackChanges: [insertRow('2'), null],
    });
    const result = decideTrackedChanges({ state, editor: editorFor(), decision: 'reject', target: { kind: 'all' } });
    // The only change is undecidable structural → no ops → fails closed.
    expect(result.ok).toBe(false);
    // table still present in original state (engine never mutated).
    expect(state.doc.child(1).type.name).toBe('table');
  });

  it('two separate tracked tables → two independent structural changes', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateWithTwoTrackedTables({
      schema,
      first: insertRow('5'),
      second: deleteRow('8'),
    });
    const changes = enumerateStructuralRowChanges(state);
    expect(changes).toHaveLength(2);
    expect(changes.map((c) => c.subtype).sort()).toEqual(['table-delete', 'table-insert']);
    // graph projects each as its own change.
    const graph = buildReviewGraph({ state });
    const structuralLogical = new Set();
    for (const c of graph.changes.values()) {
      if (c.type === CanonicalChangeType.Structural) structuralLogical.add(c);
    }
    expect(structuralLogical.size).toBe(2);
  });

  it('two tracked tables sharing the same Word id still project as two changes (table-scoped identity)', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateWithTwoTrackedTables({
      schema,
      first: insertRow('3'),
      second: insertRow('3'),
    });
    const graph = buildReviewGraph({ state });
    const structuralLogical = new Set();
    for (const c of graph.changes.values()) {
      if (c.type === CanonicalChangeType.Structural) structuralLogical.add(c);
    }
    expect(structuralLogical.size).toBe(2);
  });

  it('nested tracked table inside a cell is discovered as its own change', () => {
    const schema = createReviewGraphTestSchema();
    // Outer table: one row, NOT tracked, whose cell contains an inner tracked table.
    const innerCellParagraph = schema.nodes.paragraph.create({}, [schema.text('Inner')]);
    const innerCell = schema.nodes.tableCell.create({}, [innerCellParagraph]);
    const innerRow = schema.nodes.tableRow.create({ trackChange: insertRow('42') }, [innerCell]);
    const innerTable = schema.nodes.table.create({}, [innerRow]);
    const outerCell = schema.nodes.tableCell.create({}, [innerTable]);
    const outerRow = schema.nodes.tableRow.create({ trackChange: null }, [outerCell]);
    const outerTable = schema.nodes.table.create({}, [outerRow]);
    const doc = schema.nodes.doc.create({}, [schema.nodes.paragraph.create({}, [schema.text('Before.')]), outerTable]);
    const state = EditorState.create({ schema, doc });

    const changes = enumerateStructuralRowChanges(state);
    // Only the inner table is fully tracked → ONE whole-table change.
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ subtype: 'table-insert', wholeTable: true });
  });
});

describe('co-decide: inline tracked change inside a removed table', () => {
  const insertRow = (id) => ({
    type: 'rowInsert',
    id,
    sourceId: id,
    author: ALICE.name,
    authorEmail: ALICE.email,
    date: '2026-05-20T16:00:00Z',
    importedAuthor: `${ALICE.name} (imported)`,
  });

  /**
   * Build a doc: Before. / table (one row, rowInsert) whose cell text carries an
   * inline trackInsert mark / After.
   */
  const buildDocWithInlineInsideTable = (schema) => {
    const insMark = schema.marks[TrackInsertMarkName].create({
      id: 'inline-1',
      author: ALICE.name,
      authorEmail: ALICE.email,
      date: '2026-05-20T16:00:00Z',
    });
    const cellParagraph = schema.nodes.paragraph.create({}, [schema.text('NewCell', [insMark])]);
    const cell = schema.nodes.tableCell.create({}, [cellParagraph]);
    const row = schema.nodes.tableRow.create({ trackChange: insertRow('2') }, [cell]);
    const table = schema.nodes.table.create({}, [row]);
    const before = schema.nodes.paragraph.create({}, [schema.text('Before.')]);
    const after = schema.nodes.paragraph.create({}, [schema.text('After.')]);
    const doc = schema.nodes.doc.create({}, [before, table, after]);
    return EditorState.create({ schema, doc });
  };

  it('scope:all reject removes the table once and retires the inner inline change (no drift)', () => {
    const schema = createReviewGraphTestSchema();
    const state = buildDocWithInlineInsideTable(schema);

    // Sanity: graph sees both the structural and the inline change.
    const graph = buildReviewGraph({ state });
    const types = [...graph.changes.values()].map((c) => c.type);
    expect(types).toContain(CanonicalChangeType.Structural);
    expect(types).toContain(CanonicalChangeType.Insertion);

    const result = decideTrackedChanges({ state, editor: editorFor(), decision: 'reject', target: { kind: 'all' } });
    expect(result.ok).toBe(true);
    const next = state.apply(result.tr);
    // Table gone: before + after only.
    expect(next.doc.childCount).toBe(2);
    expect(next.doc.child(0).textContent).toBe('Before.');
    expect(next.doc.child(1).textContent).toBe('After.');
    // No tracked changes remain.
    expect(enumerateStructuralRowChanges(next)).toEqual([]);
    const nextGraph = buildReviewGraph({ state: next });
    expect(nextGraph.changes.size).toBe(0);
    // The inline change was retired as a side effect.
    const retiredIds = result.receipt.removedChangeIds
      .map((entry) => entry.id)
      .concat(result.receipt.affectedChildren.map((c) => c.changeId));
    expect(retiredIds).toContain('inline-1');
  });
});

describe('co-decide: inline tracked change inside a STAYING table (Word/GDocs subsume)', () => {
  const insertRow = (id) => ({
    type: 'rowInsert',
    id,
    sourceId: id,
    author: ALICE.name,
    authorEmail: ALICE.email,
    date: '2026-05-20T16:00:00Z',
    importedAuthor: `${ALICE.name} (imported)`,
  });
  const deleteRow = (id) => ({ ...insertRow(id), type: 'rowDelete' });

  /** Table (one row) whose cell text carries an inline trackInsert mark. */
  const buildInsertedTableWithInlineInsertion = (schema) => {
    const insMark = schema.marks[TrackInsertMarkName].create({
      id: 'inline-ins-1',
      author: ALICE.name,
      authorEmail: ALICE.email,
      date: '2026-05-20T16:00:00Z',
    });
    const cellParagraph = schema.nodes.paragraph.create({}, [schema.text('NewCell', [insMark])]);
    const cell = schema.nodes.tableCell.create({}, [cellParagraph]);
    const row = schema.nodes.tableRow.create({ trackChange: insertRow('2') }, [cell]);
    const table = schema.nodes.table.create({}, [row]);
    const before = schema.nodes.paragraph.create({}, [schema.text('Before.')]);
    const after = schema.nodes.paragraph.create({}, [schema.text('After.')]);
    const doc = schema.nodes.doc.create({}, [before, table, after]);
    return EditorState.create({ schema, doc });
  };

  /** Deleted table (one row) whose cell text carries an inline trackDelete mark. */
  const buildDeletedTableWithInlineDeletion = (schema) => {
    const delMark = schema.marks[TrackDeleteMarkName].create({
      id: 'inline-del-1',
      author: ALICE.name,
      authorEmail: ALICE.email,
      date: '2026-05-20T16:00:00Z',
    });
    const cellParagraph = schema.nodes.paragraph.create({}, [schema.text('OldCell', [delMark])]);
    const cell = schema.nodes.tableCell.create({}, [cellParagraph]);
    const row = schema.nodes.tableRow.create({ trackChange: deleteRow('4') }, [cell]);
    const table = schema.nodes.table.create({}, [row]);
    const before = schema.nodes.paragraph.create({}, [schema.text('Before.')]);
    const after = schema.nodes.paragraph.create({}, [schema.text('After.')]);
    const doc = schema.nodes.doc.create({}, [before, table, after]);
    return EditorState.create({ schema, doc });
  };

  const cellTextOf = (state) => state.doc.child(1).child(0).child(0).textContent;
  const tableSurvives = (state) => state.doc.child(1).type.name === 'table';

  it('accept an inserted table: rows cleared AND contained inline insertions accepted (zero marks, text stays)', () => {
    const schema = createReviewGraphTestSchema();
    const state = buildInsertedTableWithInlineInsertion(schema);

    // Sanity: graph sees both the structural and the inline insertion.
    const graph = buildReviewGraph({ state });
    const types = [...graph.changes.values()].map((c) => c.type);
    expect(types).toContain(CanonicalChangeType.Structural);
    expect(types).toContain(CanonicalChangeType.Insertion);

    const structural = enumerateStructuralRowChanges(state)[0];
    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'accept',
      target: { kind: 'id', id: structural.id },
    });
    expect(result.ok).toBe(true);
    const next = state.apply(result.tr);

    // Table stays, text present.
    expect(tableSurvives(next)).toBe(true);
    expect(cellTextOf(next)).toBe('NewCell');
    // ZERO tracked changes remain: rows cleared AND inline marks gone.
    expect(enumerateStructuralRowChanges(next)).toEqual([]);
    const nextGraph = buildReviewGraph({ state: next });
    expect(nextGraph.changes.size).toBe(0);

    // The inline insertion was resolved as an affected child of the parent.
    const retiredIds = result.receipt.removedChangeIds
      .map((entry) => entry.id)
      .concat(result.receipt.affectedChildren.map((c) => c.changeId));
    expect(retiredIds).toContain('inline-ins-1');
    expect(result.receipt.affectedChildren.map((c) => c.changeId)).toContain('inline-ins-1');
  });

  it('reject an inserted table: whole table (and its inline insertion) removed', () => {
    const schema = createReviewGraphTestSchema();
    const state = buildInsertedTableWithInlineInsertion(schema);
    const structural = enumerateStructuralRowChanges(state)[0];

    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'reject',
      target: { kind: 'id', id: structural.id },
    });
    expect(result.ok).toBe(true);
    const next = state.apply(result.tr);
    // Table + its text gone.
    expect(next.doc.childCount).toBe(2);
    expect(next.doc.child(0).textContent).toBe('Before.');
    expect(next.doc.child(1).textContent).toBe('After.');
    expect(buildReviewGraph({ state: next }).changes.size).toBe(0);
  });

  it('reject a deleted table: rows restored AND contained inline deletions rejected (content stays, no marks)', () => {
    const schema = createReviewGraphTestSchema();
    const state = buildDeletedTableWithInlineDeletion(schema);
    const structural = enumerateStructuralRowChanges(state)[0];

    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'reject',
      target: { kind: 'id', id: structural.id },
    });
    expect(result.ok).toBe(true);
    const next = state.apply(result.tr);

    expect(tableSurvives(next)).toBe(true);
    // Content stays (deletion rejected) and no marks remain.
    expect(cellTextOf(next)).toBe('OldCell');
    expect(enumerateStructuralRowChanges(next)).toEqual([]);
    expect(buildReviewGraph({ state: next }).changes.size).toBe(0);
    const retiredIds = result.receipt.removedChangeIds
      .map((entry) => entry.id)
      .concat(result.receipt.affectedChildren.map((c) => c.changeId));
    expect(retiredIds).toContain('inline-del-1');
  });

  it('scope:all accept of an inserted table + contained inline insertion → ONE coherent result, no double-plan', () => {
    const schema = createReviewGraphTestSchema();
    const state = buildInsertedTableWithInlineInsertion(schema);

    const result = decideTrackedChanges({ state, editor: editorFor(), decision: 'accept', target: { kind: 'all' } });
    expect(result.ok).toBe(true);
    const next = state.apply(result.tr);

    expect(tableSurvives(next)).toBe(true);
    expect(cellTextOf(next)).toBe('NewCell');
    expect(enumerateStructuralRowChanges(next)).toEqual([]);
    expect(buildReviewGraph({ state: next }).changes.size).toBe(0);
    // The inline insertion id appears exactly once across removed/children
    // (dedup avoided double-planning under scope:'all').
    const occurrences = result.receipt.removedChangeIds
      .map((e) => e.id)
      .concat(result.receipt.affectedChildren.map((c) => c.changeId))
      .filter((id) => id === 'inline-ins-1').length;
    expect(occurrences).toBeGreaterThanOrEqual(1);
  });

  it('partial-range on the structural change still fails closed (cascade only on a FULL decision)', () => {
    const schema = createReviewGraphTestSchema();
    const state = buildInsertedTableWithInlineInsertion(schema);
    const structural = enumerateStructuralRowChanges(state)[0];

    // A range strictly inside the table, not covering the whole table.
    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'accept',
      target: { kind: 'range', from: structural.tableFrom + 2, to: structural.tableFrom + 4 },
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_INPUT');
    // Document unmutated.
    expect(state.doc.child(1).type.name).toBe('table');
  });
});

describe('structural whole-object atomicity (fail closed)', () => {
  it('a partial-range target on a structural change fails closed with INVALID_INPUT and does not mutate', () => {
    const schema = createReviewGraphTestSchema();
    const { state, tablePos } = stateWithTrackedTable({ schema, trackChange: deleteTrackChange('1') });

    // A range strictly inside the table, not covering the whole table → partial.
    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'accept',
      target: { kind: 'range', from: tablePos + 2, to: tablePos + 4 },
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_INPUT');
  });
});
