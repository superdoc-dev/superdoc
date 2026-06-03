import type { Line, LineSegment, Run } from '@superdoc/contracts';
import { underlineThicknessPx } from './text-run.js';

export const renderInlineTabRun = (
  run: Extract<Run, { kind: 'tab' }>,
  line: Line,
  doc: Document,
  layoutEpoch: number,
  styleId?: string,
): HTMLElement => {
  const tabEl = doc.createElement('span');
  tabEl.classList.add('superdoc-tab');

  // Calculate tab width - use measured width or estimate based on typical tab stop
  const tabWidth = run.width ?? 48; // Default tab width if not measured

  tabEl.style.display = 'inline-block';
  tabEl.style.width = `${tabWidth}px`;
  if (run.underline) {
    // Underlined tabs render the underline as a border-bottom (the tab has no glyphs to
    // carry a text-decoration, and a transparent-filler text-decoration would become
    // selectable content and break line selection). A full-height, bottom-aligned box
    // would put the border ~descent+half-leading below the text-decoration underline of
    // adjacent text and look broken (SD-3330), so the box ends at the computed underline
    // offset with its top pinned to the line-box top, landing the border at the baseline.
    tabEl.style.height = `${underlineOffsetFromLineTop(line)}px`;
    tabEl.style.verticalAlign = 'top';
  } else {
    tabEl.style.height = `${line.lineHeight}px`;
    tabEl.style.verticalAlign = 'bottom';
  }

  applyTabUnderlineBorder(tabEl, run);

  if (styleId) {
    tabEl.setAttribute('styleid', styleId);
  }
  if (run.pmStart != null) tabEl.dataset.pmStart = String(run.pmStart);
  if (run.pmEnd != null) tabEl.dataset.pmEnd = String(run.pmEnd);
  tabEl.dataset.layoutEpoch = String(layoutEpoch);

  return tabEl;
};

export const renderPositionedTabRun = (
  run: Extract<Run, { kind: 'tab' }>,
  line: Line,
  doc: Document,
  layoutEpoch: number,
  tabStartX: number,
  indentOffset: number,
  immediateNextSegment?: LineSegment,
  styleId?: string,
): { element: HTMLElement; tabEndX: number; actualTabWidth: number } => {
  // The tab should span from where previous content ended to where next content begins.
  // If layout supplied a tab-end boundary for the next segment, prefer it.
  // Otherwise, use the next segment's explicit X (from tab alignment) or the
  // tab's measured width.
  const measuredTabEndX = tabStartX + (run.width ?? 0);
  const tabEndX = immediateNextSegment?.precedingTabEndX ?? immediateNextSegment?.x ?? measuredTabEndX;
  const actualTabWidth = tabEndX - tabStartX;

  const tabEl = doc.createElement('span');
  tabEl.style.position = 'absolute';
  tabEl.style.left = `${tabStartX + indentOffset}px`;
  tabEl.style.top = '0px';
  tabEl.style.width = `${actualTabWidth}px`;
  // Underlined positioned tabs end the box at the text underline offset (not the full
  // line height) so the border-bottom aligns with adjacent text underlines (SD-3330).
  // Non-underlined positioned tabs keep the full line height (they are hidden below).
  // Positioned tabs are absolutely placed, so the baseline-aligned text-decoration path
  // used for inline tabs does not apply here; a border at the computed offset is used.
  tabEl.style.height = run.underline ? `${underlineOffsetFromLineTop(line)}px` : `${line.lineHeight}px`;
  tabEl.style.display = 'inline-block';
  tabEl.style.pointerEvents = 'none';
  tabEl.style.zIndex = '1';

  applyTabUnderlineBorder(tabEl, run);
  if (!run.underline) {
    tabEl.style.visibility = 'hidden';
  }

  if (styleId) {
    tabEl.setAttribute('styleid', styleId);
  }
  if (run.pmStart != null) tabEl.dataset.pmStart = String(run.pmStart);
  if (run.pmEnd != null) tabEl.dataset.pmEnd = String(run.pmEnd);
  tabEl.dataset.layoutEpoch = String(layoutEpoch);

  return { element: tabEl, tabEndX, actualTabWidth };
};

/**
 * Distance, in pixels from the top of the line box, at which a tab's underline
 * (border-bottom) should be drawn so it lines up with the `text-decoration`
 * underline of adjacent text runs.
 *
 * The line box places the baseline at `half-leading + ascent` from its top
 * (the remaining `half-leading + descent` sits below). `text-decoration`
 * underlines render slightly below the baseline, so we add a small gap that
 * scales with font size (capped by the descent). This is geometry derived from
 * the resolved line metrics — the painter never measures the DOM (SD-2957).
 */
const underlineOffsetFromLineTop = (line: Line): number => {
  const halfLeading = Math.max(0, (line.lineHeight - line.ascent - line.descent) / 2);
  const baselineFromTop = halfLeading + line.ascent;
  const underlineGap = Math.min(line.descent, line.lineHeight * 0.08);
  return baselineFromTop + underlineGap;
};

/**
 * Underlined tabs (signature / fill-in lines) draw the underline as a border-bottom. The
 * tab has no glyphs to carry a text-decoration, so the weight is matched to adjacent text
 * by using the same font-scaled thickness text runs apply via text-decoration-thickness
 * (underlineThicknessPx), giving a uniform line across text and tabs (SD-3330). The run
 * carries the font size even though the rendered span sets none. An explicit color is used
 * (not currentColor) because the tab has no visible text to inherit a color from.
 */
const applyTabUnderlineBorder = (tabEl: HTMLElement, run: Extract<Run, { kind: 'tab' }>): void => {
  if (!run.underline) return;

  const underlineStyle = run.underline.style ?? 'single';
  const underlineColor = run.underline.color ?? '#000000';
  const borderStyle = underlineStyle === 'double' ? 'double' : 'solid';
  const fontSize = run.fontSize ?? 16;
  tabEl.style.borderBottom = `${underlineThicknessPx(fontSize)}px ${borderStyle} ${underlineColor}`;
};
