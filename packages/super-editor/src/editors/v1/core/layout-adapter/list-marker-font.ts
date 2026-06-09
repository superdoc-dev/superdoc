/**
 * List marker font projection.
 */

import type { ParagraphAttrs, Run, TextRun } from '@superdoc/contracts';
import type { ParagraphProperties } from '@superdoc/style-engine/ooxml';
import { hasExplicitParagraphRunProperties } from './attributes/paragraph.js';
import type { ConverterContext } from './converter-context.js';
import { numberingDefinesMarkerFontFamily } from './numbering-marker-font.js';
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
    // Leading empty runs are not merged away; skip them like getLastParagraphFont so
    // stale placeholder font does not drive marker sync.
    if (typeof run.text === 'string' && run.text.length === 0) continue;
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

const resolveContentFont = (
  block: { runs: ReadonlyArray<Run> },
  para: PMNode | undefined,
  source: ListMarkerContentFontSource,
  previousParagraphFont?: ParagraphFont,
): Partial<ParagraphFont> | undefined => {
  const fromRuns = getFontFromRuns(block.runs);
  const fromPara = para ? getFontFromParagraphContent(para) : undefined;
  if (source === 'paragraph') {
    // Live textStyle: apply only what marks define (size-only edits must not pull
    // stale family from cached runs). No textStyle: prefer converted runs like the
    // fresh path, then previousParagraphFont for empty list items.
    if (fromPara) return fromPara;
    return fromRuns ?? previousParagraphFont;
  }
  return fromRuns ?? fromPara;
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

  const paragraphProperties =
    para?.attrs?.paragraphProperties != null && typeof para.attrs.paragraphProperties === 'object'
      ? (para.attrs.paragraphProperties as ParagraphProperties)
      : undefined;
  const hasLiveTextStyleFont = para ? getFontFromParagraphContent(para) != null : false;
  // Match computeParagraphAttrs: pPr/rPr already defines marker font unless the user
  // applied live textStyle marks (SD-3238 toolbar edits, including stale pPr after Enter).
  const allowBodyFontSync = !hasExplicitParagraphRunProperties(paragraphProperties) || hasLiveTextStyleFont;

  // Cache-hit path may reuse stale empty runs. Normalize empty run font so subsequent
  // getLastParagraphFont() reads the current inherited font instead of cached values.
  if (contentFontSource === 'paragraph') {
    const firstRun = block.runs[0];
    if (firstRun && isTextRun(firstRun) && firstRun.text.length === 0) {
      if (contentFont.fontFamily) firstRun.fontFamily = contentFont.fontFamily;
      if (contentFont.fontSize) firstRun.fontSize = contentFont.fontSize;
    }
  }

  const preserveNumberingFontFamily = numberingDefinesMarkerFontFamily(
    block.attrs?.numberingProperties,
    converterContext,
  );

  if (allowBodyFontSync && !preserveNumberingFontFamily && contentFont.fontFamily) {
    markerRun.fontFamily = contentFont.fontFamily;
  }
  if (allowBodyFontSync && contentFont.fontSize) {
    markerRun.fontSize = contentFont.fontSize;
  }
};
