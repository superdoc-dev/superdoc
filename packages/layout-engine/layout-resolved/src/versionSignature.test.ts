import { describe, expect, it } from 'vitest';
import { deriveBlockVersion, sourceAnchorSignature } from './versionSignature.js';
import type { FlowBlock, ImageRun, SourceAnchor, TextRun } from '@superdoc/contracts';

describe('sourceAnchorSignature', () => {
  it('is stable for equivalent source anchors with different object key order', () => {
    const anchorA: SourceAnchor = {
      sourceNodeId: 'srcnode_1',
      occurrenceId: 'occ_1',
      schemaQNames: [{ qName: 'w:p', namespaceUri: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main' }],
      sourceRef: {
        partUri: 'word/document.xml',
        xpathLikePath: '/w:document[1]/w:body[1]/w:p[1]',
      },
      anchorConfidence: 'high',
    };
    const anchorB: SourceAnchor = {
      anchorConfidence: 'high',
      sourceRef: {
        xpathLikePath: '/w:document[1]/w:body[1]/w:p[1]',
        partUri: 'word/document.xml',
      },
      schemaQNames: [{ namespaceUri: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', qName: 'w:p' }],
      occurrenceId: 'occ_1',
      sourceNodeId: 'srcnode_1',
    };

    expect(sourceAnchorSignature(anchorA)).toBe(sourceAnchorSignature(anchorB));
  });
});

describe('deriveBlockVersion - bidi', () => {
  const makeParagraph = (bidi?: TextRun['bidi']): FlowBlock => ({
    kind: 'paragraph',
    id: 'p1',
    attrs: { directionContext: { inlineDirection: 'rtl', writingMode: 'horizontal-tb' } },
    runs: [
      {
        text: '23.03.2026',
        fontFamily: 'David, sans-serif',
        fontSize: 16,
        pmStart: 1,
        pmEnd: 11,
        ...(bidi ? { bidi } : {}),
      } as TextRun,
    ],
  });

  // SD-3098: flipping only run.bidi must invalidate the cached block hash,
  // otherwise an edit that toggles <w:rtl/> reuses stale DOM in DomPainter.
  it('produces a different version when bidi.rtl is added', () => {
    const versionPlain = deriveBlockVersion(makeParagraph());
    const versionRtl = deriveBlockVersion(makeParagraph({ rtl: true }));
    expect(versionRtl).not.toBe(versionPlain);
  });

  it('produces a different version for bidi.rtl=true vs bidi.rtl=false', () => {
    const versionTrue = deriveBlockVersion(makeParagraph({ rtl: true }));
    const versionFalse = deriveBlockVersion(makeParagraph({ rtl: false }));
    expect(versionTrue).not.toBe(versionFalse);
  });

  it('is stable when bidi is identical', () => {
    const a = deriveBlockVersion(makeParagraph({ rtl: true }));
    const b = deriveBlockVersion(makeParagraph({ rtl: true }));
    expect(a).toBe(b);
  });
});

describe('deriveBlockVersion - inline image runs', () => {
  const makeParagraphWithImage = (overrides: Partial<ImageRun> = {}): FlowBlock => ({
    kind: 'paragraph',
    id: 'p-image',
    runs: [
      {
        kind: 'image',
        src: 'img.png',
        width: 100,
        height: 50,
        ...overrides,
      },
    ],
  });

  it('produces a different version when inline image SDT metadata changes', () => {
    const plain = deriveBlockVersion(makeParagraphWithImage());
    const locked = deriveBlockVersion(
      makeParagraphWithImage({
        sdt: {
          type: 'structuredContent',
          scope: 'inline',
          id: 'image-sdt',
          lockMode: 'contentLocked',
        },
      }),
    );

    expect(locked).not.toBe(plain);
  });

  it('produces a different version when inline image data attributes change', () => {
    const plain = deriveBlockVersion(makeParagraphWithImage());
    const withDataAttrs = deriveBlockVersion(makeParagraphWithImage({ dataAttrs: { 'data-example': '1' } }));

    expect(withDataAttrs).not.toBe(plain);
  });

  it('produces a different version when inline image paint metadata changes', () => {
    const plain = deriveBlockVersion(makeParagraphWithImage());
    const withPaintMetadata = deriveBlockVersion(
      makeParagraphWithImage({
        verticalAlign: 'top',
        rotation: 90,
        flipH: true,
        gain: '50000',
        blacklevel: '20000',
        grayscale: true,
        lum: { bright: 10000, contrast: -10000 },
        hyperlink: { url: 'https://example.com', tooltip: 'Example' },
      }),
    );

    expect(withPaintMetadata).not.toBe(plain);
  });
});
