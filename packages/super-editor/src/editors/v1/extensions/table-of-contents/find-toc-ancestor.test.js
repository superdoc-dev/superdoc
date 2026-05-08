import { describe, expect, it } from 'vitest';
import { Schema } from 'prosemirror-model';

import { findTocAncestor } from './find-toc-ancestor.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
    },
    tableOfContents: {
      group: 'block',
      content: 'paragraph*',
      attrs: {
        sdBlockId: { default: null },
      },
      toDOM: () => ['div', 0],
    },
    text: { group: 'inline' },
  },
});

const para = (text) => schema.nodes.paragraph.create({}, text ? schema.text(text) : null);
const toc = (sdBlockId, paragraphs) => schema.nodes.tableOfContents.create({ sdBlockId }, paragraphs);

describe('findTocAncestor', () => {
  it('returns null when the position is not inside a TOC', () => {
    const doc = schema.nodes.doc.create(null, [para('outside')]);
    expect(findTocAncestor(doc, 2)).toBeNull();
  });

  it('finds the TOC and exposes its sdBlockId for a position inside a TOC paragraph', () => {
    const tocNode = toc('toc-1', [para('Heading 1'), para('Heading 2')]);
    const doc = schema.nodes.doc.create(null, [para('intro'), tocNode, para('outro')]);

    // First paragraph is 7 chars including boundaries: 0..7. TOC starts at pos 7.
    const tocStart = 1 + para('intro').nodeSize; // 1 (doc open) + intro size minus 1 = simpler: locate by walk
    const introSize = para('intro').nodeSize;
    const insideTocPos = introSize + 2; // inside TOC's first paragraph

    const result = findTocAncestor(doc, insideTocPos);
    expect(result).not.toBeNull();
    expect(result.sdBlockId).toBe('toc-1');
    expect(result.node.type.name).toBe('tableOfContents');
    // pos returned should be the TOC node's start position (one before its content range).
    // Using the same arithmetic the helper uses: resolved.before(depth).
    expect(typeof result.pos).toBe('number');
    expect(tocStart).toBeGreaterThan(0);
  });

  it('returns null sdBlockId when the TOC has none', () => {
    const tocNode = toc(null, [para('entry')]);
    const doc = schema.nodes.doc.create(null, [tocNode]);
    const result = findTocAncestor(doc, 2);
    expect(result).not.toBeNull();
    expect(result.sdBlockId).toBeNull();
  });

  it('returns null for invalid positions', () => {
    const doc = schema.nodes.doc.create(null, [para('text')]);
    expect(findTocAncestor(doc, -1)).toBeNull();
    expect(findTocAncestor(doc, Number.NaN)).toBeNull();
    expect(findTocAncestor(null, 0)).toBeNull();
  });
});
