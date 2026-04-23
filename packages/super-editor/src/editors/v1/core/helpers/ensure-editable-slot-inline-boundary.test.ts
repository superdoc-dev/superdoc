import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { Node as PMNode, Schema } from 'prosemirror-model';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { applyEditableSlotAtInlineBoundary } from './ensure-editable-slot-inline-boundary.js';

function findStructuredContent(doc: PMNode): { node: PMNode; pos: number } | null {
  let found: { node: PMNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (node.type.name === 'structuredContent') {
      found = { node, pos };
      return false;
    }
    return true;
  });
  return found;
}

function zwspCount(text: string): number {
  return (text.match(/\u200B/g) ?? []).length;
}

describe('applyEditableSlotAtInlineBoundary', () => {
  let schema: Schema;
  let destroy: (() => void) | undefined;

  beforeEach(() => {
    const { editor } = initTestEditor();
    schema = editor.schema;
    destroy = () => editor.destroy();
  });

  afterEach(() => {
    destroy?.();
    destroy = undefined;
  });

  it('inserts zero-width space after trailing inline SDT (direction after)', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'i1' }, schema.text('Field'));
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [schema.text('A '), inlineSdt])]);
    const sdt = findStructuredContent(doc);
    expect(sdt).not.toBeNull();
    const afterSdt = sdt!.pos + sdt!.node.nodeSize;

    const state = EditorState.create({ schema, doc });
    const tr = applyEditableSlotAtInlineBoundary(state.tr, afterSdt, 'after');

    expect(tr.docChanged).toBe(true);
    expect(zwspCount(tr.doc.textContent)).toBe(1);
    expect(tr.selection.from).toBe(afterSdt + 1);
    expect(tr.selection.empty).toBe(true);
  });

  it('does not insert when text follows inline SDT (direction after)', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'i1' }, schema.text('Field'));
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [schema.text('A '), inlineSdt, schema.text(' Z')]),
    ]);
    const sdt = findStructuredContent(doc);
    expect(sdt).not.toBeNull();
    const afterSdt = sdt!.pos + sdt!.node.nodeSize;
    const beforeText = doc.textContent;

    const state = EditorState.create({ schema, doc });
    const tr = applyEditableSlotAtInlineBoundary(state.tr, afterSdt, 'after');

    expect(tr.docChanged).toBe(false);
    expect(tr.doc.textContent).toBe(beforeText);
    expect(tr.selection.from).toBe(afterSdt);
  });

  it('inserts zero-width space before leading inline SDT (direction before)', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'i1' }, schema.text('Field'));
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [inlineSdt, schema.text(' tail')])]);
    const sdt = findStructuredContent(doc);
    expect(sdt).not.toBeNull();
    const beforeSdt = sdt!.pos;

    const state = EditorState.create({ schema, doc });
    const tr = applyEditableSlotAtInlineBoundary(state.tr, beforeSdt, 'before');

    expect(tr.docChanged).toBe(true);
    expect(zwspCount(tr.doc.textContent)).toBe(1);
    expect(tr.doc.textContent).toContain('tail');
    expect(tr.selection.from).toBe(beforeSdt + 1);
  });

  it('does not insert when text precedes inline SDT (direction before)', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'i1' }, schema.text('Field'));
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [schema.text('A '), inlineSdt])]);
    const sdt = findStructuredContent(doc);
    expect(sdt).not.toBeNull();
    const beforeSdt = sdt!.pos;
    const beforeText = doc.textContent;

    const state = EditorState.create({ schema, doc });
    const tr = applyEditableSlotAtInlineBoundary(state.tr, beforeSdt, 'before');

    expect(tr.docChanged).toBe(false);
    expect(tr.doc.textContent).toBe(beforeText);
    expect(tr.selection.from).toBe(beforeSdt);
  });

  it('inserts when following sibling is an empty run (direction after)', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'i1' }, schema.text('Field'));
    const emptyRun = schema.nodes.run.create();
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [inlineSdt, emptyRun])]);
    const sdt = findStructuredContent(doc);
    expect(sdt).not.toBeNull();
    const afterSdt = sdt!.pos + sdt!.node.nodeSize;

    const state = EditorState.create({ schema, doc });
    const tr = applyEditableSlotAtInlineBoundary(state.tr, afterSdt, 'after');

    expect(tr.docChanged).toBe(true);
    expect(zwspCount(tr.doc.textContent)).toBe(1);
    expect(tr.selection.from).toBe(afterSdt + 1);
  });

  it('inserts when preceding sibling is an empty run (direction before)', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'i1' }, schema.text('Field'));
    const emptyRun = schema.nodes.run.create();
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [emptyRun, inlineSdt])]);
    const sdt = findStructuredContent(doc);
    expect(sdt).not.toBeNull();
    const beforeSdt = sdt!.pos;

    const state = EditorState.create({ schema, doc });
    const tr = applyEditableSlotAtInlineBoundary(state.tr, beforeSdt, 'before');

    expect(tr.docChanged).toBe(true);
    expect(zwspCount(tr.doc.textContent)).toBe(1);
    expect(tr.selection.from).toBe(beforeSdt + 1);
  });

  it('clamps an oversized position to doc end then may insert zero-width space (direction after)', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'i1' }, schema.text('Field'));
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [inlineSdt])]);
    const sizeBefore = doc.content.size;

    const state = EditorState.create({ schema, doc });
    const tr = applyEditableSlotAtInlineBoundary(state.tr, sizeBefore + 999, 'after');

    // Clamps to `doc.content.size`; gap after last inline has no node → ZWSP + caret (size may grow by schema-specific steps).
    expect(tr.docChanged).toBe(true);
    expect(tr.doc.content.size).toBeGreaterThan(sizeBefore);
    expect(zwspCount(tr.doc.textContent)).toBeGreaterThanOrEqual(1);
    expect(tr.selection.from).toBeGreaterThan(0);
    expect(tr.selection.from).toBeLessThanOrEqual(tr.doc.content.size);
  });

  it('clamps a negative position to 0 then may insert zero-width space (direction before)', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'i1' }, schema.text('Field'));
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [inlineSdt])]);

    const state = EditorState.create({ schema, doc });
    const tr = applyEditableSlotAtInlineBoundary(state.tr, -999, 'before');

    expect(tr.docChanged).toBe(true);
    expect(zwspCount(tr.doc.textContent)).toBe(1);
    expect(tr.selection.from).toBe(1);
  });
});
