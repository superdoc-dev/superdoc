import { describe, expect, it } from 'vitest';
import { normalizeGraphicAnchor } from './graphic-placement.js';

describe('normalizeGraphicAnchor', () => {
  it('returns undefined when there is no authored placement data', () => {
    expect(normalizeGraphicAnchor({ anchorData: undefined, attrs: {} })).toBeUndefined();
  });

  it('normalizes shared anchor fields for images, shapes, and charts', () => {
    const anchor = normalizeGraphicAnchor({
      anchorData: {
        hRelativeFrom: 'page',
        vRelativeFrom: 'margin',
        alignH: 'center',
        alignV: 'bottom',
        offsetH: '24',
        offsetV: 48,
        behindDoc: 'true',
      },
      attrs: {},
    });

    expect(anchor).toEqual({
      isAnchored: true,
      hRelativeFrom: 'page',
      vRelativeFrom: 'margin',
      alignH: 'center',
      alignV: 'bottom',
      offsetH: 24,
      offsetV: 48,
      behindDoc: true,
    });
  });

  it('uses marginOffset before anchor offsets and simplePos fallbacks', () => {
    const anchor = normalizeGraphicAnchor({
      anchorData: {
        offsetH: 10,
        offsetV: 20,
      },
      attrs: {
        marginOffset: {
          horizontal: 72,
          top: 36,
        },
        simplePos: {
          x: 1,
          y: 2,
        },
      },
    });

    expect(anchor?.offsetH).toBe(72);
    expect(anchor?.offsetV).toBe(36);
  });

  it('falls back to simplePos when marginOffset and anchor offsets are absent', () => {
    const anchor = normalizeGraphicAnchor({
      anchorData: {},
      attrs: {
        simplePos: {
          x: '12',
          y: '18',
        },
      },
    });

    expect(anchor?.offsetH).toBe(12);
    expect(anchor?.offsetV).toBe(18);
  });

  it('marks placement as anchored when isAnchor is true without anchorData', () => {
    expect(normalizeGraphicAnchor({ anchorData: undefined, attrs: { isAnchor: true } })).toEqual({
      isAnchored: true,
    });
  });

  it('uses wrap and original OOXML behindDoc fallbacks', () => {
    expect(normalizeGraphicAnchor({ anchorData: undefined, attrs: { isAnchor: true }, wrapBehindDoc: true })).toEqual({
      isAnchored: true,
      behindDoc: true,
    });

    expect(
      normalizeGraphicAnchor({
        anchorData: undefined,
        attrs: {
          isAnchor: true,
          originalAttributes: {
            behindDoc: '1',
          },
        },
      }),
    ).toEqual({
      isAnchored: true,
      behindDoc: true,
    });
  });

  it('filters invalid relative anchors and alignments', () => {
    const anchor = normalizeGraphicAnchor({
      anchorData: {
        hRelativeFrom: 'character',
        vRelativeFrom: 'line',
        alignH: 'inside',
        alignV: 'outside',
        offsetH: 4,
      },
      attrs: {},
    });

    expect(anchor).toEqual({
      isAnchored: true,
      offsetH: 4,
    });
  });
});
