import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import {
  extractAuthorityInfo,
  findAllAuthorities,
  resolveAuthorityTarget,
  resolvePostMutationAuthorityId,
} from './authority-resolver.js';

function makeAuthorityDoc(sdBlockId: string | undefined = 'toa-runtime') {
  return {
    descendants: (cb: (node: unknown, pos: number) => boolean | void) => {
      cb(
        {
          type: { name: 'tableOfAuthorities' },
          attrs: { ...(sdBlockId !== undefined ? { sdBlockId } : {}), instruction: 'TOA \\c 1 \\h' },
          childCount: 3,
        },
        11,
      );
      return true;
    },
  } as unknown as ProseMirrorNode;
}

describe('authority-resolver block ids', () => {
  it('uses a deterministic public id while still accepting the session-local sdBlockId', () => {
    const doc = makeAuthorityDoc('toa-runtime');
    const [resolved] = findAllAuthorities(doc);

    expect(resolved.nodeId).toMatch(/^toa-auto-[0-9a-f]{8}$/);
    expect(
      resolveAuthorityTarget(doc, { kind: 'block', nodeType: 'tableOfAuthorities', nodeId: resolved.nodeId }).nodeId,
    ).toBe(resolved.nodeId);
    expect(
      resolveAuthorityTarget(doc, { kind: 'block', nodeType: 'tableOfAuthorities', nodeId: 'toa-runtime' }).nodeId,
    ).toBe(resolved.nodeId);
  });

  it('re-resolves the current public id from an sdBlockId after mutation', () => {
    const doc = makeAuthorityDoc('toa-runtime');
    expect(resolvePostMutationAuthorityId(doc, 'toa-runtime')).toMatch(/^toa-auto-[0-9a-f]{8}$/);
  });

  it('falls back to a deterministic id when sdBlockId is missing', () => {
    const doc = makeAuthorityDoc('');
    const [resolved] = findAllAuthorities(doc);

    expect(resolved.nodeId).toMatch(/^toa-auto-[0-9a-f]{8}$/);
  });

  it('extracts authority info with the public address and parsed instruction', () => {
    const doc = makeAuthorityDoc('toa-runtime');
    const [resolved] = findAllAuthorities(doc);

    expect(extractAuthorityInfo(resolved)).toEqual({
      address: { kind: 'block', nodeType: 'tableOfAuthorities', nodeId: resolved.nodeId },
      config: {
        category: 1,
        includeHeadings: true,
      },
      entryCount: 3,
      instruction: 'TOA \\c 1 \\h',
    });
  });
});
