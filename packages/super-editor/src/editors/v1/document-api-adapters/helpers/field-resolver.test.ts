import { describe, expect, it } from 'vitest';
import { Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import { findAllFields } from './field-resolver.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: { sdBlockId: { default: null } },
    },
    text: { group: 'inline' },
    'section-page-count': {
      group: 'inline',
      inline: true,
      atom: true,
      content: 'text*',
      attrs: {
        instruction: { default: null },
        importedCachedText: { default: null },
        resolvedText: { default: null },
      },
    },
    'total-page-number': {
      group: 'inline',
      inline: true,
      atom: true,
      content: 'text*',
      attrs: {
        instruction: { default: null },
        importedCachedText: { default: null },
        resolvedText: { default: null },
      },
    },
    sequenceField: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: {
        instruction: { default: '' },
        identifier: { default: '' },
        resolvedNumber: { default: '' },
      },
    },
  },
});

function createDocWithSectionPageCount(attrs: Record<string, unknown>, text?: string): ProseMirrorNode {
  const content = text ? schema.text(text) : undefined;
  const field = schema.nodes['section-page-count'].create(attrs, content);
  const paragraph = schema.nodes.paragraph.create({ sdBlockId: 'block-1' }, field);
  return schema.nodes.doc.create(null, paragraph);
}

function createDocWithTotalPageNumber(attrs: Record<string, unknown>, text?: string): ProseMirrorNode {
  const content = text ? schema.text(text) : undefined;
  const field = schema.nodes['total-page-number'].create(attrs, content);
  const paragraph = schema.nodes.paragraph.create({ sdBlockId: 'block-1' }, field);
  return schema.nodes.doc.create(null, paragraph);
}

describe('field-resolver synthetic section page count fields', () => {
  it('discovers section-page-count as SECTIONPAGES with imported instruction', () => {
    const doc = createDocWithSectionPageCount({ instruction: 'SECTIONPAGES \\* roman' }, 'iii');

    expect(findAllFields(doc)).toEqual([
      {
        pos: 1,
        blockId: 'block-1',
        occurrenceIndex: 0,
        nestingDepth: 0,
        instruction: 'SECTIONPAGES \\* roman',
        fieldType: 'SECTIONPAGES',
        resolvedText: 'iii',
      },
    ]);
  });

  it('falls back to plain SECTIONPAGES and imported cached text', () => {
    const doc = createDocWithSectionPageCount({ importedCachedText: '4' });

    expect(findAllFields(doc)).toEqual([
      {
        pos: 1,
        blockId: 'block-1',
        occurrenceIndex: 0,
        nestingDepth: 0,
        instruction: 'SECTIONPAGES',
        fieldType: 'SECTIONPAGES',
        resolvedText: '4',
      },
    ]);
  });
});

describe('field-resolver synthetic total page number fields', () => {
  it('discovers total-page-number with imported switched instruction', () => {
    const doc = createDocWithTotalPageNumber({ instruction: 'NUMPAGES \\# "#,##0"', resolvedText: '1,234' });

    expect(findAllFields(doc)).toEqual([
      {
        pos: 1,
        blockId: 'block-1',
        occurrenceIndex: 0,
        nestingDepth: 0,
        instruction: 'NUMPAGES \\# "#,##0"',
        fieldType: 'NUMPAGES',
        resolvedText: '1,234',
      },
    ]);
  });
});

describe('field-resolver sequence fields', () => {
  it('uses sequenceField.resolvedNumber as resolvedText', () => {
    const field = schema.nodes.sequenceField.create({
      instruction: 'SEQ Figure \\* ARABIC',
      identifier: 'Figure',
      resolvedNumber: '2',
    });
    const paragraph = schema.nodes.paragraph.create({ sdBlockId: 'block-seq' }, field);
    const doc = schema.nodes.doc.create(null, paragraph);

    expect(findAllFields(doc)).toContainEqual({
      pos: 1,
      blockId: 'block-seq',
      occurrenceIndex: 0,
      nestingDepth: 0,
      instruction: 'SEQ Figure \\* ARABIC',
      fieldType: 'SEQ',
      resolvedText: '2',
    });
  });
});
