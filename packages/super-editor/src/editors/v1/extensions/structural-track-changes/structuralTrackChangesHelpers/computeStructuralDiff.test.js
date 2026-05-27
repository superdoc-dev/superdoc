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

  it('insert with no shared base block anchors at 0', () => {
    const base = makeDoc([p('p1', 'only')]);
    const proposal = makeDoc([table('t-new')]);
    const hunks = computeStructuralDiff(base, proposal);
    const insert = hunks.find((h) => h.kind === 'insert');
    expect(insert?.anchorBasePos).toBe(0);
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
