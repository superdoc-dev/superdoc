import type { TextRun } from '@superdoc/contracts';
import { applyMarksToRun } from '../../marks/index.js';
import { applyInlineRunProperties, type InlineConverterParams } from './common.js';
import { DEFAULT_HYPERLINK_CONFIG } from '../../constants.js';

const NON_BREAKING_HYPHEN = '‑';

/**
 * Converts a noBreakHyphen PM atom to a TextRun carrying U+2011.
 *
 * Renders identically to a literal U+2011 in <w:t>; the atom exists purely to preserve
 * round-trip identity back to <w:noBreakHyphen/> on export. DomPainter handles the glyph
 * via the existing text-rendering path — no painter changes needed.
 */
export function noBreakHyphenNodeToRun({
  node,
  positions,
  storyKey,
  defaultFont,
  defaultSize,
  inheritedMarks = [],
  sdtMetadata,
  hyperlinkConfig = DEFAULT_HYPERLINK_CONFIG,
  themeColors,
  enableComments,
  runProperties,
  converterContext,
}: InlineConverterParams): TextRun {
  let run: TextRun = {
    text: NON_BREAKING_HYPHEN,
    fontFamily: defaultFont,
    fontSize: defaultSize,
  };

  const pos = positions.get(node);
  if (pos) {
    run.pmStart = pos.start;
    run.pmEnd = pos.end;
  }

  applyMarksToRun(
    run,
    [...(node.marks ?? []), ...(inheritedMarks ?? [])],
    hyperlinkConfig,
    themeColors,
    converterContext?.backgroundColor,
    enableComments,
    storyKey,
  );

  if (sdtMetadata) {
    run.sdt = sdtMetadata;
  }

  run = applyInlineRunProperties(run, runProperties, converterContext);

  return run;
}
