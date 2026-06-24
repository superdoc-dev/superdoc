import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { computeStructuralDiff } from './computeStructuralDiff.js';

const idAttr = (id) => ({ sdBlockId: id });

describe('computeStructuralDiff', () => {
  let editor, schema;
  beforeEach(() => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));
    schema = editor.schema;
  });
  afterEach(() => editor?.destroy());

  const makeDoc = (blocks) =>
    schema.nodes.doc.create(
      null,
      blocks.map((b) => b(schema)),
    );
  const p = (id, text) => (schema) => schema.nodes.paragraph.create(idAttr(id), schema.text(text));
  // Default cell text falls back to the id, so each table built here has a
  // unique content fingerprint matching the matcher's default behavior.
  const table =
    (id, text = id) =>
    (schema) => {
      const cell = schema.nodes.tableCell.create(null, schema.nodes.paragraph.create(null, schema.text(text)));
      const row = schema.nodes.tableRow.create(null, [cell]);
      return schema.nodes.table.create(idAttr(id), [row]);
    };
  const tableFingerprint = (text) => `table:${text}`;

  it('emits a remove hunk for a base table absent from proposal', () => {
    const base = makeDoc([p('p1', 'a'), table('t1'), p('p2', 'b')]);
    const proposal = makeDoc([p('p1', 'a'), p('p2', 'b')]);
    const hunks = computeStructuralDiff(base, proposal);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({ kind: 'remove', changeId: tableFingerprint('t1') });
  });

  it('emits an insert hunk for a proposal table absent from base', () => {
    const base = makeDoc([p('p1', 'a')]);
    const proposal = makeDoc([p('p1', 'a'), table('t1')]);
    const hunks = computeStructuralDiff(base, proposal);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({ kind: 'insert', changeId: tableFingerprint('t1') });
  });

  it('emits no hunks when both sides have matching tables', () => {
    const base = makeDoc([table('t1')]);
    const proposal = makeDoc([table('t1')]);
    expect(computeStructuralDiff(base, proposal)).toHaveLength(0);
  });

  it('matches tables across independent imports even when sdBlockIds differ', () => {
    // Reproduces the bug: two docx files loaded independently get fresh
    // sdBlockIds per import. The diff must still recognize identical tables.
    const base = makeDoc([table('base-a', 'first'), table('base-b', 'second')]);
    const proposal = makeDoc([table('prop-x', 'first'), table('prop-y', 'second')]);
    expect(computeStructuralDiff(base, proposal)).toHaveLength(0);
  });

  it('with multiple unchanged tables and one modified, marks only the modified one', () => {
    const base = makeDoc([
      table('base-a', 'unchanged-1'),
      table('base-b', 'will-edit'),
      table('base-c', 'unchanged-2'),
    ]);
    const proposal = makeDoc([
      table('prop-a', 'unchanged-1'),
      table('prop-b', 'edited-content'),
      table('prop-c', 'unchanged-2'),
    ]);
    const hunks = computeStructuralDiff(base, proposal);
    expect(hunks).toHaveLength(2);
    expect(hunks.some((h) => h.kind === 'remove' && h.changeId === tableFingerprint('will-edit'))).toBe(true);
    expect(hunks.some((h) => h.kind === 'insert' && h.changeId === tableFingerprint('edited-content'))).toBe(true);
  });

  it('anchor for insert is end of last shared base block', () => {
    const base = makeDoc([p('p1', 'first'), p('p2', 'second')]);
    const proposal = makeDoc([p('p1', 'first'), table('t-new'), p('p2', 'second')]);
    const hunks = computeStructuralDiff(base, proposal);
    const insert = hunks.find((h) => h.kind === 'insert');
    expect(insert).toBeDefined();
    expect(insert.anchorBasePos).toBe(base.child(0).nodeSize);
  });

  it('insert with no shared base block anchors at the unmatched base entry it replaces', () => {
    const base = makeDoc([p('p1', 'only')]);
    const proposal = makeDoc([table('t-new')]);
    const hunks = computeStructuralDiff(base, proposal);
    const insert = hunks.find((h) => h.kind === 'insert');
    expect(insert?.anchorBasePos).toBe(0);
  });

  it('insert anchors next to the table it replaces, even when it is the first block in the doc', () => {
    // Regression: when the AI edits the first table (no preceding shared
    // paragraphs) the proposal table used to anchor at position 0 instead of
    // next to the original. With multiple tables in the doc, the inserted
    // copy ended up "near some random table" rather than alongside the
    // edited one.
    const base = makeDoc([table('a', 'orig-a'), table('b', 'unchanged-b'), table('c', 'unchanged-c')]);
    const proposal = makeDoc([table("a'", 'edited-a'), table('b', 'unchanged-b'), table('c', 'unchanged-c')]);
    const hunks = computeStructuralDiff(base, proposal);
    const remove = hunks.find((h) => h.kind === 'remove' && h.changeId === tableFingerprint('orig-a'));
    const insert = hunks.find((h) => h.kind === 'insert' && h.changeId === tableFingerprint('edited-a'));
    expect(remove).toBeDefined();
    expect(insert).toBeDefined();
    expect(insert.anchorBasePos).toBe(remove.basePos);
  });

  it('insert anchors at the matching unmatched base entry, not the end of the last shared block', () => {
    // base has [P1, TableA, TableB]; proposal edits TableB. The natural anchor
    // for the inserted TableB' is TableB's position in base (so the new copy
    // lands adjacent to the original), not the end of TableA.
    const base = makeDoc([p('p1', 'intro'), table('a', 'unchanged-a'), table('b', 'orig-b')]);
    const proposal = makeDoc([p('p1', 'intro'), table('a', 'unchanged-a'), table("b'", 'edited-b')]);
    const hunks = computeStructuralDiff(base, proposal);
    const insert = hunks.find((h) => h.kind === 'insert');
    const baseTableB = base.child(2);
    let baseTableBPos = 0;
    base.forEach((node, offset) => {
      if (node === baseTableB) baseTableBPos = offset;
    });
    expect(insert?.anchorBasePos).toBe(baseTableBPos);
  });

  it('blockTypes filter (default ["table"]) restricts insert events', () => {
    const base = makeDoc([]);
    const proposal = makeDoc([table('t1'), p('p1', 'extra')]);
    const hunks = computeStructuralDiff(base, proposal);
    expect(hunks.filter((h) => h.kind === 'insert')).toHaveLength(1);
    expect(hunks.find((h) => h.kind === 'insert')?.changeId).toBe(tableFingerprint('t1'));
  });

  it('consumer can opt back into sdBlockId-based matching via identityKey override', () => {
    // For consumers whose proposals are in-place edits (sdBlockIds preserved
    // across base and proposal), id-based matching is sometimes preferable.
    const sdBlockIdKey = (node) => node.attrs?.sdBlockId ?? null;
    const base = makeDoc([table('t1', 'same')]);
    const proposal = makeDoc([table('t2', 'same')]); // same content, different id
    const hunks = computeStructuralDiff(base, proposal, { identityKey: sdBlockIdKey });
    // With id-based matching, these differ even though content is identical.
    expect(hunks.filter((h) => h.kind === 'remove')).toHaveLength(1);
    expect(hunks.filter((h) => h.kind === 'insert')).toHaveLength(1);
  });

  it('custom identityKey override', () => {
    const fingerprint = (node) => `${node.type.name}:${node.textContent}`;
    const noId = (text) => (schema) => schema.nodes.paragraph.create(null, schema.text(text));
    const base = makeDoc([noId('A'), noId('B')]);
    const proposal = makeDoc([noId('A')]);
    const hunks = computeStructuralDiff(base, proposal, {
      identityKey: fingerprint,
      blockTypes: ['paragraph'],
    });
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({ kind: 'remove', changeId: 'paragraph:B' });
  });

  it('does not descend into matched tables (nested table inside matched outer is not double-counted)', () => {
    const outerWithCellPara = (id) => (schema) => {
      const cell = schema.nodes.tableCell.create(null, schema.nodes.paragraph.create(null, schema.text('inner')));
      const row = schema.nodes.tableRow.create(null, [cell]);
      return schema.nodes.table.create(idAttr(id), [row]);
    };
    const base = makeDoc([outerWithCellPara('t-outer')]);
    const proposal = makeDoc([outerWithCellPara('t-outer')]);
    expect(computeStructuralDiff(base, proposal)).toHaveLength(0);
  });
});
