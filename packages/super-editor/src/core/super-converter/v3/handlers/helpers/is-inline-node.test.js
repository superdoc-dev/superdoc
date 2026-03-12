import { describe, expect, it } from 'vitest';
import { isInlineNode } from './is-inline-node.js';

describe('isInlineNode', () => {
  it('treats common importer inline nodes as inline without schema metadata', () => {
    expect(isInlineNode({ type: 'text', text: 'x' })).toBe(true);
    expect(isInlineNode({ type: 'run', content: [] })).toBe(true);
    expect(isInlineNode({ type: 'bookmarkStart', attrs: { id: '1' } })).toBe(true);
    expect(isInlineNode({ type: 'bookmarkEnd', attrs: { id: '1' } })).toBe(true);
    expect(isInlineNode({ type: 'tab' })).toBe(true);
    expect(isInlineNode({ type: 'footnoteReference', attrs: { id: '1' } })).toBe(true);
  });

  it('uses nodeType.isInline when available', () => {
    const schema = {
      nodes: {
        mention: { isInline: true, spec: {} },
        table: { isInline: false, spec: {} },
      },
    };

    expect(isInlineNode({ type: 'mention', attrs: { id: 'm1' } }, schema)).toBe(true);
    expect(isInlineNode({ type: 'table', content: [] }, schema)).toBe(false);
  });

  it('falls back to schema group metadata when isInline is unavailable', () => {
    const schema = {
      nodes: {
        customInline: { spec: { group: 'inline custom-inline' } },
        customBlock: { spec: { group: 'block' } },
      },
    };

    expect(isInlineNode({ type: 'customInline' }, schema)).toBe(true);
    expect(isInlineNode({ type: 'customBlock' }, schema)).toBe(false);
  });

  it('returns false for missing or unknown node types', () => {
    expect(isInlineNode(null)).toBe(false);
    expect(isInlineNode({})).toBe(false);
    expect(isInlineNode({ type: 'unknownNode' }, { nodes: {} })).toBe(false);
  });
});
