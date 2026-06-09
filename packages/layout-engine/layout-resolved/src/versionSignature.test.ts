import { describe, expect, it } from 'vitest';
import { deriveBlockVersion, sourceAnchorSignature } from './versionSignature.js';
import type { FlowBlock, ImageBlock, ImageRun, SourceAnchor, TableBlock, TabRun, TextRun } from '@superdoc/contracts';

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

describe('deriveBlockVersion - tab underline', () => {
  const makeTabParagraph = (underline?: { style?: string; color?: string }): FlowBlock => ({
    kind: 'paragraph',
    id: 'p1',
    attrs: {},
    runs: [{ kind: 'tab', text: '\t', pmStart: 1, pmEnd: 2, ...(underline ? { underline } : {}) } as TabRun],
  });

  // SD-3330: toggling underline on a tab must change the block version, otherwise the
  // DomPainter reuses the cached (non-underlined) fragment and the underline does not
  // appear until an unrelated edit forces a rebuild.
  it('produces a different version when a tab gains an underline', () => {
    const plain = deriveBlockVersion(makeTabParagraph());
    const underlined = deriveBlockVersion(makeTabParagraph({ style: 'single', color: '#000000' }));
    expect(underlined).not.toBe(plain);
  });

  it('produces a different version when the tab underline color changes', () => {
    const black = deriveBlockVersion(makeTabParagraph({ style: 'single', color: '#000000' }));
    const red = deriveBlockVersion(makeTabParagraph({ style: 'single', color: '#FF0000' }));
    expect(red).not.toBe(black);
  });

  it('is stable when the tab underline is identical', () => {
    const a = deriveBlockVersion(makeTabParagraph({ style: 'single', color: '#000000' }));
    const b = deriveBlockVersion(makeTabParagraph({ style: 'single', color: '#000000' }));
    expect(a).toBe(b);
  });

  // SD-3330: the painter's tab underline thickness comes from fontSize, and its offset/color
  // come from measured line metrics fed by fontFamily and the run color. Each must change the
  // block version, or a font-size/family/color edit leaves a stale tab underline cached.
  const makeStyledTabParagraph = (
    overrides: Partial<{ fontSize: number; fontFamily: string; color: string; bold: boolean; italic: boolean }>,
  ): FlowBlock => ({
    kind: 'paragraph',
    id: 'p1',
    attrs: {},
    runs: [
      {
        kind: 'tab',
        text: '\t',
        pmStart: 1,
        pmEnd: 2,
        underline: { style: 'single', color: '#000000' },
        ...overrides,
      } as TabRun,
    ],
  });

  it('produces a different version when the tab fontSize changes', () => {
    const small = deriveBlockVersion(makeStyledTabParagraph({ fontSize: 12 }));
    const large = deriveBlockVersion(makeStyledTabParagraph({ fontSize: 24 }));
    expect(large).not.toBe(small);
  });

  it('produces a different version when the tab fontFamily changes', () => {
    const arial = deriveBlockVersion(makeStyledTabParagraph({ fontFamily: 'Arial' }));
    const times = deriveBlockVersion(makeStyledTabParagraph({ fontFamily: 'Times New Roman' }));
    expect(times).not.toBe(arial);
  });

  it('produces a different version when the tab run color changes', () => {
    const black = deriveBlockVersion(makeStyledTabParagraph({ color: '#000000' }));
    const red = deriveBlockVersion(makeStyledTabParagraph({ color: '#FF0000' }));
    expect(red).not.toBe(black);
  });

  // SD-3330 review: tab-only line metrics now come from the tab's font via getFontInfoFromRun, which
  // feeds bold/italic into the measured ascent/descent, so toggling them must change the version.
  it('produces a different version when the tab bold changes', () => {
    const plain = deriveBlockVersion(makeStyledTabParagraph({ bold: false }));
    const bold = deriveBlockVersion(makeStyledTabParagraph({ bold: true }));
    expect(bold).not.toBe(plain);
  });

  it('produces a different version when the tab italic changes', () => {
    const plain = deriveBlockVersion(makeStyledTabParagraph({ italic: false }));
    const italic = deriveBlockVersion(makeStyledTabParagraph({ italic: true }));
    expect(italic).not.toBe(plain);
  });

  it('is stable when tab fontSize, fontFamily and color are identical', () => {
    const a = deriveBlockVersion(makeStyledTabParagraph({ fontSize: 16, fontFamily: 'Arial', color: '#123456' }));
    const b = deriveBlockVersion(makeStyledTabParagraph({ fontSize: 16, fontFamily: 'Arial', color: '#123456' }));
    expect(a).toBe(b);
  });
});

describe('deriveBlockVersion - table image content', () => {
  const makeTableWithImage = (image: ImageBlock): TableBlock => ({
    kind: 'table',
    id: 'table-with-image',
    rows: [
      {
        id: 'row-1',
        cells: [
          {
            id: 'cell-1',
            blocks: [image],
          },
        ],
      },
    ],
  });

  const baseImage: ImageBlock = {
    kind: 'image',
    id: 'image-1',
    src: 'data:image/png;base64,AAA',
    width: 40,
    height: 20,
  };

  it('changes when a table image filter changes', () => {
    const plain = deriveBlockVersion(makeTableWithImage(baseImage));
    const filtered = deriveBlockVersion(makeTableWithImage({ ...baseImage, grayscale: true }));

    expect(filtered).not.toBe(plain);
  });

  it('changes when a table image hyperlink changes', () => {
    const unlinked = deriveBlockVersion(makeTableWithImage(baseImage));
    const linked = deriveBlockVersion(
      makeTableWithImage({
        ...baseImage,
        hyperlink: { url: 'https://example.com/image', tooltip: 'Open image' },
      }),
    );

    expect(linked).not.toBe(unlinked);
  });

  it('does not collide when image hyperlink URL and tooltip contain separators', () => {
    const first = deriveBlockVersion(
      makeTableWithImage({
        ...baseImage,
        hyperlink: { url: 'https://example.com/a', tooltip: 'b:c' },
      }),
    );
    const second = deriveBlockVersion(
      makeTableWithImage({
        ...baseImage,
        hyperlink: { url: 'https://example.com/a:b', tooltip: 'c' },
      }),
    );

    expect(second).not.toBe(first);
  });
});

describe('deriveBlockVersion - inline image runs', () => {
  const baseImageRun: ImageRun = {
    kind: 'image',
    src: 'data:image/png;base64,AAA',
    width: 40,
    height: 20,
  };

  const makeParagraphWithImageRun = (image: ImageRun): FlowBlock => ({
    kind: 'paragraph',
    id: 'paragraph-with-image-run',
    runs: [image],
  });

  const makeTableWithImageRun = (image: ImageRun): TableBlock => ({
    kind: 'table',
    id: 'table-with-inline-image-run',
    rows: [
      {
        id: 'row-1',
        cells: [
          {
            id: 'cell-1',
            blocks: [makeParagraphWithImageRun(image)],
          },
        ],
      },
    ],
  });

  it('changes when an inline image filter changes', () => {
    const plain = deriveBlockVersion(makeParagraphWithImageRun(baseImageRun));
    const filtered = deriveBlockVersion(
      makeParagraphWithImageRun({ ...baseImageRun, grayscale: true, lum: { bright: 25000 } }),
    );

    expect(filtered).not.toBe(plain);
  });

  it('changes when an inline image transform changes', () => {
    const plain = deriveBlockVersion(makeParagraphWithImageRun(baseImageRun));
    const transformed = deriveBlockVersion(makeParagraphWithImageRun({ ...baseImageRun, rotation: 45, flipH: true }));

    expect(transformed).not.toBe(plain);
  });

  it('changes when an inline image hyperlink changes', () => {
    const unlinked = deriveBlockVersion(makeParagraphWithImageRun(baseImageRun));
    const linked = deriveBlockVersion(
      makeParagraphWithImageRun({ ...baseImageRun, hyperlink: { url: 'https://example.com/inline-image' } }),
    );

    expect(linked).not.toBe(unlinked);
  });

  it('changes when inline image SDT metadata changes', () => {
    const plain = deriveBlockVersion(makeParagraphWithImageRun(baseImageRun));
    const locked = deriveBlockVersion(
      makeParagraphWithImageRun({
        ...baseImageRun,
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

  it('changes when inline image data attributes change', () => {
    const plain = deriveBlockVersion(makeParagraphWithImageRun(baseImageRun));
    const withDataAttrs = deriveBlockVersion(
      makeParagraphWithImageRun({ ...baseImageRun, dataAttrs: { 'data-example': '1' } }),
    );

    expect(withDataAttrs).not.toBe(plain);
  });

  it('changes when an inline image raw clip path changes', () => {
    const clipA = { ...baseImageRun, clipPath: 'url(#clip-a)' };
    const clipB = { ...baseImageRun, clipPath: 'url(#clip-b)' };

    expect(deriveBlockVersion(makeParagraphWithImageRun(clipA))).not.toBe(
      deriveBlockVersion(makeParagraphWithImageRun(clipB)),
    );
    expect(deriveBlockVersion(makeTableWithImageRun(clipA))).not.toBe(deriveBlockVersion(makeTableWithImageRun(clipB)));
  });

  it('changes when a table-cell inline image visual property changes', () => {
    const plain = deriveBlockVersion(makeTableWithImageRun(baseImageRun));
    const filtered = deriveBlockVersion(makeTableWithImageRun({ ...baseImageRun, grayscale: true }));
    const linked = deriveBlockVersion(
      makeTableWithImageRun({ ...baseImageRun, hyperlink: { url: 'https://example.com/table-inline-image' } }),
    );

    expect(filtered).not.toBe(plain);
    expect(linked).not.toBe(plain);
  });
});
