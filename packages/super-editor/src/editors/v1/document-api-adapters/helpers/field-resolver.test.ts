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
  },
});

function createDocWithSectionPageCount(attrs: Record<string, unknown>, text?: string): ProseMirrorNode {
  const content = text ? schema.text(text) : undefined;
  const field = schema.nodes['section-page-count'].create(attrs, content);
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
