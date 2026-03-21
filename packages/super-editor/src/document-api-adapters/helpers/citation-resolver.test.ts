import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import {
  extractBibliographyInfo,
  findAllBibliographies,
  resolveBibliographyTarget,
  resolvePostMutationBibliographyId,
} from './citation-resolver.js';

function makeBibliographyDoc(sdBlockId: string | undefined = 'bib-runtime', style = 'APA') {
  return {
    descendants: (cb: (node: unknown, pos: number) => boolean | void) => {
      cb(
        {
          type: { name: 'bibliography' },
          attrs: { ...(sdBlockId !== undefined ? { sdBlockId } : {}), instruction: 'BIBLIOGRAPHY', style },
          childCount: 2,
        },
        9,
      );
      return true;
    },
  } as unknown as ProseMirrorNode;
}

describe('citation-resolver bibliography ids', () => {
  it('uses a deterministic public id while still accepting the session-local sdBlockId', () => {
    const doc = makeBibliographyDoc('bib-runtime');
    const [resolved] = findAllBibliographies(doc);

    expect(resolved.nodeId).toMatch(/^bibliography-auto-[0-9a-f]{8}$/);
    expect(
      resolveBibliographyTarget(doc, { kind: 'block', nodeType: 'bibliography', nodeId: resolved.nodeId }).nodeId,
    ).toBe(resolved.nodeId);
    expect(
      resolveBibliographyTarget(doc, { kind: 'block', nodeType: 'bibliography', nodeId: 'bib-runtime' }).nodeId,
    ).toBe(resolved.nodeId);
  });

  it('re-resolves the current public id from an sdBlockId after mutation', () => {
    const doc = makeBibliographyDoc('bib-runtime');
    expect(resolvePostMutationBibliographyId(doc, 'bib-runtime')).toMatch(/^bibliography-auto-[0-9a-f]{8}$/);
  });

  it('falls back to a deterministic id when sdBlockId is missing', () => {
    const doc = makeBibliographyDoc('');
    const [resolved] = findAllBibliographies(doc);

    expect(resolved.nodeId).toMatch(/^bibliography-auto-[0-9a-f]{8}$/);
  });

  it('extracts bibliography info with the public address and persisted style', () => {
    const doc = makeBibliographyDoc('bib-runtime', 'MLA');
    const [resolved] = findAllBibliographies(doc);

    expect(extractBibliographyInfo(resolved)).toEqual({
      address: { kind: 'block', nodeType: 'bibliography', nodeId: resolved.nodeId },
      instruction: 'BIBLIOGRAPHY',
      sourceCount: 2,
      style: 'MLA',
    });
  });
});
