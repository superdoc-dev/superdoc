/**
 * Shared intrinsic sizing for atomic inline runs (image, math, field annotation).
 *
 * Atomic runs occupy a fixed inline box that does not wrap internally. Both the
 * full typography measurer (`measuring/dom`) and the fast canvas remeasurer
 * (`layout-bridge/remeasure`) need the exact same width/height for these runs;
 * historically they diverged (e.g. field annotations measured 0x0 in remeasure
 * because it read `run.width`/`run.height`, which field annotation runs do not
 * have). This module is the single source of truth for that per-kind sizing.
 *
 * Text measurement (and therefore font resolution) is delegated to the caller via
 * {@link MeasureAtomicText} so each consumer keeps its own canvas/font handling.
 */

import {
  FIELD_ANNOTATION_PILL_PADDING,
  FIELD_ANNOTATION_VERTICAL_PADDING,
  FIELD_ANNOTATION_LINE_HEIGHT_MULTIPLIER,
  DEFAULT_FIELD_ANNOTATION_FONT_SIZE,
  FIELD_ANNOTATION_SIGNATURE_HEIGHT_PX,
  MATH_FALLBACK_WIDTH_PX,
  MATH_FALLBACK_HEIGHT_PX,
} from './layout-constants.js';

/**
 * Structural subset of a run needed to size an atomic inline box. Kept minimal and
 * structural (rather than importing the contracts `Run` union) to avoid coupling
 * `@superdoc/common` to the layout contracts package.
 */
export type MinimalAtomicRun = {
  kind?: string;

  // Image / math: intrinsic dimensions are stored on the run itself.
  src?: unknown;
  width?: number;
  height?: number;
  distLeft?: number;
  distRight?: number;
  distTop?: number;
  distBottom?: number;

  // Field annotation: the box is derived from the label text + pill chrome.
  variant?: string;
  displayLabel?: string;
  highlighted?: boolean;
  imageSrc?: string | null;
  size?: { width?: number; height?: number } | null;
  fontFamily?: string | null;
  fontSize?: string | number | null;
  bold?: boolean;
  italic?: boolean;
};

/**
 * Measures the rendered width (px) of `text` for the given run at the resolved
 * font size. Consumers own font resolution so the measured width matches what
 * they paint (e.g. physical-family substitution in `measuring/dom`).
 */
export type MeasureAtomicText = (text: string, run: MinimalAtomicRun, fontSize: number) => number;

export type AtomicRunLayoutSize = {
  width: number;
  height: number;
};

/**
 * True for runs that occupy a fixed atomic inline box (image, math, field
 * annotation). These runs carry no wrappable text, so callers size them via
 * {@link getAtomicRunLayoutSize} instead of measuring character slices.
 */
export const isAtomicLayoutRun = (run: MinimalAtomicRun): boolean =>
  typeof run.src === 'string' || run.kind === 'math' || run.kind === 'fieldAnnotation';

/**
 * Resolves the field annotation font size, accepting numeric px, numeric-prefixed
 * strings (e.g. "12pt"), or falling back to the default.
 */
const resolveFieldAnnotationFontSize = (value: string | number | null | undefined): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_FIELD_ANNOTATION_FONT_SIZE;
};

const getImageRunSize = (run: MinimalAtomicRun): AtomicRunLayoutSize => {
  const distLeft = run.distLeft ?? 0;
  const distRight = run.distRight ?? 0;
  const distTop = run.distTop ?? 0;
  const distBottom = run.distBottom ?? 0;
  return {
    width: (run.width ?? 0) + distLeft + distRight,
    height: (run.height ?? 0) + distTop + distBottom,
  };
};

const getMathRunSize = (run: MinimalAtomicRun): AtomicRunLayoutSize => ({
  width: run.width ?? MATH_FALLBACK_WIDTH_PX,
  height: run.height ?? MATH_FALLBACK_HEIGHT_PX,
});

const getFieldAnnotationRunSize = (run: MinimalAtomicRun, measureText: MeasureAtomicText): AtomicRunLayoutSize => {
  const fontSize = resolveFieldAnnotationFontSize(run.fontSize);
  // `highlighted === false` renders the bare label without pill chrome.
  const horizontalPadding = run.highlighted === false ? 0 : FIELD_ANNOTATION_PILL_PADDING;
  const verticalPadding = run.highlighted === false ? 0 : FIELD_ANNOTATION_VERTICAL_PADDING;

  const label = run.displayLabel ?? '';
  const textWidth = label ? measureText(label, run, fontSize) : 0;
  const width = textWidth + horizontalPadding;

  let height = fontSize * FIELD_ANNOTATION_LINE_HEIGHT_MULTIPLIER + verticalPadding;
  if (run.variant === 'signature' && run.imageSrc) {
    height = Math.max(height, FIELD_ANNOTATION_SIGNATURE_HEIGHT_PX + verticalPadding);
  }
  if (run.variant === 'image' && run.imageSrc && run.size?.height) {
    height = Math.max(height, run.size.height + verticalPadding);
  }
  if (run.variant === 'html' && run.size?.height) {
    height = Math.max(height, run.size.height);
  }

  return { width, height };
};

/**
 * Computes the intrinsic inline box (px) of an atomic run.
 *
 * @param run - The atomic run (image, math, or field annotation).
 * @param measureText - Text measurement callback; only invoked for field
 *   annotations (image/math sizes are precomputed on the run).
 * @returns The atomic run's width and height in pixels.
 */
export const getAtomicRunLayoutSize = (run: MinimalAtomicRun, measureText: MeasureAtomicText): AtomicRunLayoutSize => {
  if (typeof run.src === 'string') return getImageRunSize(run);
  if (run.kind === 'math') return getMathRunSize(run);
  return getFieldAnnotationRunSize(run, measureText);
};
