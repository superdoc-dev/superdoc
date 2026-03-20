import { describe, expect, it } from 'vitest';
import { resolvePublicReferenceBlockNodeId } from './reference-block-node-id.js';

function fakeNode(typeName: string) {
  return {
    type: { name: typeName },
    attrs: {},
  } as const;
}

describe('reference-block-node-id', () => {
  it('prefers sdBlockId for bibliography nodes when present', () => {
    const node = {
      type: { name: 'bibliography' },
      attrs: { sdBlockId: 'bib-runtime' },
    } as const;
    expect(resolvePublicReferenceBlockNodeId(node as never, 8)).toBe('bib-runtime');
    expect(resolvePublicReferenceBlockNodeId(node as never, 80)).toBe('bib-runtime');
  });

  it('builds deterministic public ids for bibliography nodes when sdBlockId is missing', () => {
    const node = fakeNode('bibliography');
    const a = resolvePublicReferenceBlockNodeId(node as never, 8);
    const b = resolvePublicReferenceBlockNodeId(node as never, 8);
    expect(a).toBe(b);
    expect(a).toMatch(/^bibliography-auto-[0-9a-f]{8}$/);
  });

  it('builds deterministic public ids for index nodes when sdBlockId is missing', () => {
    const node = fakeNode('documentIndex');
    const a = resolvePublicReferenceBlockNodeId(node as never, 12);
    const b = resolvePublicReferenceBlockNodeId(node as never, 12);
    expect(a).toBe(b);
    expect(a).toMatch(/^index-auto-[0-9a-f]{8}$/);
  });

  it('builds deterministic public ids for table of authorities nodes when sdBlockId is missing', () => {
    const node = fakeNode('tableOfAuthorities');
    const a = resolvePublicReferenceBlockNodeId(node as never, 20);
    const b = resolvePublicReferenceBlockNodeId(node as never, 20);
    expect(a).toBe(b);
    expect(a).toMatch(/^toa-auto-[0-9a-f]{8}$/);
  });

  it('changes the fallback id when the document position changes', () => {
    const node = fakeNode('bibliography');
    expect(resolvePublicReferenceBlockNodeId(node as never, 5)).not.toBe(
      resolvePublicReferenceBlockNodeId(node as never, 6),
    );
  });
});
