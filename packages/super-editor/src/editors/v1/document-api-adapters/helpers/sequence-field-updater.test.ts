import { Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { updateSequenceFieldsInTransaction } from './sequence-field-updater.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: {
        sdBlockId: { default: null },
        paragraphProperties: { default: null },
        styleName: { default: null },
      },
    },
    text: { group: 'inline' },
    sequenceField: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: {
        instruction: { default: '' },
        identifier: { default: '' },
        fieldArgument: { default: '' },
        sequenceMode: { default: 'next' },
        hideResult: { default: false },
        restartNumber: { default: null },
        restartLevel: { default: null },
        format: { default: 'Arabic' },
        hasGeneralFormat: { default: false },
        pageNumberFieldFormat: { default: null },
        numericPictureFormat: { default: null },
        resolvedNumber: { default: '' },
        resolvedNumberIsCurrent: { default: false },
        sdBlockId: { default: null },
      },
    },
  },
});

function seq(instruction: string, attrs: Record<string, unknown> = {}) {
  return schema.nodes.sequenceField.create({
    instruction,
    ...attrs,
  });
}

function p(...content: ProseMirrorNode[]) {
  return schema.nodes.paragraph.create({}, content);
}

function resolvedNumbers(doc: ProseMirrorNode): string[] {
  const values: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === 'sequenceField') values.push(node.attrs.resolvedNumber as string);
    return true;
  });
  return values;
}

function updateDoc(doc: ProseMirrorNode, options: Parameters<typeof updateSequenceFieldsInTransaction>[0] = {} as any) {
  const state = EditorState.create({ schema, doc });
  const tr = state.tr;
  const result = updateSequenceFieldsInTransaction({
    tr,
    schema,
    ...options,
  });
  return { result, doc: tr.doc };
}

describe('updateSequenceFieldsInTransaction', () => {
  it('recomputes all SEQ fields in document order and marks them current', () => {
    const doc = schema.nodes.doc.create(null, [
      p(seq('SEQ Figure \\* ARABIC', { resolvedNumber: '9' })),
      p(seq('SEQ Figure \\* ARABIC', { resolvedNumber: '9' })),
      p(seq('SEQ Table \\* ARABIC', { resolvedNumber: '9' })),
    ]);

    const updated = updateDoc(doc);

    expect(updated.result).toEqual({ changed: true, updated: 3 });
    expect(resolvedNumbers(updated.doc)).toEqual(['1', '2', '1']);
    updated.doc.descendants((node) => {
      if (node.type.name === 'sequenceField') expect(node.attrs.resolvedNumberIsCurrent).toBe(true);
      return true;
    });
  });

  it('evaluates fields before a range but only writes overlapping nodes', () => {
    const first = p(seq('SEQ Figure'));
    const second = p(seq('SEQ Figure'));
    const doc = schema.nodes.doc.create(null, [first, second]);
    const secondPos = first.nodeSize + 1;

    const updated = updateDoc(doc, { scope: { kind: 'range', from: secondPos, to: secondPos + second.nodeSize } });

    expect(updated.result).toEqual({ changed: true, updated: 1 });
    expect(resolvedNumbers(updated.doc)).toEqual(['', '2']);
  });

  it('updates only the requested identifier while preserving shared counter evaluation', () => {
    const doc = schema.nodes.doc.create(null, [
      p(seq('SEQ Figure')),
      p(seq('SEQ Table')),
      p(seq('SEQ Figure')),
      p(seq('SEQ Table')),
    ]);

    const updated = updateDoc(doc, { scope: { kind: 'identifier', identifier: 'Table' } });

    expect(updated.result).toEqual({ changed: true, updated: 2 });
    expect(resolvedNumbers(updated.doc)).toEqual(['', '1', '', '2']);
  });

  it('uses shared style-aware heading resolution for restart-level fields when converter context is available', () => {
    const heading = schema.nodes.paragraph.create({
      paragraphProperties: { styleId: 'HeadingOne' },
    });
    const caption1 = p(seq('SEQ Figure \\s 1'));
    const heading2 = schema.nodes.paragraph.create({
      paragraphProperties: { styleId: 'HeadingOne' },
    });
    const caption2 = p(seq('SEQ Figure \\s 1'));
    const doc = schema.nodes.doc.create(null, [heading, caption1, heading2, caption2]);

    const updated = updateDoc(doc, {
      converterContext: {
        translatedLinkedStyles: {
          docDefaults: {},
          styles: {
            HeadingOne: { name: 'Custom Heading', paragraphProperties: { outlineLvl: 0 } },
          },
        },
        translatedNumbering: {},
      } as any,
    });

    expect(resolvedNumbers(updated.doc)).toEqual(['1', '1']);
  });

  it('skips restart-level heading resets when converter context is unavailable', () => {
    const heading = schema.nodes.paragraph.create({
      paragraphProperties: { outlineLvl: 0 },
    });
    const caption1 = p(seq('SEQ Figure \\s 1'));
    const heading2 = schema.nodes.paragraph.create({
      paragraphProperties: { outlineLvl: 0 },
    });
    const caption2 = p(seq('SEQ Figure \\s 1'));
    const doc = schema.nodes.doc.create(null, [heading, caption1, heading2, caption2]);

    const updated = updateDoc(doc);

    expect(resolvedNumbers(updated.doc)).toEqual(['1', '2']);
  });

  it('parses stale attrs from the raw instruction before writing current results', () => {
    const doc = schema.nodes.doc.create(null, [
      p(
        seq('SEQ Figure \\r 7 \\* roman', {
          identifier: 'Stale',
          restartNumber: null,
          format: 'Arabic',
        }),
      ),
    ]);

    const updated = updateDoc(doc);
    const field = updated.doc.nodeAt(1);

    expect(field?.attrs.identifier).toBe('Figure');
    expect(field?.attrs.restartNumber).toBe(7);
    expect(field?.attrs.format).toBe('roman');
    expect(field?.attrs.pageNumberFieldFormat).toEqual({ format: 'lowerRoman' });
    expect(field?.attrs.resolvedNumber).toBe('vii');
  });

  it('handles field arguments conservatively without advancing counters', () => {
    const doc = schema.nodes.doc.create(null, [
      p(seq('SEQ Figure')),
      p(seq('SEQ Figure bookmark', { resolvedNumber: 'cached' })),
      p(seq('SEQ Figure bookmark')),
      p(seq('SEQ Figure')),
    ]);

    const updated = updateDoc(doc);

    expect(resolvedNumbers(updated.doc)).toEqual(['1', 'cached', '1', '2']);
  });
});
