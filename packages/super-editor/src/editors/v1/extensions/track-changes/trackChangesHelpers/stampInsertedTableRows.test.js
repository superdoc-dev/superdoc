import { afterEach, describe, expect, it } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { enumerateStructuralRowChanges } from './structuralRowChanges.js';
import { translator as trTranslator } from '@core/super-converter/v3/handlers/w/tr/tr-translator.js';

const ALICE = { name: 'Alice', email: 'alice@example.com' };

const setup = ({ user = ALICE, track = true, content = '<p>Hi there</p>' } = {}) => {
  const { editor } = initTestEditor({
    mode: 'text',
    content,
    user,
    trackedChanges: {},
  });
  if (track) editor.commands.enableTrackChanges();
  return editor;
};

/** Collect all tableRow nodes (with positions) in the editor doc. */
const collectRows = (editor) => {
  const rows = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'tableRow') rows.push({ node, pos });
  });
  return rows;
};

describe('authoring: tracked whole-table insertion stamps row revisions', () => {
  let editor;
  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('sets trackChange.type === "rowInsert" on every row of an inserted table when TC is on', () => {
    editor = setup({ track: true });
    const ok = editor.commands.insertTable({ rows: 3, cols: 2 });
    expect(ok).toBe(true);

    const rows = collectRows(editor);
    expect(rows.length).toBe(3);

    rows.forEach(({ node }) => {
      expect(node.attrs.trackChange).toBeTruthy();
      expect(node.attrs.trackChange.type).toBe('rowInsert');
      expect(node.attrs.trackChange.author).toBe(ALICE.name);
      expect(node.attrs.trackChange.authorEmail).toBe(ALICE.email);
      expect(typeof node.attrs.trackChange.id).toBe('string');
      expect(node.attrs.trackChange.id.length).toBeGreaterThan(0);
      expect(typeof node.attrs.trackChange.date).toBe('string');
    });

    // All rows of one table share a single revisionGroupId so the enumerator
    // groups them as ONE whole-table insert.
    const groupIds = new Set(rows.map((r) => r.node.attrs.trackChange.revisionGroupId));
    expect(groupIds.size).toBe(1);

    // Word assigns a distinct id per row; ids should differ.
    const ids = new Set(rows.map((r) => r.node.attrs.trackChange.id));
    expect(ids.size).toBe(3);
  });

  it('enumerateStructuralRowChanges reports exactly ONE decidable whole-table insert', () => {
    editor = setup({ track: true });
    editor.commands.insertTable({ rows: 3, cols: 2 });

    const changes = enumerateStructuralRowChanges(editor.state);
    expect(changes.length).toBe(1);

    const [change] = changes;
    expect(change.subtype).toBe('table-insert');
    expect(change.side).toBe('insertion');
    expect(change.wholeTable).toBe(true);
    expect(change.decidable).toBe(true);
    expect(change.rows.length).toBe(3);
    expect(change.author).toBe(ALICE.name);
  });

  it('does NOT stamp trackChange when TC mode is OFF (plain table insertion)', () => {
    editor = setup({ track: false });
    const ok = editor.commands.insertTable({ rows: 2, cols: 2 });
    expect(ok).toBe(true);

    const rows = collectRows(editor);
    expect(rows.length).toBe(2);
    rows.forEach(({ node }) => {
      expect(node.attrs.trackChange).toBeFalsy();
    });

    expect(enumerateStructuralRowChanges(editor.state)).toEqual([]);
  });

  it('tracks the table when dispatched through the REAL editor view path (not direct command return)', () => {
    // This mirrors the toolbar -> editor.commands.insertTable -> CommandService
    // -> view.dispatch -> Editor.#dispatchTransaction -> trackedTransaction
    // chokepoint that the layout-engine playground actually uses. We build the
    // command transaction and push it through the real dispatcher so the whole
    // tracked-transaction pipeline runs end to end.
    editor = setup({ track: true });

    // Move the caret to the end of the document so the table insert adds a
    // trailing separator paragraph (slice becomes [table, paragraph]); this is
    // the common real-app shape and exercises the separator wrapping branch.
    const endPos = editor.state.doc.content.size;
    editor.commands.setTextSelection(endPos);

    const dispatched = editor.commands.insertTable({ rows: 3, cols: 2 });
    expect(dispatched).toBe(true);

    const rows = collectRows(editor);
    expect(rows.length).toBe(3);
    rows.forEach(({ node }) => {
      expect(node.attrs.trackChange?.type).toBe('rowInsert');
      expect(node.attrs.trackChange.author).toBe(ALICE.name);
    });

    const changes = enumerateStructuralRowChanges(editor.state);
    expect(changes.length).toBe(1);
    expect(changes[0].subtype).toBe('table-insert');
    expect(changes[0].decidable).toBe(true);
    expect(changes[0].wholeTable).toBe(true);
    expect(changes[0].rows.length).toBe(3);
  });

  it('does NOT delete selected content untracked when a table insert replaces a real selection', () => {
    // Inserting a table over a NON-empty selection must never silently drop the
    // selected text (data loss in suggesting mode). The structural fast-path only
    // handles the no-real-content case (caret in an empty paragraph); for a
    // content-bearing replace it bails so the selected text is preserved.
    // (Full tracked-delete-then-insert for this case is a deferred enhancement.)
    editor = setup({ track: true, content: '<p>existing</p>' });
    editor.commands.selectAll();

    editor.commands.insertTable({ rows: 2, cols: 2 });

    // The original text is still present — it was not removed untracked.
    expect(editor.state.doc.textContent).toContain('existing');
  });

  it('does NOT delete a selected image untracked when a table insert replaces it (atom selection)', () => {
    // Regression: `textBetween()` is blind to atoms, so an image-only selection
    // contributes zero length and previously slipped past the no-real-content
    // guard — the raw ReplaceStep applied and the image was dropped with no
    // tracked deletion (silent data loss in suggesting mode). The guard now
    // detects non-text leaves and bails so the image is preserved.
    const countImages = (ed) => {
      let n = 0;
      ed.state.doc.descendants((node) => {
        if (node.type.name === 'image') n += 1;
      });
      return n;
    };

    editor = setup({ track: true, content: '<p><img src="test.png" /></p>' });
    expect(countImages(editor)).toBe(1);

    editor.commands.selectAll();
    editor.commands.insertTable({ rows: 2, cols: 2 });

    // The image must survive — it was not removed without a tracked deletion.
    expect(countImages(editor)).toBe(1);
  });

  it('tracks the table in an EMPTY doc (toolbar from=0,to=2 replace of the initial empty paragraph)', () => {
    // This is the exact layout-engine playground shape: an empty document holds
    // a single empty paragraph; the toolbar insertTable dispatches one
    // ReplaceStep from=0 to=2 whose slice is [table, paragraph]. The inline
    // overlap-compiler cannot represent the empty table (no inline text) and
    // fails closed, so this MUST take the structural-insert path.
    editor = setup({ track: true, content: '' });

    const ok = editor.commands.insertTable({ rows: 3, cols: 2 });
    expect(ok).toBe(true);

    // Inserted exactly once.
    let tableCount = 0;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'table') tableCount += 1;
    });
    expect(tableCount).toBe(1);

    const rows = collectRows(editor);
    expect(rows.length).toBe(3);
    rows.forEach(({ node }) => {
      expect(node.attrs.trackChange?.type).toBe('rowInsert');
      expect(node.attrs.trackChange.author).toBe(ALICE.name);
    });

    // One shared revisionGroupId per table; distinct per-row ids.
    expect(new Set(rows.map((r) => r.node.attrs.trackChange.revisionGroupId)).size).toBe(1);
    expect(new Set(rows.map((r) => r.node.attrs.trackChange.id)).size).toBe(3);

    const changes = enumerateStructuralRowChanges(editor.state);
    expect(changes.length).toBe(1);
    expect(changes[0].subtype).toBe('table-insert');
    expect(changes[0].decidable).toBe(true);
    expect(changes[0].wholeTable).toBe(true);
    expect(changes[0].rows.length).toBe(3);
  });

  it('tracks the table with the cursor mid-content (insert after a non-empty paragraph)', () => {
    editor = setup({ track: true, content: '<p>hello world</p>' });
    // Place the caret inside the paragraph (not a full selection).
    editor.commands.setTextSelection(5);

    const ok = editor.commands.insertTable({ rows: 2, cols: 3 });
    expect(ok).toBe(true);

    let tableCount = 0;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'table') tableCount += 1;
    });
    expect(tableCount).toBe(1);

    // The original paragraph text is untouched (the table is inserted around it,
    // not replacing it).
    expect(editor.state.doc.textContent).toContain('hello world');

    const rows = collectRows(editor);
    expect(rows.length).toBe(2);
    rows.forEach(({ node }) => {
      expect(node.attrs.trackChange?.type).toBe('rowInsert');
    });

    const changes = enumerateStructuralRowChanges(editor.state);
    expect(changes.length).toBe(1);
    expect(changes[0].decidable).toBe(true);
    expect(changes[0].wholeTable).toBe(true);
    expect(changes[0].rows.length).toBe(2);
  });

  it('a single undo cleanly reverts a tracked table insert', () => {
    editor = setup({ track: true, content: '<p>keep me</p>' });
    const before = editor.state.doc.toJSON();

    editor.commands.insertTable({ rows: 3, cols: 2 });
    expect(collectRows(editor).length).toBe(3);

    editor.commands.undo();

    // No table, no tracked rows, doc back to its original shape.
    let tableCount = 0;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'table') tableCount += 1;
    });
    expect(tableCount).toBe(0);
    expect(collectRows(editor).length).toBe(0);
    expect(enumerateStructuralRowChanges(editor.state)).toEqual([]);
    expect(editor.state.doc.toJSON()).toEqual(before);
  });

  it('roundtrip: stamped rows export <w:ins> inside <w:trPr>', () => {
    editor = setup({ track: true });
    editor.commands.insertTable({ rows: 2, cols: 2 });

    const rows = collectRows(editor);
    expect(rows.length).toBe(2);

    rows.forEach(({ node }) => {
      // Run the live row node through the export (decode) translator and assert
      // the structural revision marker lands inside <w:trPr>.
      const result = trTranslator.decode({ node: node.toJSON() }, {});
      const trPr = result.elements.find((el) => el.name === 'w:trPr');
      expect(trPr).toBeDefined();
      const ins = trPr.elements.find((el) => el.name === 'w:ins');
      expect(ins).toBeDefined();
      expect(ins.attributes['w:author']).toBe(ALICE.name);
      // Revision marker is the first child of w:trPr.
      expect(trPr.elements[0].name).toBe('w:ins');
    });
  });
});
