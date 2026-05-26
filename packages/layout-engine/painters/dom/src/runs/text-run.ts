import type { FlowRunLink, Run, TextRun } from '@superdoc/contracts';
import { normalizeBaselineShift, resolveBaseFontSizeForVerticalText } from '@superdoc/contracts';
import { assertPmPositions } from '../pm-position-validation.js';
import type { FragmentRenderContext } from '../renderer.js';
import { BROWSER_DEFAULT_FONT_SIZE } from '../styles.js';
import type { RunRenderContext, TrackedChangesRenderConfig } from './types.js';
import { applyRunDataAttributes } from './hash.js';
import { applyLinkAttributes, applyLinkDataset, buildLinkRenderData, enhanceAccessibility } from './links.js';
import { setTextContentWithFormattingSpaceMarks } from './formatting-marks.js';
import { normalizeRtlDateTokenForWordParity, resolveRunDirectionAttribute } from '../features/inline-direction/index.js';

const DEFAULT_SUPERSCRIPT_RAISE_RATIO = 0.33;
const DEFAULT_SUBSCRIPT_LOWER_RATIO = 0.14;

const hasVerticalPositioning = (run: TextRun): boolean =>
  normalizeBaselineShift(run.baselineShift) != null || run.vertAlign === 'superscript' || run.vertAlign === 'subscript';

const applyRunVerticalPositioning = (element: HTMLElement, run: TextRun): void => {
  // Vertically shifted runs should use a tight inline box. If they inherit the
  // parent line's full line-height, the glyph remains visually low inside an
  // oversized inline box even when the superscript/subscript offset is correct.
  if (hasVerticalPositioning(run)) {
    element.style.lineHeight = '1';
  }

  const explicitBaselineShift = normalizeBaselineShift(run.baselineShift);
  if (explicitBaselineShift != null) {
    element.style.verticalAlign = `${explicitBaselineShift}pt`;
    return;
  }

  if (run.vertAlign === 'superscript') {
    const baseFontSize = resolveBaseFontSizeForVerticalText(run.fontSize, run);
    element.style.verticalAlign = `${baseFontSize * DEFAULT_SUPERSCRIPT_RAISE_RATIO}px`;
    return;
  }

  if (run.vertAlign === 'subscript') {
    const baseFontSize = resolveBaseFontSizeForVerticalText(run.fontSize, run);
    element.style.verticalAlign = `${-(baseFontSize * DEFAULT_SUBSCRIPT_LOWER_RATIO)}px`;
    return;
  }

  if (run.vertAlign === 'baseline') {
    element.style.verticalAlign = 'baseline';
  }
};

/**
 * Applies run styling properties to a DOM element.
 *
 * @param element - The HTML element to style
 * @param run - The run object containing styling information
 * @param _isLink - Whether this run is part of a hyperlink. Note: This parameter
 *                  is kept for API compatibility but no longer affects behavior -
 *                  inline colors are now applied to all runs (including links) to
 *                  ensure OOXML hyperlink character styles appear correctly.
 */
export const applyRunStyles = (element: HTMLElement, run: Run, _isLink = false): void => {
  if (
    run.kind === 'tab' ||
    run.kind === 'image' ||
    run.kind === 'lineBreak' ||
    run.kind === 'break' ||
    run.kind === 'fieldAnnotation' ||
    run.kind === 'math'
  ) {
    // Tab, image, lineBreak, break, and fieldAnnotation runs don't have text styling properties
    return;
  }

  element.style.fontFamily = run.fontFamily;
  element.style.fontSize = `${run.fontSize}px`;
  if (run.bold) element.style.fontWeight = 'bold';
  if (run.italic) element.style.fontStyle = 'italic';

  // Apply inline color even for links so OOXML hyperlink styles appear when CSS is absent
  if (run.color) element.style.color = run.color;

  if (run.letterSpacing != null) {
    element.style.letterSpacing = `${run.letterSpacing}px`;
  }
  if (run.highlight) {
    element.style.backgroundColor = run.highlight;
  }
  if (run.textTransform) {
    element.style.textTransform = run.textTransform;
  }

  // Apply text decorations from the run. Even for links, inline decorations should reflect
  // the document styling (tests assert underline presence on anchors).
  const decorations: string[] = [];
  if (run.underline) {
    decorations.push('underline');
    const u = run.underline;
    element.style.textDecorationStyle = u.style && u.style !== 'single' ? u.style : 'solid';
    if (u.color) {
      element.style.textDecorationColor = u.color;
    }
  }
  if (run.strike) {
    decorations.push('line-through');
  }
  if (decorations.length > 0) {
    element.style.textDecorationLine = decorations.join(' ');
  }

  applyRunVerticalPositioning(element, run);
};

export const resolveRunText = (run: Run, context: FragmentRenderContext): string => {
  const runToken = 'token' in run ? run.token : undefined;

  if (run.kind === 'tab') {
    return run.text;
  }
  if (run.kind === 'image') {
    // Image runs don't have text content
    return '';
  }
  if (run.kind === 'lineBreak') {
    // Line break runs don't render text - the measurer creates new lines for them
    return '';
  }
  if (run.kind === 'break') {
    // Break runs don't render text - the measurer creates new lines for them
    return '';
  }
  if (!('text' in run)) {
    // Safety check - if run doesn't have text property, return empty string
    return '';
  }
  if (!runToken) {
    return run.text ?? '';
  }
  if (runToken === 'pageNumber') {
    return context.pageNumberText ?? String(context.pageNumber);
  }
  if (runToken === 'totalPageCount') {
    return context.totalPages ? String(context.totalPages) : (run.text ?? '');
  }
  return run.text ?? '';
};

export const extractLinkData = (run: Run) => {
  if (run.kind === 'tab' || run.kind === 'image' || run.kind === 'lineBreak' || run.kind === 'math') {
    return null;
  }
  const link = (run as TextRun).link as FlowRunLink | undefined;
  if (!link) {
    return null;
  }
  return buildLinkRenderData(link);
};

export const renderTextRun = (
  run: TextRun,
  context: FragmentRenderContext,
  renderContext: RunRenderContext,
  trackedConfig?: TrackedChangesRenderConfig,
): HTMLElement | null => {
  if (!run.text) {
    return null;
  }

  const linkData = extractLinkData(run);
  const isActiveLink = !!(linkData && !linkData.blocked && linkData.href);
  const elem = isActiveLink ? renderContext.doc.createElement('a') : renderContext.doc.createElement('span');
  const text = resolveRunText(run, context);
  const effectiveText =
    run.bidi?.rtl === true && typeof text === 'string' ? normalizeRtlDateTokenForWordParity(text) : text;
  setTextContentWithFormattingSpaceMarks(elem, effectiveText, renderContext.doc, renderContext.showFormattingMarks);

  if (linkData?.dataset) {
    applyLinkDataset(elem, linkData.dataset);
  }
  if (linkData?.blocked) {
    elem.dataset.linkBlocked = 'true';
    // For blocked links rendered as spans, set appropriate role
    elem.setAttribute('role', 'text');
    elem.setAttribute('aria-label', 'Invalid link - not clickable');
  }
  if (isActiveLink && linkData) {
    applyLinkAttributes(elem as HTMLAnchorElement, linkData);
    // Enhance accessibility with ARIA labels for ambiguous text
    enhanceAccessibility(elem as HTMLAnchorElement, linkData, text);

    // Note: Tooltip accessibility (aria-describedby) will be applied after
    // the element is added to the DOM in renderLine, since it creates a sibling element
    // Store tooltip for later processing
    if (linkData.tooltip) {
      renderContext.pendingTooltips.set(elem, linkData.tooltip);
    }
  }

  // Pass isLink flag to skip applying inline color/decoration styles for links
  applyRunStyles(elem as HTMLElement, run, isActiveLink);
  const dirAttr = resolveRunDirectionAttribute({
    runText: run.text,
    effectiveText,
    isRtlTagged: run.bidi?.rtl === true,
  });
  if (dirAttr) {
    elem.setAttribute('dir', dirAttr);
  }
  const commentAnnotations = run.comments;
  const hasAnyComment = !!commentAnnotations?.length;
  // Comment highlight styles are applied post-paint by CommentHighlightDecorator (super-editor).
  // The painter only stamps metadata attributes below.
  // We still need to preserve the comment ids
  if (hasAnyComment) {
    elem.dataset.commentIds = commentAnnotations.map((c) => c.commentId).join(',');
    if (commentAnnotations.some((c) => c.internal)) {
      elem.dataset.commentInternal = 'true';
    }
    // Per-comment internal flag so the editor-side decorator can pick the right color
    const internalIds = commentAnnotations.filter((c) => c.internal).map((c) => c.commentId);
    if (internalIds.length > 0) {
      elem.dataset.commentInternalIds = internalIds.join(',');
    }
    // importedId aliases so the decorator can match by either ID
    const importedEntries = commentAnnotations
      .filter((c) => c.importedId && c.importedId !== c.commentId)
      .map((c) => `${c.importedId}=${c.commentId}`);
    if (importedEntries.length > 0) {
      elem.dataset.commentImportedIds = importedEntries.join(',');
    }
    elem.classList.add('superdoc-comment-highlight');
  }
  // Ensure text renders above tab leaders (leaders are z-index: 0)
  elem.style.zIndex = '1';
  applyRunDataAttributes(elem as HTMLElement, run.dataAttrs);

  // SD-2454: bookmark marker runs carry a data-bookmark-name attribute.
  // Surface the bookmark name as a native `title` tooltip so hovering the
  // opening bracket identifies which bookmark is being marked.
  const bookmarkName = run.dataAttrs?.['data-bookmark-name'];
  if (bookmarkName) {
    (elem as HTMLElement).title = bookmarkName;
  }

  // Assert PM positions are present for cursor fallback
  assertPmPositions(run, 'paragraph text run');

  if (run.pmStart != null) elem.dataset.pmStart = String(run.pmStart);
  if (run.pmEnd != null) elem.dataset.pmEnd = String(run.pmEnd);
  elem.dataset.layoutEpoch = String(renderContext.layoutEpoch);
  if (trackedConfig) {
    renderContext.applyTrackedChangeDecorations(elem, run, trackedConfig);
  }
  renderContext.applySdtDataset(elem, run.sdt);

  return elem;
};

export { BROWSER_DEFAULT_FONT_SIZE };
