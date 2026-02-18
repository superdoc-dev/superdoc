import type { TextRun } from '@superdoc/contracts';
import type { PMMark } from '../../types.js';
import { applyMarksToRun } from '../../marks/index.js';
import { applyInlineRunProperties, type InlineConverterParams } from './common.js';
import { TOKEN_INLINE_TYPES } from '../../constants.js';

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
export function tokenNodeToRun({
  node,
  positions,
  defaultFont,
  defaultSize,
  inheritedMarks,
  hyperlinkConfig,
  themeColors,
  sdtMetadata,
  runProperties,
  converterContext,
}: InlineConverterParams): TextRun | null {
  const token = TOKEN_INLINE_TYPES.get(node.type);
  if (!token) {
    return null;
  }

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

  applyInlineRunProperties(run, runProperties, converterContext);

  // If marksAsAttrs carried font styling, mark the run so downstream defaults don't overwrite it.
  if (marksAsAttrs.length > 0) {
    (run as TextRun & { _explicitFont?: boolean })._explicitFont = true;
  }

  if (sdtMetadata) {
    run.sdt = sdtMetadata;
  }
  return run;
}
