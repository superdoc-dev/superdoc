/**
 * Text Run Converter Module
 *
 * Functions for converting ProseMirror text nodes to TextRun and TabRun blocks:
 * - Text node conversion
 * - Tab node conversion
 * - Token node conversion (page numbers, etc.)
 */

import type { TextRun } from '@superdoc/contracts';
import type { PMNode, PMMark, PositionMap, HyperlinkConfig, ThemeColorPalette } from '../../types.js';
import { applyMarksToRun } from '../../marks/index.js';
import { DEFAULT_HYPERLINK_CONFIG } from '../../constants.js';
import { applyInlineRunProperties, type InlineConverterParams } from './common.js';

/**
 * Converts a text PM node to a TextRun.
 *
 * @param node - PM text node to convert
 * @param positions - Position map for PM node tracking
 * @param defaultFont - Default font family
 * @param defaultSize - Default font size
 * @param inheritedMarks - Marks inherited from parent nodes
 * @param sdtMetadata - Optional SDT metadata to attach
 * @param hyperlinkConfig - Hyperlink configuration
 * @returns TextRun block
 */
export function textNodeToRun({
  node,
  positions,
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
    text: node.text || '',
    fontFamily: defaultFont,
    fontSize: defaultSize,
  };

  // Attach PM position tracking
  const pos = positions.get(node);
  if (pos) {
    run.pmStart = pos.start;
    run.pmEnd = pos.end;
    // Per-run creation logs removed to reduce noise
  }

  applyMarksToRun(
    run,
    [...(node.marks ?? []), ...(inheritedMarks ?? [])],
    hyperlinkConfig,
    themeColors,
    converterContext?.backgroundColor,
    enableComments,
  );
  if (sdtMetadata) {
    run.sdt = sdtMetadata;
  }
  run = applyInlineRunProperties(run, runProperties, converterContext);

  return run;
}

/**
 * Converts a token PM node (e.g., page-number) to a TextRun with token metadata.
 *
 * @param node - PM token node to convert
 * @param positions - Position map for PM node tracking
 * @param defaultFont - Default font family
 * @param defaultSize - Default font size
 * @param inheritedMarks - Marks inherited from parent nodes
 * @param token - Token type (e.g., 'pageNumber', 'totalPageCount')
 * @param hyperlinkConfig - Hyperlink configuration
 * @returns TextRun block with token metadata
 */
export function tokenNodeToRun(
  node: PMNode,
  positions: PositionMap,
  defaultFont: string,
  defaultSize: number,
  inheritedMarks: PMMark[] = [],
  token: TextRun['token'],
  hyperlinkConfig: HyperlinkConfig = DEFAULT_HYPERLINK_CONFIG,
  themeColors?: ThemeColorPalette,
): TextRun {
  // Tokens carry a placeholder character so measurers reserve width; painters will replace it with the real value.
  const run: TextRun = {
    text: '0',
    token,
    fontFamily: defaultFont,
    fontSize: defaultSize,
  };

  // Attach PM position tracking
  const pos = positions.get(node);
  if (pos) {
    run.pmStart = pos.start;
    run.pmEnd = pos.end;
  }

  // For page-number and total-page-number tokens, marks may be stored in attrs.marksAsAttrs
  // (from the autoPageNumber/totalPageNumber translator) rather than node.marks.
  // Check both locations to ensure styling is properly applied.
  const nodeMarks = node.marks ?? [];
  // marksAsAttrs is set by autoPageNumber/totalPageNumber translators during import
  // and is guaranteed to be PMMark[] when present. Validate it's an array for safety.
  const marksAsAttrs = Array.isArray(node.attrs?.marksAsAttrs) ? (node.attrs.marksAsAttrs as PMMark[]) : [];
  const effectiveMarks = nodeMarks.length > 0 ? nodeMarks : marksAsAttrs;

  const marks = [...effectiveMarks, ...(inheritedMarks ?? [])];
  applyMarksToRun(run, marks, hyperlinkConfig, themeColors);

  // If marksAsAttrs carried font styling, mark the run so downstream defaults don't overwrite it.
  if (marksAsAttrs.length > 0) {
    (run as TextRun & { _explicitFont?: boolean })._explicitFont = true;
  }
  return run;
}
