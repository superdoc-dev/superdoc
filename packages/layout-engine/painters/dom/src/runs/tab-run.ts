import type { Line, LineSegment, Run } from '@superdoc/contracts';

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
    // Underlined tabs render the underline as a border-bottom. A full-height,
    // bottom-aligned box puts that border ~descent+half-leading below the
    // text-decoration underline of adjacent text, making the combined line look
    // broken (SD-3330). End the box at the computed underline offset and pin its
    // top to the line-box top so the border lands flush with the text underline.
    tabEl.style.height = `${underlineOffsetFromLineTop(line)}px`;
    tabEl.style.verticalAlign = 'top';
  } else {
    tabEl.style.height = `${line.lineHeight}px`;
    tabEl.style.verticalAlign = 'bottom';
  }

  applyTabUnderline(tabEl, run);

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
  tabEl.style.height = run.underline ? `${underlineOffsetFromLineTop(line)}px` : `${line.lineHeight}px`;
  tabEl.style.display = 'inline-block';
  tabEl.style.pointerEvents = 'none';
  tabEl.style.zIndex = '1';

  applyTabUnderline(tabEl, run);
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

const applyTabUnderline = (tabEl: HTMLElement, run: Extract<Run, { kind: 'tab' }>): void => {
  // Apply underline styling if present (common for signature lines)
  //
  // Signature line use case: In documents with signature lines, tabs are often used
  // to create underlined blank spaces where signatures should go. The underline mark
  // is inherited from a parent node (e.g., a paragraph with underline formatting) and
  // applied to the tab, creating a visible underline even though the tab itself has
  // no visible text content.
  if (run.underline) {
    const underlineStyle = run.underline.style ?? 'single';
    // We must use an explicit color instead of currentColor because tab content is
    // invisible (no text). If we used currentColor, the underline would inherit the
    // text color, which might be transparent or the same as the background, making
    // the underline invisible. Using an explicit color (defaulting to black) ensures
    // the underline is always visible for signature lines.
    const underlineColor = run.underline.color ?? '#000000';
    const borderStyle = underlineStyle === 'double' ? 'double' : 'solid';
    tabEl.style.borderBottom = `1px ${borderStyle} ${underlineColor}`;
  }
};
