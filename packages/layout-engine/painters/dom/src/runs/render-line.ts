import type { LineSegment, ParagraphAttrs, ParagraphBlock, Run, TextRun } from '@superdoc/contracts';
import {
  calculateJustifySpacing,
  computeLinePmRange,
  expandRunsForInlineNewlines,
  isEmptyInlineSdtPlaceholderRun,
  isEmptySdtPlaceholderRun,
  normalizeBaselineShift,
  shouldApplyJustify,
  sliceRunsForLine,
  SPACE_CHARS,
} from '@superdoc/contracts';
import {
  isMinimalWordLayout as isMinimalWordLayoutShared,
  type MinimalWordLayout,
} from '@superdoc/common/list-marker-utils';
import { CLASS_NAMES, lineStyles } from '../styles.js';
import { applyRtlStyles, shouldUseSegmentPositioning } from '../features/inline-direction/index.js';
import { applyTooltipAccessibility } from './links.js';
import { appendFormattingParagraphMark } from './formatting-marks.js';
import { textRunMergeSignature } from './hash.js';
import { isBreakRun, isFieldAnnotationRun, isImageRun, isLineBreakRun, isMathRun, renderRun } from './render-run.js';
import { renderInlineTabRun, renderPositionedTabRun } from './tab-run.js';
import type { RenderLineParams } from './types.js';

/**
 * Type guard narrowing to the shared word layout contract type.
 * Delegates structural validation to the shared isMinimalWordLayout guard.
 */
function isMinimalWordLayout(value: unknown): value is MinimalWordLayout {
  return isMinimalWordLayoutShared(value);
}

const applyStyles = (el: HTMLElement, styles: Partial<CSSStyleDeclaration>): void => {
  Object.entries(styles).forEach(([key, value]) => {
    if (value != null && value !== '' && key in el.style) {
      (el.style as unknown as Record<string, string>)[key] = String(value);
    }
  });
};

const countSpaces = (text: string): number => {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (SPACE_CHARS.has(text[i])) count += 1;
  }
  return count;
};

const isWhitespaceOnly = (text: string): boolean => {
  if (text.length === 0) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (!SPACE_CHARS.has(text[i])) return false;
  }
  return true;
};

const alignNormalTextBesideInlineImage = (
  element: HTMLElement,
  run: Run,
  lineContainsInlineImage: boolean,
): void => {
  if (!lineContainsInlineImage) return;
  if ((run.kind !== 'text' && run.kind !== undefined) || !('text' in run)) return;

  const textRun = run as TextRun;
  if (normalizeBaselineShift(textRun.baselineShift) != null || textRun.vertAlign != null) return;

  element.style.lineHeight = 'normal';
  element.style.verticalAlign = 'bottom';
};

const cloneTextRun = (run: TextRun): TextRun => ({
  ...(run as TextRun),
  comments: run.comments ? [...run.comments] : undefined,
  dataAttrs: run.dataAttrs ? { ...run.dataAttrs } : undefined,
  underline: run.underline ? { ...run.underline } : undefined,
  pageRefMetadata: run.pageRefMetadata ? { ...run.pageRefMetadata } : undefined,
});

const normalizeJustifiedRuns = (runsForLine: Run[]): Run[] => {
  const normalized: Run[] = runsForLine.map((run) => {
    if ((run.kind !== 'text' && run.kind !== undefined) || !('text' in run)) return run;
    return cloneTextRun(run as TextRun);
  });

  const merged: Run[] = [];
  for (let i = 0; i < normalized.length; i += 1) {
    const run = normalized[i]!;
    if ((run.kind !== 'text' && run.kind !== undefined) || !('text' in run)) {
      merged.push(run);
      continue;
    }

    const textRun = run as TextRun;
    if (!isWhitespaceOnly(textRun.text ?? '')) {
      merged.push(textRun);
      continue;
    }

    const prev = merged[merged.length - 1];
    if (prev && (prev.kind === 'text' || prev.kind === undefined) && 'text' in prev) {
      const prevTextRun = prev as TextRun;
      if (textRunMergeSignature(prevTextRun) === textRunMergeSignature(textRun)) {
        const extra = textRun.text ?? '';
        prevTextRun.text = (prevTextRun.text ?? '') + extra;
        if (prevTextRun.pmStart != null) {
          prevTextRun.pmEnd = prevTextRun.pmStart + prevTextRun.text.length;
        } else if (prevTextRun.pmEnd != null) {
          prevTextRun.pmEnd = prevTextRun.pmEnd + extra.length;
        }
        continue;
      }
    }

    const next = normalized[i + 1];
    if (next && (next.kind === 'text' || next.kind === undefined) && 'text' in next) {
      const nextTextRun = next as TextRun;
      if (textRunMergeSignature(nextTextRun) === textRunMergeSignature(textRun)) {
        const extra = textRun.text ?? '';
        nextTextRun.text = extra + (nextTextRun.text ?? '');
        if (textRun.pmStart != null) {
          nextTextRun.pmStart = textRun.pmStart;
        } else if (nextTextRun.pmStart != null) {
          nextTextRun.pmStart = nextTextRun.pmStart - extra.length;
        }
        if (nextTextRun.pmStart != null && nextTextRun.pmEnd == null) {
          nextTextRun.pmEnd = nextTextRun.pmStart + nextTextRun.text.length;
        }
        continue;
      }
    }

    merged.push(textRun);
  }

  // Suppress trailing wrap-point spaces on justified lines. With `white-space: pre`, they would
  // otherwise consume width and be stretched by word-spacing, producing a ragged visible edge.
  // Preserve intentionally space-only lines (rare but supported).
  const hasNonSpaceText = merged.some(
    (run) => (run.kind === 'text' || run.kind === undefined) && 'text' in run && (run.text ?? '').trim().length > 0,
  );
  if (hasNonSpaceText) {
    for (let i = merged.length - 1; i >= 0; i -= 1) {
      const run = merged[i];
      if ((run.kind !== 'text' && run.kind !== undefined) || !('text' in run)) continue;
      const text = run.text ?? '';
      let trimCount = 0;
      for (let j = text.length - 1; j >= 0 && text[j] === ' '; j -= 1) {
        trimCount += 1;
      }
      if (trimCount === 0) break;

      const nextText = text.slice(0, Math.max(0, text.length - trimCount));
      if (nextText.length === 0) {
        merged.splice(i, 1);
        continue;
      }
      (run as TextRun).text = nextText;
      if ((run as TextRun).pmEnd != null) {
        (run as TextRun).pmEnd = (run as TextRun).pmEnd! - trimCount;
      }
      break;
    }
  }

  return merged;
};

export const renderLine = ({
  block,
  line,
  context,
  availableWidthOverride,
  lineIndex,
  skipJustify,
  preExpandedRuns,
  resolvedListTextStartPx,
  indentOffsetOverride,
  paragraphMarkLeftOffsetOverride,
  runContext,
}: RenderLineParams): HTMLElement => {
  const expandedBlock = { ...block, runs: preExpandedRuns ?? expandRunsForInlineNewlines(block.runs) };
  const lineRange = computeLinePmRange(expandedBlock, line);
  let runsForLine = sliceRunsForLine(expandedBlock, line);

  const el = runContext.doc.createElement('div');
  el.classList.add(CLASS_NAMES.line);
  applyStyles(el, lineStyles(line.lineHeight));
  el.dataset.layoutEpoch = String(runContext.layoutEpoch);
  const paragraphAttrs = (block.attrs as ParagraphAttrs | undefined) ?? {};
  const styleId = paragraphAttrs.styleId;
  if (styleId) {
    el.setAttribute('styleid', styleId);
  }
  const pAttrs = block.attrs as ParagraphAttrs | undefined;
  const isRtl = applyRtlStyles(el, pAttrs);

  if (lineRange.pmStart != null) {
    el.dataset.pmStart = String(lineRange.pmStart);
  }
  if (lineRange.pmEnd != null) {
    el.dataset.pmEnd = String(lineRange.pmEnd);
  }
  const trackedConfig = runContext.resolveTrackedChangesConfig(block);

  // Preserve PM positions for DOM caret mapping on empty lines.
  if (runsForLine.length === 0) {
    const span = runContext.doc.createElement('span');
    span.classList.add('superdoc-empty-run');
    if (lineRange.pmStart != null) {
      span.dataset.pmStart = String(lineRange.pmStart);
    }
    if (lineRange.pmEnd != null) {
      span.dataset.pmEnd = String(lineRange.pmEnd);
    }
    // Restore font-size so the &nbsp; remains a visible caret target
    // (the line container sets fontSize: 0 to eliminate the CSS strut).
    span.style.fontSize = `${line.lineHeight}px`;
    span.innerHTML = '&nbsp;';
    el.appendChild(span);
  }

  // Render tab leaders (absolute positioned overlays)
  if (line.leaders && line.leaders.length > 0) {
    line.leaders.forEach((ld) => {
      const leaderEl = runContext.doc.createElement('div');
      leaderEl.classList.add('superdoc-leader');
      leaderEl.setAttribute('data-style', ld.style);
      leaderEl.style.position = 'absolute';
      leaderEl.style.left = `${ld.from}px`;
      leaderEl.style.width = `${Math.max(0, ld.to - ld.from)}px`;
      // Align leaders closer to the text baseline using measured descent
      const baselineOffset = Math.max(1, Math.round(Math.max(1, line.descent * 0.5)));
      leaderEl.style.bottom = `${baselineOffset}px`;
      leaderEl.style.height = ld.style === 'heavy' ? '2px' : '1px';
      leaderEl.style.pointerEvents = 'none';
      leaderEl.style.zIndex = '0'; // Same layer as line, text will be z-index: 1

      // Map leader styles to CSS
      if (ld.style === 'dot' || ld.style === 'middleDot') {
        leaderEl.style.borderBottom = '1px dotted currentColor';
      } else if (ld.style === 'hyphen') {
        leaderEl.style.borderBottom = '1px dashed currentColor';
      } else if (ld.style === 'underscore') {
        leaderEl.style.borderBottom = '1px solid currentColor';
      } else if (ld.style === 'heavy') {
        leaderEl.style.borderBottom = '2px solid currentColor';
      }

      el.appendChild(leaderEl);
    });
  }

  // Render bar tabs (vertical hairlines)
  if (line.bars && line.bars.length > 0) {
    line.bars.forEach((bar) => {
      const barEl = runContext.doc.createElement('div');
      barEl.classList.add('superdoc-tab-bar');
      barEl.style.position = 'absolute';
      barEl.style.left = `${bar.x}px`;
      barEl.style.top = '0px';
      barEl.style.bottom = '0px';
      barEl.style.width = '1px';
      barEl.style.background = 'currentColor';
      barEl.style.opacity = '0.6';
      barEl.style.pointerEvents = 'none';
      el.appendChild(barEl);
    });
  }

  // Check if any segments have explicit X positioning (from tab stops)
  const hasExplicitPositioning = line.segments?.some((seg) => seg.x !== undefined);
  const explicitPositionedSegmentCount = line.segments?.filter((seg) => seg.x !== undefined).length ?? 0;
  const hasMultipleExplicitPositionedSegments = explicitPositionedSegmentCount > 1;
  const availableWidth = availableWidthOverride ?? line.maxWidth ?? line.width;

  const justifyShouldApply = shouldApplyJustify({
    alignment: (block as ParagraphBlock).attrs?.alignment,
    hasExplicitPositioning: hasExplicitPositioning ?? false,
    hasExplicitTabStops: line.hasExplicitTabStops === true,
    // Caller already folds last-line + trailing lineBreak behavior into skipJustify.
    isLastLineOfParagraph: false,
    paragraphEndsWithLineBreak: false,
    skipJustifyOverride: skipJustify || hasMultipleExplicitPositionedSegments,
  });

  if (justifyShouldApply) {
    // The measurer trims wrap-point trailing spaces from line ranges, but slicing can still
    // produce whitespace-only runs at style boundaries. These runs are especially problematic
    // for justify because `word-spacing` behavior is inconsistent on pure-whitespace spans.
    //
    // Normalize by merging whitespace-only slices into adjacent runs with identical styling.
    runsForLine = normalizeJustifiedRuns(runsForLine);
  }

  const spaceCount =
    line.spaceCount ??
    runsForLine.reduce((sum, run) => {
      if ((run.kind !== 'text' && run.kind !== undefined) || !('text' in run) || run.text == null) return sum;
      return sum + countSpaces(run.text);
    }, 0);
  const lineWidth = line.naturalWidth ?? line.width;
  const spacingPerSpace = calculateJustifySpacing({
    lineWidth,
    availableWidth,
    spaceCount,
    shouldJustify: justifyShouldApply,
  });
  const lineContainsInlineImage = runsForLine.some((run) => isImageRun(run));
  const resolveLineIndentOffset = (): number => {
    if (indentOffsetOverride != null) {
      return indentOffsetOverride;
    }

    const paraIndent = (block.attrs as ParagraphAttrs | undefined)?.indent;
    const indentLeft = paraIndent?.left ?? 0;
    const firstLine = paraIndent?.firstLine ?? 0;
    const hanging = paraIndent?.hanging ?? 0;
    const isFirstLineOfPara = lineIndex === 0 || lineIndex === undefined;
    const firstLineOffsetForCumX = isFirstLineOfPara ? firstLine - hanging : 0;
    const wordLayoutValue = (block.attrs as ParagraphAttrs | undefined)?.wordLayout;
    const wordLayout = isMinimalWordLayout(wordLayoutValue) ? wordLayoutValue : undefined;
    const isListParagraph = Boolean(wordLayout?.marker);
    const fallbackListTextStartPx =
      typeof wordLayout?.marker?.textStartX === 'number' && Number.isFinite(wordLayout.marker.textStartX)
        ? wordLayout.marker.textStartX
        : typeof wordLayout?.textStartPx === 'number' && Number.isFinite(wordLayout.textStartPx)
          ? wordLayout.textStartPx
          : undefined;
    const listIndentOffset = isFirstLineOfPara
      ? (resolvedListTextStartPx ?? fallbackListTextStartPx ?? indentLeft)
      : indentLeft;

    return isListParagraph ? listIndentOffset : indentLeft + firstLineOffsetForCumX;
  };
  const lineTextStartOffsetPx =
    paragraphMarkLeftOffsetOverride != null ? paragraphMarkLeftOffsetOverride : resolveLineIndentOffset();
  const paragraphMarkLeftOffsetPx = lineTextStartOffsetPx;

  if (spacingPerSpace !== 0) {
    // Each rendered line is its own block; relying on text-align-last is brittle, so we use word-spacing.
    el.style.wordSpacing = `${spacingPerSpace}px`;
  }

  if (shouldUseSegmentPositioning(hasExplicitPositioning ?? false, Boolean(line.segments), isRtl)) {
    renderExplicitlyPositionedRuns({
      block,
      line,
      context,
      el,
      lineTextStartOffsetPx,
      spacingPerSpace,
      styleId,
      runContext,
      trackedConfig,
      lineContainsInlineImage,
    });
  } else {
    renderInlineRuns({
      runsForLine,
      line,
      context,
      el,
      styleId,
      runContext,
      trackedConfig,
      lineContainsInlineImage,
    });
  }

  appendFormattingParagraphMark(
    el,
    line,
    expandedBlock.runs,
    paragraphMarkLeftOffsetPx,
    availableWidth,
    hasExplicitPositioning ?? false,
    runContext.doc,
    runContext.showFormattingMarks,
  );

  // Post-process: Apply tooltip accessibility for any links with pending tooltips
  // This must happen after elements are in the DOM so aria-describedby can reference siblings
  const anchors = el.querySelectorAll('a[href]');
  anchors.forEach((anchor) => {
    const pendingTooltip = runContext.pendingTooltips.get(anchor as HTMLElement);
    if (pendingTooltip) {
      applyTooltipAccessibility(anchor as HTMLAnchorElement, pendingTooltip, runContext);
      runContext.pendingTooltips.delete(anchor as HTMLElement); // Clean up memory
    }
  });

  return el;
};

type RunRenderBranchParams = {
  line: import('@superdoc/contracts').Line;
  context: import('../renderer.js').FragmentRenderContext;
  el: HTMLElement;
  styleId?: string;
  runContext: RenderLineParams['runContext'];
  trackedConfig: ReturnType<RenderLineParams['runContext']['resolveTrackedChangesConfig']>;
  lineContainsInlineImage: boolean;
};

const renderExplicitlyPositionedRuns = ({
  block,
  line,
  context,
  el,
  lineTextStartOffsetPx,
  spacingPerSpace,
  styleId,
  runContext,
  trackedConfig,
  lineContainsInlineImage,
}: RunRenderBranchParams & {
  block: ParagraphBlock;
  lineTextStartOffsetPx: number;
  spacingPerSpace: number;
}): void => {
  // Use segment-based rendering with absolute positioning for tab-aligned text.
  // shouldUseSegmentPositioning returns false for RTL because the layout engine
  // computes tab positions in LTR order; RTL lines fall through to inline-flow
  // rendering where dir="rtl" lets the browser handle tab positioning.
  //
  // The segment x positions from layout are relative to the content area (left margin = 0).
  // We need to add the paragraph indent to ALL positions (both explicit and calculated).
  // Segment x positions and paragraph marks both need the visual text start,
  // including list marker/suffix space when the resolved layout provides it.
  const indentOffset = lineTextStartOffsetPx;
  let cumulativeX = 0; // Start at 0, we'll add indentOffset when positioning

  const segments = line.segments!;
  const segmentsByRun = new Map<number, LineSegment[]>();
  segments.forEach((segment) => {
    const list = segmentsByRun.get(segment.runIndex);
    if (list) {
      list.push(segment);
    } else {
      segmentsByRun.set(segment.runIndex, [segment]);
    }
  });

  /**
   * Finds the immediate next segment carrying tab geometry after a given run index.
   * This handles tab-aligned text and compensated tab paint geometry.
   *
   * WHY ONLY THE IMMEDIATE NEXT RUN:
   * When rendering a tab, we need to know where the content IMMEDIATELY after this tab begins
   * to correctly size the tab element. We don't look beyond the immediate next run because:
   * 1. Each tab is independent and should only consider its directly adjacent content
   * 2. Looking further ahead would incorrectly span multiple tabs or unrelated runs
   * 3. If there's another tab between this tab and some content, that intermediate tab is
   *    responsible for its own layout - we shouldn't reach across it
   *
   * For example, given: "Text[TAB1]Content[TAB2]MoreContent"
   * - When sizing TAB1, we only check "Content" (immediate next run)
   * - We don't check "MoreContent" because TAB2 is in between
   * - TAB2 will independently check "MoreContent" when it's rendered
   *
   * @param fromRunIndex - The run index to search after
   * @returns The immediate next tab-positioned segment, or undefined if not found or not immediate
   */
  const findImmediateNextSegment = (fromRunIndex: number): LineSegment | undefined => {
    // Only check the immediate next run - don't skip over other tabs
    const nextRunIdx = fromRunIndex + 1;
    if (nextRunIdx <= line.toRun) {
      const nextSegments = segmentsByRun.get(nextRunIdx);
      if (nextSegments && nextSegments.length > 0) {
        const firstSegment = nextSegments[0];
        // Return only the first segment; later segments in the same run are
        // not immediately adjacent to this tab.
        return firstSegment.x !== undefined || firstSegment.precedingTabEndX !== undefined ? firstSegment : undefined;
      }
    }
    return undefined;
  };

  // Inline SDT wrapping for geometry path (absolute-positioned elements).
  // Same concept as the run-based path's SDT wrapper, but here elements use
  // position:absolute so the wrapper itself must be absolutely positioned to
  // span from the leftmost to rightmost child element.
  let geoSdtWrapper: HTMLElement | null = null;
  let geoSdtId: string | null = null;
  let geoSdtWrapperLeft = 0;
  let geoSdtMaxRight = 0;

  const closeGeoSdtWrapper = () => {
    if (geoSdtWrapper) {
      geoSdtWrapper.style.width = `${geoSdtMaxRight - geoSdtWrapperLeft}px`;
      el.appendChild(geoSdtWrapper);
      geoSdtWrapper = null;
      geoSdtId = null;
    }
  };

  /**
   * Append an element to the line, routing through an inline SDT wrapper
   * when the run has inline structuredContent metadata.
   */
  const appendToLineGeo = (elem: HTMLElement, runForSdt: Run, elemLeftPx: number, elemWidthPx: number) => {
    const resolved = runContext.resolveRunSdtId(runForSdt);
    const thisRunSdtId = resolved?.sdtId ?? null;

    if (thisRunSdtId !== geoSdtId) {
      closeGeoSdtWrapper();
    }

    if (resolved) {
      if (!geoSdtWrapper) {
        geoSdtWrapper = runContext.createInlineSdtWrapper(resolved.sdt);
        if (isEmptyInlineSdtPlaceholderRun(runForSdt)) {
          geoSdtWrapper.dataset.empty = 'true';
        }
        geoSdtId = thisRunSdtId;
        geoSdtWrapperLeft = elemLeftPx;
        geoSdtMaxRight = elemLeftPx;
        geoSdtWrapper.style.position = 'absolute';
        geoSdtWrapper.style.left = `${elemLeftPx}px`;
        geoSdtWrapper.style.top = '0px';
        geoSdtWrapper.style.height = `${line.lineHeight}px`;
      }
      runContext.syncInlineSdtWrapperTypography(geoSdtWrapper, runForSdt);
      elem.style.left = `${elemLeftPx - geoSdtWrapperLeft}px`;
      geoSdtMaxRight = Math.max(geoSdtMaxRight, elemLeftPx + elemWidthPx);
      runContext.expandSdtWrapperPmRange(geoSdtWrapper, (runForSdt as TextRun).pmStart, (runForSdt as TextRun).pmEnd);
      geoSdtWrapper.appendChild(elem);
    } else {
      el.appendChild(elem);
    }
  };

  for (let runIndex = line.fromRun; runIndex <= line.toRun; runIndex += 1) {
    const baseRun = block.runs[runIndex];
    if (!baseRun) continue;

    if (baseRun.kind === 'tab') {
      // Find where the immediate next content begins (if it's right after this tab)
      const immediateNextSegment = findImmediateNextSegment(runIndex);
      const tabStartX = cumulativeX;
      const {
        element: tabEl,
        tabEndX,
        actualTabWidth,
      } = renderPositionedTabRun(
        baseRun,
        line,
        runContext.doc,
        runContext.layoutEpoch,
        tabStartX,
        indentOffset,
        immediateNextSegment,
        styleId,
      );
      appendToLineGeo(tabEl, baseRun, tabStartX + indentOffset, actualTabWidth);

      // Update cumulativeX to where the next content begins
      // This ensures proper positioning for subsequent elements
      cumulativeX = tabEndX;
      continue;
    }

    // Handle ImageRun - render as-is (no slicing needed, atomic unit)
    if (isImageRun(baseRun)) {
      const elem = renderRun(baseRun, context, runContext, trackedConfig);
      if (elem) {
        if (styleId) {
          elem.setAttribute('styleid', styleId);
        }
        // Position image using explicit segment X when available; fallback to cumulative flow
        // Add indentOffset to position content at the correct paragraph indent.
        const runSegments = segmentsByRun.get(runIndex);
        const baseSegX = runSegments && runSegments[0]?.x !== undefined ? runSegments[0].x : cumulativeX;
        const segX = baseSegX + indentOffset;
        // LineSegment.width is required by contract; producer (measuring-dom) always emits it.
        // No paint-time DOM measurement (SD-2957).
        const segWidth = runSegments?.[0]?.width ?? 0;
        elem.style.position = 'absolute';
        elem.style.left = `${segX}px`;
        appendToLineGeo(elem, baseRun, segX, segWidth);
        cumulativeX = baseSegX + segWidth;
      }
      continue;
    }

    // Handle LineBreakRun - line breaks are handled by line creation, skip here
    if (isLineBreakRun(baseRun)) {
      continue;
    }

    // Handle BreakRun - breaks are handled by line creation, skip here
    if (isBreakRun(baseRun)) {
      continue;
    }

    // Handle FieldAnnotationRun - render as-is (no slicing needed, atomic unit like images)
    if (isFieldAnnotationRun(baseRun)) {
      const elem = renderRun(baseRun, context, runContext, trackedConfig);
      if (elem) {
        if (styleId) {
          elem.setAttribute('styleid', styleId);
        }
        // Position using explicit segment X when available; fallback to cumulative flow
        // Add indentOffset to position content at the correct paragraph indent.
        const runSegments = segmentsByRun.get(runIndex);
        const baseSegX = runSegments && runSegments[0]?.x !== undefined ? runSegments[0].x : cumulativeX;
        const segX = baseSegX + indentOffset;
        const segWidth = (runSegments && runSegments[0]?.width !== undefined ? runSegments[0].width : 0) ?? 0;
        elem.style.position = 'absolute';
        elem.style.left = `${segX}px`;
        appendToLineGeo(elem, baseRun, segX, segWidth);
        cumulativeX = baseSegX + segWidth;
      }
      continue;
    }

    // Handle MathRun - render as-is (atomic unit like images)
    if (isMathRun(baseRun)) {
      const elem = renderRun(baseRun, context, runContext, trackedConfig);
      if (elem) {
        if (styleId) {
          elem.setAttribute('styleid', styleId);
        }
        const runSegments = segmentsByRun.get(runIndex);
        const baseSegX = runSegments && runSegments[0]?.x !== undefined ? runSegments[0].x : cumulativeX;
        const segX = baseSegX + indentOffset;
        const segWidth =
          (runSegments && runSegments[0]?.width !== undefined ? runSegments[0].width : baseRun.width) ?? 0;
        elem.style.position = 'absolute';
        elem.style.left = `${segX}px`;
        appendToLineGeo(elem, baseRun, segX, segWidth);
        cumulativeX = baseSegX + segWidth;
      }
      continue;
    }

    const runSegments = segmentsByRun.get(runIndex);
    if (!runSegments || runSegments.length === 0) {
      continue;
    }

    if (isEmptySdtPlaceholderRun(baseRun)) {
      const elem = renderRun(baseRun, context, runContext, trackedConfig);
      if (elem) {
        if (styleId) {
          elem.setAttribute('styleid', styleId);
        }
        const segment = runSegments[0]!;
        const baseX = segment.x !== undefined ? segment.x : cumulativeX;
        const xPos = baseX + indentOffset;
        elem.style.position = 'absolute';
        elem.style.left = `${xPos}px`;
        appendToLineGeo(elem, baseRun, xPos, segment.width);
        cumulativeX = baseX + segment.width;
      }
      continue;
    }

    // At this point, baseRun must be TextRun (has .text property)
    if (!('text' in baseRun)) {
      continue;
    }

    const baseText = baseRun.text ?? '';
    const runPmStart = baseRun.pmStart ?? null;
    const fallbackPmEnd =
      runPmStart != null && baseRun.pmEnd == null ? runPmStart + baseText.length : (baseRun.pmEnd ?? null);

    runSegments.forEach((segment) => {
      const segmentText = baseText.slice(segment.fromChar, segment.toChar);
      if (!segmentText) return;

      const pmSliceStart = runPmStart != null ? runPmStart + segment.fromChar : undefined;
      const pmSliceEnd = runPmStart != null ? runPmStart + segment.toChar : (fallbackPmEnd ?? undefined);
      const segmentRun: TextRun = {
        ...(baseRun as TextRun),
        text: segmentText,
        pmStart: pmSliceStart,
        pmEnd: pmSliceEnd,
      };

      const elem = renderRun(segmentRun, context, runContext, trackedConfig);
      if (elem) {
        if (styleId) {
          elem.setAttribute('styleid', styleId);
        }
        alignNormalTextBesideInlineImage(elem, segmentRun, lineContainsInlineImage);
        // Determine X position for this segment
        // Layout positions are relative to content area start (0).
        // Add indentOffset to position content at the correct paragraph indent.
        const baseX = segment.x !== undefined ? segment.x : cumulativeX;
        const xPos = baseX + indentOffset;

        elem.style.position = 'absolute';
        elem.style.left = `${xPos}px`;
        appendToLineGeo(elem, segmentRun, xPos, segment.width);

        // Advance cumulative X by the resolved segment width. LineSegment.width is the
        // sole source of truth — the painter does not measure inline elements (SD-2957).
        // Use baseX (without indent) to keep cumulativeX relative to content area,
        // matching how segment.x values are calculated in layout.
        const width = segment.width;
        const justifyExtraWidth = spacingPerSpace !== 0 ? spacingPerSpace * countSpaces(segmentText) : 0;
        const visualWidth = width + justifyExtraWidth;
        cumulativeX = baseX + visualWidth;
        // Update SDT wrapper width if actual measured width differs from initial estimate
        if (geoSdtWrapper) {
          geoSdtMaxRight = Math.max(geoSdtMaxRight, xPos + visualWidth);
        }
      }
    });
  }
  // Close any remaining SDT wrapper at end of geometry rendering
  closeGeoSdtWrapper();
};

const renderInlineRuns = ({
  runsForLine,
  line,
  context,
  el,
  styleId,
  runContext,
  trackedConfig,
  lineContainsInlineImage,
}: RunRenderBranchParams & { runsForLine: Run[] }): void => {
  // Use run-based rendering for normal text flow
  // Track current inline SDT wrapper to group adjacent runs with the same SDT id
  let currentInlineSdtWrapper: HTMLElement | null = null;
  let currentInlineSdtId: string | null = null;

  const closeCurrentWrapper = () => {
    if (currentInlineSdtWrapper) {
      el.appendChild(currentInlineSdtWrapper);
      currentInlineSdtWrapper = null;
      currentInlineSdtId = null;
    }
  };

  runsForLine.forEach((run) => {
    // Check if this run has inline structuredContent SDT
    const resolved = runContext.resolveRunSdtId(run);
    const runSdtId = resolved?.sdtId ?? null;

    // If SDT context changed, close the current wrapper
    if (runSdtId !== currentInlineSdtId) {
      closeCurrentWrapper();
    }

    // Special handling for TabRuns (e.g., signature lines with underlines)
    const elem =
      run.kind === 'tab'
        ? renderInlineTabRun(run, line, runContext.doc, runContext.layoutEpoch, styleId)
        : renderRun(run, context, runContext, trackedConfig);

    if (elem) {
      if (styleId) {
        elem.setAttribute('styleid', styleId);
      }
      alignNormalTextBesideInlineImage(elem, run, lineContainsInlineImage);

      // If this run has inline SDT, add to or create wrapper
      if (resolved) {
        if (!currentInlineSdtWrapper) {
          currentInlineSdtWrapper = runContext.createInlineSdtWrapper(resolved.sdt);
          if (isEmptyInlineSdtPlaceholderRun(run)) {
            currentInlineSdtWrapper.dataset.empty = 'true';
          }
          runContext.syncInlineSdtWrapperTypography(currentInlineSdtWrapper, run);
          currentInlineSdtId = runSdtId;
        }
        // Typography is set when wrapper is created from the first run.
        // Follow-up (SD-2744): define a deterministic mixed-typography rule.
        runContext.expandSdtWrapperPmRange(currentInlineSdtWrapper, run.pmStart, run.pmEnd);
        currentInlineSdtWrapper.appendChild(elem);
      } else {
        el.appendChild(elem);
      }
    }
  });

  // Close any remaining wrapper at end of line
  closeCurrentWrapper();
};
