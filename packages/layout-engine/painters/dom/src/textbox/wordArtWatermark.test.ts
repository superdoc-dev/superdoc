import { describe, expect, it } from 'vitest';
import type { DrawingBlock } from '@superdoc/contracts';
import { isWordArtTextboxWatermarkBlock } from './wordArtWatermark.js';

describe('isWordArtTextboxWatermarkBlock', () => {
  const createWatermarkBlock = (overrides: Partial<DrawingBlock> = {}): DrawingBlock => ({
    kind: 'drawing',
    id: 'wordart-watermark',
    drawingKind: 'vectorShape',
    geometry: { width: 200, height: 60 },
    shapeKind: 'rect',
    fillColor: null,
    strokeColor: null,
    anchor: {
      isAnchored: true,
      hRelativeFrom: 'page',
      alignH: 'center',
      vRelativeFrom: 'page',
      alignV: 'center',
    },
    wrap: { type: 'None' },
    textContent: {
      parts: [{ text: 'AUTE' }],
    },
    attrs: { isWordArt: true, isTextBox: true },
    ...overrides,
  });

  it('detects centered anchored page-relative WordArt textboxes with no wrapping', () => {
    expect(isWordArtTextboxWatermarkBlock(createWatermarkBlock())).toBe(true);
  });

  it('rejects blocks without the WordArt textbox shape requirements', () => {
    expect(isWordArtTextboxWatermarkBlock(undefined)).toBe(false);
    expect(isWordArtTextboxWatermarkBlock(createWatermarkBlock({ drawingKind: 'image' }))).toBe(false);
    expect(isWordArtTextboxWatermarkBlock(createWatermarkBlock({ attrs: { isTextBox: true } }))).toBe(false);
    expect(isWordArtTextboxWatermarkBlock(createWatermarkBlock({ attrs: { isWordArt: true } }))).toBe(false);
    expect(isWordArtTextboxWatermarkBlock(createWatermarkBlock({ textContent: { parts: [] } }))).toBe(false);
  });

  it('rejects blocks that are not anchored page-centered no-wrap watermarks', () => {
    expect(isWordArtTextboxWatermarkBlock(createWatermarkBlock({ anchor: { isAnchored: false } }))).toBe(false);
    expect(
      isWordArtTextboxWatermarkBlock(
        createWatermarkBlock({ anchor: { isAnchored: true, hRelativeFrom: 'margin', alignH: 'center' } }),
      ),
    ).toBe(false);
    expect(
      isWordArtTextboxWatermarkBlock(
        createWatermarkBlock({ anchor: { isAnchored: true, hRelativeFrom: 'page', alignH: 'left' } }),
      ),
    ).toBe(false);
    expect(
      isWordArtTextboxWatermarkBlock(
        createWatermarkBlock({ anchor: { isAnchored: true, vRelativeFrom: 'margin', alignV: 'center' } }),
      ),
    ).toBe(false);
    expect(
      isWordArtTextboxWatermarkBlock(
        createWatermarkBlock({ anchor: { isAnchored: true, vRelativeFrom: 'page', alignV: 'top' } }),
      ),
    ).toBe(false);
    expect(isWordArtTextboxWatermarkBlock(createWatermarkBlock({ wrap: { type: 'Square' } }))).toBe(false);
  });
});
