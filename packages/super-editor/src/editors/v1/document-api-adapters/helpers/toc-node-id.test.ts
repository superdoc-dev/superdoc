import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { buildFallbackTocNodeId, resolvePublicTocNodeId } from './toc-node-id.js';

function fakeNode(attrs: Record<string, unknown> = {}): ProseMirrorNode {
  return { attrs } as unknown as ProseMirrorNode;
}

describe('buildFallbackTocNodeId', () => {
  it('returns a deterministic id for the same pos and instruction', () => {
    const node = fakeNode({ instruction: 'TOC \\o "1-3"' });
    const a = buildFallbackTocNodeId(node, 5);
    const b = buildFallbackTocNodeId(node, 5);
    expect(a).toBe(b);
  });

  it('produces different ids for different positions', () => {
    const node = fakeNode({ instruction: 'TOC \\o "1-3"' });
    const a = buildFallbackTocNodeId(node, 0);
    const b = buildFallbackTocNodeId(node, 10);
    expect(a).not.toBe(b);
  });

  it('produces different ids for different instructions', () => {
    const a = buildFallbackTocNodeId(fakeNode({ instruction: 'TOC \\o "1-3"' }), 0);
    const b = buildFallbackTocNodeId(fakeNode({ instruction: 'TOC \\o "1-2"' }), 0);
    expect(a).not.toBe(b);
  });

  it('handles empty instruction', () => {
    const id = buildFallbackTocNodeId(fakeNode({ instruction: '' }), 0);
    expect(id).toMatch(/^toc-auto-[0-9a-f]{8}$/);
  });

  it('handles missing instruction attribute', () => {
    const id = buildFallbackTocNodeId(fakeNode({}), 0);
    expect(id).toMatch(/^toc-auto-[0-9a-f]{8}$/);
  });

  it('treats missing and empty instruction identically', () => {
    const a = buildFallbackTocNodeId(fakeNode({}), 5);
    const b = buildFallbackTocNodeId(fakeNode({ instruction: '' }), 5);
    expect(a).toBe(b);
  });
});

describe('resolvePublicTocNodeId', () => {
  it('ignores sdBlockId so ids stay stable across stateless re-opens', () => {
    const a = resolvePublicTocNodeId(fakeNode({ sdBlockId: 'runtime-a', instruction: 'TOC \\o "1-3"' }), 7);
    const b = resolvePublicTocNodeId(fakeNode({ sdBlockId: 'runtime-b', instruction: 'TOC \\o "1-3"' }), 7);
    expect(a).toBe(b);
  });

  it('returns deterministic id when sdBlockId is missing', () => {
    const node = fakeNode({ instruction: 'TOC \\o "1-3"' });
    expect(resolvePublicTocNodeId(node, 0)).toMatch(/^toc-auto-/);
  });

  it('returns deterministic id when sdBlockId is empty string', () => {
    const node = fakeNode({ sdBlockId: '', instruction: 'TOC \\o "1-3"' });
    expect(resolvePublicTocNodeId(node, 0)).toMatch(/^toc-auto-/);
  });

  it('returns deterministic id when sdBlockId is null', () => {
    const node = fakeNode({ sdBlockId: null, instruction: 'TOC \\o "1-3"' });
    expect(resolvePublicTocNodeId(node, 0)).toMatch(/^toc-auto-/);
  });
});
