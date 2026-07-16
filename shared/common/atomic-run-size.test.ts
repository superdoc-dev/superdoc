import { describe, it, expect } from 'bun:test';
import {
  isAtomicLayoutRun,
  getAtomicRunLayoutSize,
  type MinimalAtomicRun,
  type MeasureAtomicText,
} from './atomic-run-size.js';
import {
  FIELD_ANNOTATION_PILL_PADDING,
  FIELD_ANNOTATION_VERTICAL_PADDING,
  FIELD_ANNOTATION_LINE_HEIGHT_MULTIPLIER,
  DEFAULT_FIELD_ANNOTATION_FONT_SIZE,
  FIELD_ANNOTATION_SIGNATURE_HEIGHT_PX,
  MATH_FALLBACK_WIDTH_PX,
  MATH_FALLBACK_HEIGHT_PX,
} from './layout-constants.js';

// Deterministic stand-in for canvas text measurement: 10px per character.
const measureText: MeasureAtomicText = (text) => text.length * 10;

describe('isAtomicLayoutRun', () => {
  it('matches image, math, and field annotation runs', () => {
    expect(isAtomicLayoutRun({ kind: 'image', src: 'data:...' })).toBe(true);
    expect(isAtomicLayoutRun({ kind: 'math' })).toBe(true);
    expect(isAtomicLayoutRun({ kind: 'fieldAnnotation' })).toBe(true);
  });

  it('rejects text/tab/break runs', () => {
    expect(isAtomicLayoutRun({ kind: 'text' })).toBe(false);
    expect(isAtomicLayoutRun({ kind: 'tab' })).toBe(false);
    expect(isAtomicLayoutRun({ kind: 'lineBreak' })).toBe(false);
  });
});

describe('getAtomicRunLayoutSize - image', () => {
  it('uses run width/height plus dist* margins', () => {
    const run: MinimalAtomicRun = {
      kind: 'image',
      src: 'data:...',
      width: 100,
      height: 50,
      distLeft: 4,
      distRight: 6,
      distTop: 2,
      distBottom: 3,
    };
    expect(getAtomicRunLayoutSize(run, measureText)).toEqual({ width: 110, height: 55 });
  });

  it('treats missing margins as zero', () => {
    const run: MinimalAtomicRun = { kind: 'image', src: 'data:...', width: 80, height: 40 };
    expect(getAtomicRunLayoutSize(run, measureText)).toEqual({ width: 80, height: 40 });
  });
});

describe('getAtomicRunLayoutSize - math', () => {
  it('uses precomputed dimensions and does not add dist* margins', () => {
    const run: MinimalAtomicRun = {
      kind: 'math',
      width: 30,
      height: 18,
      // dist* must be ignored for math (the measurer never adds them).
      distLeft: 9,
      distTop: 9,
    } as MinimalAtomicRun;
    expect(getAtomicRunLayoutSize(run, measureText)).toEqual({ width: 30, height: 18 });
  });

  it('falls back to 20x24 when dimensions are missing', () => {
    const run: MinimalAtomicRun = { kind: 'math' };
    expect(getAtomicRunLayoutSize(run, measureText)).toEqual({
      width: MATH_FALLBACK_WIDTH_PX,
      height: MATH_FALLBACK_HEIGHT_PX,
    });
  });
});

describe('getAtomicRunLayoutSize - field annotation', () => {
  it('sizes the pill from displayLabel + padding (NOT run.width/height)', () => {
    const run: MinimalAtomicRun = {
      kind: 'fieldAnnotation',
      variant: 'text',
      displayLabel: 'Full Name', // 9 chars -> 90px
      fontSize: 20,
    };
    const { width, height } = getAtomicRunLayoutSize(run, measureText);
    expect(width).toBe(90 + FIELD_ANNOTATION_PILL_PADDING);
    expect(height).toBe(20 * FIELD_ANNOTATION_LINE_HEIGHT_MULTIPLIER + FIELD_ANNOTATION_VERTICAL_PADDING);
  });

  it('defaults the font size when unspecified', () => {
    const run: MinimalAtomicRun = { kind: 'fieldAnnotation', variant: 'text', displayLabel: 'Hi' };
    const { width, height } = getAtomicRunLayoutSize(run, measureText);
    expect(width).toBe(20 + FIELD_ANNOTATION_PILL_PADDING);
    expect(height).toBe(
      DEFAULT_FIELD_ANNOTATION_FONT_SIZE * FIELD_ANNOTATION_LINE_HEIGHT_MULTIPLIER + FIELD_ANNOTATION_VERTICAL_PADDING,
    );
  });

  it('parses numeric-prefixed string font sizes', () => {
    const run: MinimalAtomicRun = { kind: 'fieldAnnotation', variant: 'text', displayLabel: 'X', fontSize: '12pt' };
    const { height } = getAtomicRunLayoutSize(run, measureText);
    expect(height).toBe(12 * FIELD_ANNOTATION_LINE_HEIGHT_MULTIPLIER + FIELD_ANNOTATION_VERTICAL_PADDING);
  });

  it('drops pill chrome when highlighted is false', () => {
    const run: MinimalAtomicRun = {
      kind: 'fieldAnnotation',
      variant: 'text',
      displayLabel: 'abc', // 3 chars -> 30px
      fontSize: 10,
      highlighted: false,
    };
    const { width, height } = getAtomicRunLayoutSize(run, measureText);
    expect(width).toBe(30);
    expect(height).toBe(10 * FIELD_ANNOTATION_LINE_HEIGHT_MULTIPLIER);
  });

  it('does not measure an empty label', () => {
    const run: MinimalAtomicRun = { kind: 'fieldAnnotation', variant: 'text', displayLabel: '' };
    const { width } = getAtomicRunLayoutSize(run, measureText);
    expect(width).toBe(FIELD_ANNOTATION_PILL_PADDING);
  });

  it('caps signature variants to the signature height', () => {
    const run: MinimalAtomicRun = {
      kind: 'fieldAnnotation',
      variant: 'signature',
      displayLabel: '',
      imageSrc: 'data:...',
      fontSize: 10, // base pill height (12 + 6) would be below the signature cap
    };
    const { height } = getAtomicRunLayoutSize(run, measureText);
    expect(height).toBe(FIELD_ANNOTATION_SIGNATURE_HEIGHT_PX + FIELD_ANNOTATION_VERTICAL_PADDING);
  });

  it('honors explicit image size height when larger', () => {
    const run: MinimalAtomicRun = {
      kind: 'fieldAnnotation',
      variant: 'image',
      displayLabel: '',
      imageSrc: 'data:...',
      size: { height: 200 },
      fontSize: 10,
    };
    const { height } = getAtomicRunLayoutSize(run, measureText);
    expect(height).toBe(200 + FIELD_ANNOTATION_VERTICAL_PADDING);
  });
});
