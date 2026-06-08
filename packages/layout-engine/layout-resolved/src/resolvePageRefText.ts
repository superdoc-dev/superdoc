import type { PageRefLocation, TextRun } from '@superdoc/contracts';
import {
  formatChapterPageNumberText,
  formatIntegerWithNumericPicture,
  formatPageNumberFieldValue,
} from '@superdoc/contracts';

export function resolvePageRefText(args: {
  sourcePage: number;
  sourcePmPosition?: number;
  target: PageRefLocation;
  metadata: NonNullable<TextRun['pageRefMetadata']>;
}): string {
  const formattedTargetPageText = formatTargetPageText(args.target, args.metadata);

  if (!args.metadata.relativePosition) {
    return formattedTargetPageText;
  }

  if (args.sourcePage !== args.target.physicalPage) {
    return `on page ${formattedTargetPageText}`;
  }

  return args.target.pmPosition != null &&
    args.sourcePmPosition != null &&
    args.target.pmPosition < args.sourcePmPosition
    ? 'above'
    : 'below';
}

function formatTargetPageText(target: PageRefLocation, metadata: NonNullable<TextRun['pageRefMetadata']>): string {
  const displayNumber = Math.max(1, Math.trunc(Number.isFinite(target.displayNumber) ? target.displayNumber : 1));

  if (metadata.numericPictureFormat) {
    return formatChapterPageNumberText({
      pageComponent: formatIntegerWithNumericPicture(displayNumber, metadata.numericPictureFormat.picture),
      chapterNumberText: target.chapterNumberText,
      chapterSeparator: target.chapterSeparator,
    });
  }

  if (metadata.pageNumberFieldFormat) {
    return formatChapterPageNumberText({
      pageComponent: formatPageNumberFieldValue(displayNumber, metadata.pageNumberFieldFormat),
      chapterNumberText: target.chapterNumberText,
      chapterSeparator: target.chapterSeparator,
    });
  }

  return target.displayText;
}
