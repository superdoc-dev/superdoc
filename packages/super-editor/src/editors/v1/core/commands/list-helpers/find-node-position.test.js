import { describe, it, expect } from 'vitest';
import { Schema } from 'prosemirror-model';
import { findNodePosition } from './find-node-position.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'text*', group: 'block' },
    text: { group: 'inline' },
  },
});

describe('findNodePosition', () => {
  it('returns the position of a direct child', () => {
    const p1 = schema.nodes.paragraph.create(null, schema.text('hello'));
    const p2 = schema.nodes.paragraph.create(null, schema.text('world'));
    const doc = schema.nodes.doc.create(null, [p1, p2]);

    const pos1 = findNodePosition(doc, p1);
    const pos2 = findNodePosition(doc, p2);

    expect(pos1).toBe(0); // first block starts at pos 0
    expect(pos2).toBe(p1.nodeSize); // second block starts after first
  });

  it('returns the position of a nested text node', () => {
    const textNode = schema.text('abc');
    const para = schema.nodes.paragraph.create(null, textNode);
    const doc = schema.nodes.doc.create(null, para);

    const paraPos = findNodePosition(doc, para);
    const textPos = findNodePosition(doc, textNode);

    expect(paraPos).toBe(0);
    expect(textPos).toBe(1); // text starts inside paragraph
  });

  it('returns null if the node is not in the document', () => {
    const doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create());
    const foreignNode = schema.nodes.paragraph.create();

    const pos = findNodePosition(doc, foreignNode);

    expect(pos).toBeNull();
  });
});
