/**
 * Tests for the remeasureParagraph text-width caches
 * (plans/layout-improvements.md idea 2).
 *
 * The mock width model below is deliberately font-dependent AND non-additive
 * (a pseudo-kerning term for multi-char strings) so these tests catch a cache
 * key that ignores the font or a change in measurement granularity.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test';
import type { ParagraphBlock, Run } from '@superdoc/contracts';
import { clearRemeasureTextCaches, remeasureParagraph } from '../src/remeasure.ts';

let measureTextCalls = 0;
let fontAssignments = 0;
let canvasCreations = 0;
let measureContextIds: number[] = [];

/** Font-dependent per-char width plus a non-additive multi-char term. */
const mockWidth = (text: string, font: string): number => {
  let width = 0;
  for (let i = 0; i < text.length; i += 1) {
    width += ((text.charCodeAt(i) * 7 + font.length * 3) % 11) + 4;
  }
  if (text.length > 1) width += text.length * 0.5; // pseudo-kerning
  return width;
};

beforeAll(() => {
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => {
      canvasCreations += 1;
      const contextId = canvasCreations;
      const ctx = {
        _font: '',
        set font(value: string) {
          fontAssignments += 1;
          this._font = value;
        },
        get font(): string {
          return this._font;
        },
        measureText(text: string) {
          measureTextCalls += 1;
          measureContextIds.push(contextId);
          return { width: mockWidth(text, this._font) } as TextMetrics;
        },
      };
      return { getContext: () => ctx };
    },
  };
});

beforeEach(() => {
  clearRemeasureTextCaches();
  measureTextCalls = 0;
  fontAssignments = 0;
  canvasCreations = 0;
  measureContextIds = [];
});

const text = (value: string, overrides: Partial<Extract<Run, { text?: string }>> = {}): Run =>
  ({
    text: value,
    fontFamily: 'Arial',
    fontSize: 16,
    ...overrides,
  }) as Run;

/** Battery of paragraphs exercising every measured code path (no list markers). */
const makeBattery = (): ParagraphBlock[] => [
  {
    kind: 'paragraph',
    id: 'plain-multi-run',
    runs: [
      text('The quick brown fox jumps over the lazy dog and keeps going until it wraps. '),
      text('Second run in a different face, bold and larger, to vary the font key. ', {
        fontFamily: 'Times New Roman',
        fontSize: 24,
        bold: true,
      }),
      text('Third italic run with more filler text so several lines exist.', { italic: true }),
    ],
    attrs: {},
  },
  {
    kind: 'paragraph',
    id: 'hanging-indent',
    runs: [text('1.1 A hanging-indent clause with enough words to wrap across multiple lines at a narrow width.')],
    attrs: { indent: { left: 96, hanging: 48 } },
  },
  {
    kind: 'paragraph',
    id: 'transforms-and-spacing',
    runs: [
      text('capitalize each word here', { textTransform: 'capitalize' }),
      text(' and shout this part loudly', { textTransform: 'uppercase' }),
      text(' with letter spacing applied to this final stretch of text', { letterSpacing: 1.5 }),
    ],
    attrs: {},
  },
  {
    kind: 'paragraph',
    id: 'tabs-with-leader',
    runs: [text('Chapter One\tPage'), text('\t42.5', { fontFamily: 'Times New Roman' })],
    attrs: {
      tabs: [
        { pos: 3600, val: 'end', leader: 'dot' },
        { pos: 6000, val: 'decimal' },
      ],
    },
  },
  {
    kind: 'paragraph',
    id: 'unbreakable-word',
    runs: [text('Supercalifragilisticexpialidociousantidisestablishmentarianism')],
    attrs: {},
  },
];

const WIDTHS = [672, 312, 150];

const measureBattery = (): unknown[] =>
  WIDTHS.flatMap((width) => makeBattery().map((block) => remeasureParagraph(block, width)));

describe('remeasure text-width caches', () => {
  it('repeat remeasurement is served entirely from cache', () => {
    measureBattery();
    const callsAfterFirst = measureTextCalls;
    expect(callsAfterFirst).toBeGreaterThan(0);

    const fontsAfterFirst = fontAssignments;
    measureBattery();
    expect(measureTextCalls).toBe(callsAfterFirst);
    expect(fontAssignments).toBe(fontsAfterFirst);
  });

  it('clearRemeasureTextCaches forces remeasurement', () => {
    measureBattery();
    const callsAfterFirst = measureTextCalls;

    clearRemeasureTextCaches();
    measureBattery();
    expect(measureTextCalls).toBe(callsAfterFirst * 2);
  });

  it('clearRemeasureTextCaches resets the measuring canvas context', () => {
    measureBattery();
    expect(canvasCreations).toBe(1);
    expect(new Set(measureContextIds)).toEqual(new Set([1]));

    clearRemeasureTextCaches();
    measureContextIds = [];
    measureBattery();

    expect(canvasCreations).toBe(2);
    expect(new Set(measureContextIds)).toEqual(new Set([2]));
  });
});
