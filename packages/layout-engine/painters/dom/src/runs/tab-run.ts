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
    // Draw the underline with text-decoration on a baseline-aligned box so the browser
    // places it on the SAME baseline as adjacent text — identical vertical position AND
    // weight, with no stepped/broken line where text meets tabs (SD-3330). A tab has no
    // glyphs, so it is filled with clipped, transparent whitespace (see
    // applyTabUnderlineDecoration). Matching the line height keeps the box from changing
    // line spacing.
    tabEl.style.lineHeight = `${line.lineHeight}px`;
    tabEl.style.verticalAlign = 'baseline';
    applyTabUnderlineDecoration(tabEl, run, tabWidth);
  } else {
    tabEl.style.height = `${line.lineHeight}px`;
    tabEl.style.verticalAlign = 'bottom';
  }

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
 * Inline underlined tabs (signature / fill-in lines): draw the underline with the same
 * `text-decoration` mechanism as adjacent text. The tab box is baseline-aligned and the
 * box is filled with transparent, horizontally-clipped whitespace, so the browser places
 * the underline on the exact same baseline and at the same weight as the surrounding
 * text — one continuous, even line (SD-3330).
 */
const applyTabUnderlineDecoration = (tabEl: HTMLElement, run: Extract<Run, { kind: 'tab' }>, widthPx: number): void => {
  if (!run.underline) return;

  const underlineStyle = run.underline.style ?? 'single';
  // Explicit color, not currentColor: the filler glyphs are transparent, and currentColor
  // could resolve to transparent and hide the underline.
  const underlineColor = run.underline.color ?? '#000000';
  const fontSize = (run as { fontSize?: number }).fontSize ?? 16;

  tabEl.style.fontSize = `${fontSize}px`;
  tabEl.style.whiteSpace = 'pre';
  tabEl.style.color = 'transparent';
  // Clip the filler horizontally to the tab width; the negative top/bottom insets leave
  // the underline vertically unclipped regardless of the font's metrics.
  tabEl.style.clipPath = 'inset(-50% 0 -50% 0)';
  tabEl.style.textDecorationLine = 'underline';
  tabEl.style.textDecorationStyle = underlineStyle === 'double' ? 'double' : 'solid';
  tabEl.style.textDecorationColor = underlineColor;
  tabEl.style.textDecorationThickness = `${underlineThicknessPx(fontSize)}px`;
  // Enough whitespace to overfill the tab width once clipped (a space is ≥ ~2px wide for
  // any readable font size).
  tabEl.textContent = ' '.repeat(Math.max(8, Math.ceil(widthPx / 2) + 2));
};

/**
 * Positioned (right/center/decimal-aligned) underlined tabs are absolutely placed, so the
 * baseline-aligned text-decoration path used for inline tabs does not apply. They draw the
 * underline as a border at the computed offset, with the same font-scaled weight.
 */
const applyTabUnderlineBorder = (tabEl: HTMLElement, run: Extract<Run, { kind: 'tab' }>): void => {
  if (!run.underline) return;

  const underlineStyle = run.underline.style ?? 'single';
  const underlineColor = run.underline.color ?? '#000000';
  const borderStyle = underlineStyle === 'double' ? 'double' : 'solid';
  const fontSize = (run as { fontSize?: number }).fontSize ?? 16;
  tabEl.style.borderBottom = `${underlineThicknessPx(fontSize)}px ${borderStyle} ${underlineColor}`;
};
