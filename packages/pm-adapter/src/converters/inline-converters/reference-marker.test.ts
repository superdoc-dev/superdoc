import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TextRun } from '@superdoc/contracts';
import type { PMMark, PMNode, PositionMap } from '../../types.js';
import type { InlineConverterParams } from './common.js';
import { SUBSCRIPT_SUPERSCRIPT_SCALE } from '../../constants.js';

vi.mock('./text-run.js', () => ({
  textNodeToRun: vi.fn(
    (params: InlineConverterParams): TextRun => ({
      text: params.node.text || '',
      fontFamily: params.defaultFont,
      fontSize: params.defaultSize,
    }),
  ),
}));

import { buildReferenceMarkerRun } from './reference-marker.js';
import { textNodeToRun } from './text-run.js';

const DEFAULT_FONT_SIZE = 16;

function makeParams(overrides: Partial<InlineConverterParams> = {}): InlineConverterParams {
  const node: PMNode = { type: 'footnoteReference', attrs: { id: '1' } };
  const positions: PositionMap = new WeakMap();

  return {
    node,
    positions,
    defaultFont: 'Calibri',
    defaultSize: DEFAULT_FONT_SIZE,
    inheritedMarks: [],
    sdtMetadata: undefined,
    hyperlinkConfig: { enableRichHyperlinks: false },
    themeColors: undefined,
    runProperties: undefined,
    paragraphProperties: undefined,
    converterContext: {} as InlineConverterParams['converterContext'],
    enableComments: false,
    visitNode: vi.fn(),
    bookmarks: undefined,
    tabOrdinal: 0,
    paragraphAttrs: {},
    nextBlockId: vi.fn(),
    ...overrides,
  } as InlineConverterParams;
}

describe('buildReferenceMarkerRun', () => {
  beforeEach(() => {
    vi.mocked(textNodeToRun).mockReset();
    vi.mocked(textNodeToRun).mockImplementation(
      (params: InlineConverterParams): TextRun => ({
        text: params.node.text || '',
        fontFamily: params.defaultFont,
        fontSize: params.defaultSize,
      }),
    );
  });

  it('emits plain digit text, not Unicode superscript glyphs', () => {
    const run = buildReferenceMarkerRun('1', makeParams());

    expect(run.text).toBe('1');
    expect(run.text).not.toBe('¹');
  });

  it('normalizes the default path to exactly one superscript treatment', () => {
    const run = buildReferenceMarkerRun('1', makeParams());

    expect(run.vertAlign).toBe('superscript');
    expect(run.baselineShift).toBeUndefined();
    expect(run.fontSize).toBe(DEFAULT_FONT_SIZE * SUBSCRIPT_SUPERSCRIPT_SCALE);
  });

  it('scales from the effective surrounding run size, not the paragraph default', () => {
    vi.mocked(textNodeToRun)
      .mockReturnValueOnce({
        text: '1',
        fontFamily: 'Calibri',
        fontSize: 16,
        vertAlign: 'superscript',
      })
      .mockReturnValueOnce({
        text: '1',
        fontFamily: 'Calibri',
        fontSize: 24,
      });

    const run = buildReferenceMarkerRun('1', makeParams({ defaultSize: 16 }));

    expect(run.fontSize).toBe(24 * SUBSCRIPT_SUPERSCRIPT_SCALE);
  });

  it('preserves explicit baseline shifts instead of forcing the default superscript path', () => {
    vi.mocked(textNodeToRun).mockReturnValueOnce({
      text: '1',
      fontFamily: 'Calibri',
      fontSize: 18,
      baselineShift: 3,
      vertAlign: 'superscript',
    });

    const run = buildReferenceMarkerRun('1', makeParams());

    expect(run.fontSize).toBe(18);
    expect(run.baselineShift).toBe(3);
    expect(vi.mocked(textNodeToRun)).toHaveBeenCalledTimes(1);
  });

  it('treats a zero baselineShift as identity and still normalizes the marker', () => {
    vi.mocked(textNodeToRun)
      .mockReturnValueOnce({
        text: '1',
        fontFamily: 'Calibri',
        fontSize: 18,
        baselineShift: 0,
        vertAlign: 'superscript',
      })
      .mockReturnValueOnce({
        text: '1',
        fontFamily: 'Calibri',
        fontSize: 24,
      });

    const run = buildReferenceMarkerRun('1', makeParams());

    expect(run.vertAlign).toBe('superscript');
    expect(run.baselineShift).toBeUndefined();
    expect(run.fontSize).toBe(24 * SUBSCRIPT_SUPERSCRIPT_SCALE);
    expect(vi.mocked(textNodeToRun)).toHaveBeenCalledTimes(2);
  });

  it('preserves inherited styling from the original run context', () => {
    vi.mocked(textNodeToRun)
      .mockReturnValueOnce({
        text: '1',
        fontFamily: 'Arial',
        fontSize: 20,
        color: '#FF0000',
      })
      .mockReturnValueOnce({
        text: '1',
        fontFamily: 'Arial',
        fontSize: 20,
      });

    const run = buildReferenceMarkerRun('1', makeParams());

    expect(run.fontFamily).toBe('Arial');
    expect(run.color).toBe('#FF0000');
  });

  it('copies PM positions from the reference node, not the synthetic text node', () => {
    const node: PMNode = { type: 'footnoteReference', attrs: { id: '1' } };
    const positions: PositionMap = new WeakMap();
    positions.set(node, { start: 42, end: 43 });

    const run = buildReferenceMarkerRun('1', makeParams({ node, positions }));

    expect(run.pmStart).toBe(42);
    expect(run.pmEnd).toBe(43);
  });

  it('removes only vertical-positioning state from the normalization pass', () => {
    const nodeMarks: PMMark[] = [
      {
        type: 'textStyle',
        attrs: {
          fontFamily: 'Arial',
          fontSize: '22pt',
          vertAlign: 'superscript',
          position: '3pt',
        },
      },
    ];
    const inheritedMarks: PMMark[] = [
      {
        type: 'textStyle',
        attrs: {
          color: '#FF0000',
          vertAlign: 'superscript',
          position: '2pt',
        },
      },
    ];

    buildReferenceMarkerRun(
      '1',
      makeParams({
        node: { type: 'footnoteReference', attrs: { id: '1' }, marks: nodeMarks },
        inheritedMarks,
        runProperties: {
          fontSize: 44,
          fontFamily: { ascii: 'Arial' },
          vertAlign: 'superscript',
          position: 6,
        },
      }),
    );

    const normalizationPass = vi.mocked(textNodeToRun).mock.calls[1]?.[0];
    expect(normalizationPass).toBeDefined();
    expect(normalizationPass?.node).toEqual({
      type: 'text',
      text: '1',
      marks: [
        {
          type: 'textStyle',
          attrs: {
            fontFamily: 'Arial',
            fontSize: '22pt',
          },
        },
      ],
    });
    expect(normalizationPass?.inheritedMarks).toEqual([
      {
        type: 'textStyle',
        attrs: {
          color: '#FF0000',
        },
      },
    ]);
    expect(normalizationPass?.runProperties).toEqual({
      fontSize: 44,
      fontFamily: { ascii: 'Arial' },
    });
  });
});
