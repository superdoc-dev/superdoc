import type { MathRun } from '@superdoc/contracts';
import { convertOmmlToMathml } from '../features/math/index.js';
import type { RunRenderContext } from './types.js';
import { BROWSER_DEFAULT_FONT_SIZE } from './text-run.js';

/**
 * Render a math run as a MathML element wrapped in a span.
 * Follows the same pattern as renderImageRun — sets explicit dimensions.
 */
export const renderMathRun = (run: MathRun, context: RunRenderContext): HTMLElement | null => {
  const wrapper = context.doc.createElement('span');
  wrapper.className = 'sd-math';
  wrapper.style.display = 'inline-block';
  wrapper.style.verticalAlign = 'middle';
  // Let browser auto-size to MathML content; estimated dimensions are for layout only
  wrapper.style.minWidth = `${run.width}px`;
  wrapper.style.minHeight = `${run.height}px`;
  // Restore font-size so the plain-text fallback renders at a reasonable size
  // (the line container sets fontSize: 0 to eliminate the CSS strut). MathML
  // has its own internal scaling, so this only matters for the textContent
  // fallback path. run.height would make tall expressions (fractions, equation
  // arrays) render at 80–100px — use the browser default instead.
  wrapper.style.fontSize = BROWSER_DEFAULT_FONT_SIZE;
  wrapper.dataset.layoutEpoch = String(context.layoutEpoch ?? 0);

  const mathEl = convertOmmlToMathml(run.ommlJson, context.doc);
  if (mathEl) {
    wrapper.appendChild(mathEl);
  } else {
    // Fallback: render plain text content
    wrapper.textContent = run.textContent || '';
  }

  if (run.pmStart != null) wrapper.dataset.pmStart = String(run.pmStart);
  if (run.pmEnd != null) wrapper.dataset.pmEnd = String(run.pmEnd);

  return wrapper;
};
