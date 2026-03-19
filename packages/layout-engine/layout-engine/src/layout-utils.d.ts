import type { Line, ParagraphBlock, ParagraphMeasure } from '@superdoc/contracts';
export declare function normalizeLines(measure: ParagraphMeasure): ParagraphMeasure['lines'];
export declare function sliceLines(
  lines: ParagraphMeasure['lines'],
  startIndex: number,
  availableHeight: number,
): {
  toLine: number;
  height: number;
};
export type LinePmRange = {
  pmStart?: number;
  pmEnd?: number;
};
export declare const computeFragmentPmRange: (
  block: ParagraphBlock,
  lines: ParagraphMeasure['lines'],
  fromLine: number,
  toLine: number,
) => LinePmRange;
export declare const computeLinePmRange: (block: ParagraphBlock, line: Line) => LinePmRange;
export declare function shouldSuppressOwnSpacing(
  ownStyleId: string | undefined,
  ownContextualSpacing: boolean,
  adjacentStyleId: string | undefined,
): boolean;
