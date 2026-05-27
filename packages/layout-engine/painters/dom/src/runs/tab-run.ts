import type { Line, LineSegment, Run, TabRun } from '@superdoc/contracts';
import { applyTrackedChangeDecorations } from './tracked-changes.js';
import type { TrackedChangesRenderConfig } from './types.js';

/**
 * SD-3266: render a synthesized literal-tab span (the kind produced by
 * `expandRunsForInlineTabs` when a `<w:t>`/`<w:delText>` contained a literal
 * U+0009). These are NOT tab-stop advances — Word treats them as compact
 * placeholders and so do we. textContent is two literal spaces, typography is
 * carried over from the source text run (the line container uses
 * `font-size: 0` for whitespace control, so we must declare these here), and
 * the `.superdoc-tab` class participates in SD-2939's existing
 * `.superdoc-show-formatting-marks .superdoc-tab::after { content: "→" }`
 * overlay automatically.
 */
const renderFromLiteralTabSpan = (
  run: TabRun,
  doc: Document,
  layoutEpoch: number,
  trackedConfig?: TrackedChangesRenderConfig,
  styleId?: string,
): HTMLElement => {
  const tabEl = doc.createElement('span');
  tabEl.classList.add('superdoc-tab', 'superdoc-tab--literal');
  tabEl.textContent = '  ';
  tabEl.style.whiteSpace = 'pre';
  if (run.fontFamily) tabEl.style.fontFamily = run.fontFamily;
  if (run.fontSize != null) tabEl.style.fontSize = `${run.fontSize}px`;
  if (run.bold) tabEl.style.fontWeight = 'bold';
  if (run.italic) tabEl.style.fontStyle = 'italic';
  if (run.color) tabEl.style.color = run.color;
  // Apply trackedChange decorations (strikethrough for delete, underline for
  // insert) so the placeholder reads as part of the revision in the body.
  if (trackedConfig && run.trackedChange) {
    applyTrackedChangeDecorations(tabEl, run as Run, trackedConfig);
  }
  if (styleId) tabEl.setAttribute('styleid', styleId);
  if (run.pmStart != null) tabEl.dataset.pmStart = String(run.pmStart);
  if (run.pmEnd != null) tabEl.dataset.pmEnd = String(run.pmEnd);
  tabEl.dataset.layoutEpoch = String(layoutEpoch);
  return tabEl;
};

export const renderInlineTabRun = (
  run: Extract<Run, { kind: 'tab' }>,
  line: Line,
  doc: Document,
  layoutEpoch: number,
  styleId?: string,
  trackedConfig?: TrackedChangesRenderConfig,
): HTMLElement => {
  // SD-3266: literal-tab placeholders inside revision text render as a compact
  // 2-space strut, not as a tab-stop advance.
  if (run.fromLiteralTab) {
    return renderFromLiteralTabSpan(run, doc, layoutEpoch, trackedConfig, styleId);
  }

  const tabEl = doc.createElement('span');
  tabEl.classList.add('superdoc-tab');

  // Calculate tab width - use measured width or estimate based on typical tab stop
  const tabWidth = run.width ?? 48; // Default tab width if not measured

  tabEl.style.display = 'inline-block';
  tabEl.style.width = `${tabWidth}px`;
  tabEl.style.height = `${line.lineHeight}px`;
  tabEl.style.verticalAlign = 'bottom';

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
  trackedConfig?: TrackedChangesRenderConfig,
  segmentWidth?: number,
): { element: HTMLElement; tabEndX: number; actualTabWidth: number } => {
  // SD-3266: literal-tab placeholder — compact 2-space strut, absolutely
  // positioned at cumulativeX with the glyph width the measurer recorded on
  // the line segment. Tab-stop advance logic is skipped.
  if (run.fromLiteralTab) {
    const glyphWidth = segmentWidth ?? run.width ?? 0;
    const tabEl = renderFromLiteralTabSpan(run, doc, layoutEpoch, trackedConfig, styleId);
    tabEl.style.position = 'absolute';
    tabEl.style.left = `${tabStartX + indentOffset}px`;
    tabEl.style.top = '0px';
    tabEl.style.lineHeight = `${line.lineHeight}px`;
    return { element: tabEl, tabEndX: tabStartX + glyphWidth, actualTabWidth: glyphWidth };
  }

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
  tabEl.style.height = `${line.lineHeight}px`;
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
