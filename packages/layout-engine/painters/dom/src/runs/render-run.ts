import type { FieldAnnotationRun, ImageRun, MathRun, Run, TextRun } from '@superdoc/contracts';
import type { FragmentRenderContext } from '../renderer.js';
import type { RunRenderContext, TrackedChangesRenderConfig } from './types.js';
import { renderFieldAnnotationRun } from './field-annotation-run.js';
import { renderImageRun } from './image-run.js';
import { renderMathRun } from './math-run.js';
import { renderTextRun } from './text-run.js';

export const isImageRun = (run: Run): run is ImageRun => run.kind === 'image';
export const isLineBreakRun = (run: Run): run is import('@superdoc/contracts').LineBreakRun => run.kind === 'lineBreak';
export const isBreakRun = (run: Run): run is import('@superdoc/contracts').BreakRun => run.kind === 'break';
export const isFieldAnnotationRun = (run: Run): run is FieldAnnotationRun => run.kind === 'fieldAnnotation';
export const isMathRun = (run: Run): run is MathRun => run.kind === 'math';

/**
 * Render a single run as an HTML element (span or anchor).
 */
export const renderRun = (
  run: Run,
  context: FragmentRenderContext,
  renderContext: RunRenderContext,
  trackedConfig?: TrackedChangesRenderConfig,
): HTMLElement | null => {
  // Handle ImageRun
  if (isImageRun(run)) {
    return renderImageRun(run, renderContext);
  }

  // Handle FieldAnnotationRun - inline pill-styled form fields
  if (isFieldAnnotationRun(run)) {
    return renderFieldAnnotationRun(run, renderContext);
  }

  // Handle MathRun - inline math rendered as MathML
  if (isMathRun(run)) {
    return renderMathRun(run, renderContext);
  }

  // Handle LineBreakRun - line breaks are handled by the measurer creating new lines,
  // so we don't render anything for them in the DOM. They exist in the run array for
  // proper PM position tracking but don't need visual representation.
  if (isLineBreakRun(run)) {
    return null;
  }

  // Handle BreakRun - similar to LineBreakRun, breaks are handled by the measurer
  if (isBreakRun(run)) {
    return null;
  }

  // Handle TextRun
  if (!('text' in run) || !run.text) {
    return null;
  }

  return renderTextRun(run as TextRun, context, renderContext, trackedConfig);
};
