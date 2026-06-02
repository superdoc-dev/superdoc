/**
 * List marker font projection.
 */

import type { ParagraphAttrs, Run, TextRun } from '@superdoc/contracts';
import { getNumberingProperties, type RunProperties } from '@superdoc/style-engine/ooxml';
import type { ConverterContext } from './converter-context.js';
import { applyTextStyleMark } from './marks/application.js';
import type { PMNode, ParagraphFont } from './types.js';

type ListMarkerContentFontSource = 'runs' | 'paragraph';

export type SyncListMarkerFontParams = {
  block: { attrs?: ParagraphAttrs; runs: ReadonlyArray<Run> };
  converterContext?: ConverterContext;
  para?: PMNode;
  contentFontSource?: ListMarkerContentFontSource;
  /** Used on cache hits for empty list items with no live textStyle marks. */
  previousParagraphFont?: ParagraphFont;
};

const isTextRun = (run: Run): run is TextRun => 'text' in run;

const pickFontPartial = (fontFamily?: string, fontSize?: number): Partial<ParagraphFont> | undefined => {
  const partial: Partial<ParagraphFont> = {};
  if (typeof fontFamily === 'string' && fontFamily.trim().length > 0) {
    partial.fontFamily = fontFamily.trim();
  }
  if (typeof fontSize === 'number' && Number.isFinite(fontSize) && fontSize > 0) {
    partial.fontSize = fontSize;
  }
  return Object.keys(partial).length > 0 ? partial : undefined;
};

const getFontFromRuns = (runs: ReadonlyArray<Run>): Partial<ParagraphFont> | undefined => {
  for (const run of runs) {
    if (!isTextRun(run)) continue;
    const partial = pickFontPartial(run.fontFamily, run.fontSize);
    if (partial) return partial;
  }
  return undefined;
};

const getFontFromTextStyleMark = (attrs: Record<string, unknown>): Partial<ParagraphFont> | undefined => {
  const probe: TextRun = { text: '', fontFamily: '', fontSize: 0 };
  applyTextStyleMark(probe, attrs);
  return pickFontPartial(probe.fontFamily, probe.fontSize);
};

const getFontFromParagraphContent = (node: PMNode): Partial<ParagraphFont> | undefined => {
  let found: Partial<ParagraphFont> | undefined;

  const visit = (current: unknown) => {
    if (found || current == null || typeof current !== 'object') return;
    const candidate = current as {
      isText?: boolean;
      text?: string;
      marks?: Array<{ type?: string | { name?: string }; attrs?: Record<string, unknown> }>;
      content?: { forEach: (fn: (child: unknown) => void) => void };
    };

    if ((candidate.isText === true || typeof candidate.text === 'string') && candidate.marks?.length) {
      for (const mark of candidate.marks) {
        const markType = typeof mark.type === 'string' ? mark.type : mark.type?.name;
        if (markType !== 'textStyle') continue;
        const partial = getFontFromTextStyleMark((mark.attrs ?? {}) as Record<string, unknown>);
        if (partial) {
          found = partial;
          return;
        }
      }
    }

    candidate.content?.forEach?.(visit);
  };

  visit(node);
  return found;
};

const mergeContentFont = (
  primary?: Partial<ParagraphFont>,
  secondary?: Partial<ParagraphFont>,
): Partial<ParagraphFont> | undefined => {
  if (!primary && !secondary) return undefined;
  return pickFontPartial(primary?.fontFamily ?? secondary?.fontFamily, primary?.fontSize ?? secondary?.fontSize);
};

const resolveContentFont = (
  block: { runs: ReadonlyArray<Run> },
  para: PMNode | undefined,
  source: ListMarkerContentFontSource,
  previousParagraphFont?: ParagraphFont,
): Partial<ParagraphFont> | undefined => {
  const fromRuns = getFontFromRuns(block.runs);
  const fromPara = para ? getFontFromParagraphContent(para) : undefined;
  if (source === 'paragraph') {
    // Cache hits must not fall back to stale cached runs. Empty list items have no
    // textStyle marks, so inherit from the preceding paragraph when available.
    return mergeContentFont(fromPara, previousParagraphFont);
  }
  return fromRuns ?? fromPara;
};

const getNumberingMarkerFontOverrides = (
  numberingProperties: { numId?: number; ilvl?: number } | null | undefined,
  converterContext?: ConverterContext,
): { fontFamily: boolean; fontSize: boolean } => {
  const numId = numberingProperties?.numId;
  if (numId == null || numId === 0 || !converterContext) {
    return { fontFamily: false, fontSize: false };
  }
  const ilvl = numberingProperties?.ilvl ?? 0;
  const numberingRunProps = getNumberingProperties<RunProperties>('runProperties', converterContext, ilvl, numId);
  return {
    fontFamily: numberingRunProps.fontFamily != null,
    fontSize: numberingRunProps.fontSize != null || numberingRunProps.fontSizeCs != null,
  };
};

/**
 * Sync list marker font from visible paragraph text after run conversion.
 */
export const syncListMarkerFontFromParagraphRuns = ({
  block,
  converterContext,
  para,
  contentFontSource = 'runs',
  previousParagraphFont,
}: SyncListMarkerFontParams): void => {
  const markerRun = block.attrs?.wordLayout?.marker?.run;
  if (!markerRun) return;

  const contentFont = resolveContentFont(block, para, contentFontSource, previousParagraphFont);
  if (!contentFont) return;

  // Cache-hit path may reuse stale empty runs. Normalize empty run font so subsequent
  // getLastParagraphFont() reads the current inherited font instead of cached values.
  if (contentFontSource === 'paragraph') {
    const firstRun = block.runs[0];
    if (firstRun && isTextRun(firstRun) && firstRun.text.length === 0) {
      if (contentFont.fontFamily) firstRun.fontFamily = contentFont.fontFamily;
      if (contentFont.fontSize) firstRun.fontSize = contentFont.fontSize;
    }
  }

  const numberingOverrides = getNumberingMarkerFontOverrides(block.attrs?.numberingProperties, converterContext);

  if (!numberingOverrides.fontFamily && contentFont.fontFamily) {
    markerRun.fontFamily = contentFont.fontFamily;
  }
  if (!numberingOverrides.fontSize && contentFont.fontSize) {
    markerRun.fontSize = contentFont.fontSize;
  }
};
