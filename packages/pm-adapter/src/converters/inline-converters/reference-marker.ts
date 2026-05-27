/**
 * Shared helper for footnote and endnote reference markers.
 *
 * Reference markers must render as plain digits ("1", "2") with superscript
 * positioning, NOT as Unicode superscript glyphs ("¹", "²"). This module
 * applies exactly one superscript treatment for the default case, while still
 * preserving explicit custom positioning when the source document provides it.
 */

import { hasExplicitBaselineShift, type TextRun } from '@superdoc/contracts';
import type { RunProperties } from '@superdoc/style-engine/ooxml';
import type { PMMark, PMNode } from '../../types.js';
import { SUBSCRIPT_SUPERSCRIPT_SCALE } from '../../constants.js';
import { textNodeToRun } from './text-run.js';
import type { InlineConverterParams } from './common.js';

const buildSyntheticTextNode = (displayText: string, marks: PMMark[] | undefined): PMNode => ({
  type: 'text',
  text: displayText,
  marks: [...(marks ?? [])],
});

const isTextStyleMark = (mark: PMMark): boolean => mark.type === 'textStyle';

const stripVerticalPositioningFromMark = (mark: PMMark): PMMark | null => {
  if (!isTextStyleMark(mark) || !mark.attrs) {
    return mark;
  }

  const sanitizedAttrs = { ...mark.attrs };
  delete sanitizedAttrs.vertAlign;
  delete sanitizedAttrs.position;

  if (Object.keys(sanitizedAttrs).length === 0) {
    return null;
  }

  return {
    ...mark,
    attrs: sanitizedAttrs,
  };
};

const stripVerticalPositioningFromMarks = (marks: PMMark[] | undefined): PMMark[] =>
  (marks ?? []).flatMap((mark) => {
    const sanitizedMark = stripVerticalPositioningFromMark(mark);
    return sanitizedMark ? [sanitizedMark] : [];
  });

const stripVerticalPositioningFromRunProperties = (
  runProperties: RunProperties | undefined,
): RunProperties | undefined => {
  if (!runProperties) {
    return undefined;
  }

  const sanitizedRunProperties = { ...runProperties };
  delete sanitizedRunProperties.vertAlign;
  delete sanitizedRunProperties.position;
  return sanitizedRunProperties;
};

const copyReferencePmPositions = (run: TextRun, params: InlineConverterParams): TextRun => {
  const refPos = params.positions.get(params.node);
  if (!refPos) {
    return run;
  }

  return {
    ...run,
    pmStart: refPos.start,
    pmEnd: refPos.end,
  };
};

const resolveReferenceBaseFontSize = (
  runWithoutVerticalPositioning: TextRun,
  originalRun: TextRun,
  fallbackFontSize: number,
): number => {
  if (
    typeof runWithoutVerticalPositioning.fontSize === 'number' &&
    Number.isFinite(runWithoutVerticalPositioning.fontSize)
  ) {
    return runWithoutVerticalPositioning.fontSize;
  }

  if (typeof originalRun.fontSize === 'number' && Number.isFinite(originalRun.fontSize)) {
    return originalRun.fontSize;
  }

  return fallbackFontSize;
};

const buildOriginalReferenceRun = (displayText: string, params: InlineConverterParams): TextRun =>
  textNodeToRun({
    ...params,
    node: buildSyntheticTextNode(displayText, params.node.marks),
  });

const buildReferenceRunWithoutVerticalPositioning = (displayText: string, params: InlineConverterParams): TextRun =>
  textNodeToRun({
    ...params,
    inheritedMarks: stripVerticalPositioningFromMarks(params.inheritedMarks),
    runProperties: stripVerticalPositioningFromRunProperties(params.runProperties),
    node: buildSyntheticTextNode(displayText, stripVerticalPositioningFromMarks(params.node.marks)),
  });

/**
 * Builds a TextRun for a footnote or endnote reference marker.
 *
 * Inherits font family, color, and other styling from the parent run context,
 * then normalizes the marker rendering:
 * - explicit custom baseline shifts are preserved as-is
 * - the default path uses exactly one superscript treatment, sized from the
 *   effective surrounding run, not the paragraph default
 */
export function buildReferenceMarkerRun(displayText: string, params: InlineConverterParams): TextRun {
  const originalRun = buildOriginalReferenceRun(displayText, params);

  if (hasExplicitBaselineShift(originalRun.baselineShift)) {
    return copyReferencePmPositions(originalRun, params);
  }

  const runWithoutVerticalPositioning = buildReferenceRunWithoutVerticalPositioning(displayText, params);
  const baseFontSize = resolveReferenceBaseFontSize(runWithoutVerticalPositioning, originalRun, params.defaultSize);

  return copyReferencePmPositions(
    {
      ...originalRun,
      vertAlign: 'superscript',
      baselineShift: undefined,
      fontSize: baseFontSize * SUBSCRIPT_SUPERSCRIPT_SCALE,
    },
    params,
  );
}
