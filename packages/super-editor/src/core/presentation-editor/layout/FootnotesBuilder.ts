/**
 * FootnotesBuilder - Builds footnote layout input from editor state.
 *
 * No external side effects, no DOM access, no callbacks.
 * Note: Mutates the blocks passed to ensureFootnoteMarker internally.
 *
 * ## Key Concepts
 *
 * - `pmStart`/`pmEnd`: ProseMirror document positions that map layout elements
 *   back to their source positions in the editor. Used for selection, cursor
 *   placement, and click-to-position functionality.
 *
 * - `data-sd-footnote-number`: A data attribute marking the superscript number
 *   run (e.g., "¹") at the start of footnote content. Used to distinguish the
 *   marker from actual footnote text during rendering and selection.
 *
 * @module presentation-editor/layout/FootnotesBuilder
 */

import type { EditorState } from 'prosemirror-state';
import type { FlowBlock } from '@superdoc/contracts';
import { toFlowBlocks, type ConverterContext } from '@superdoc/pm-adapter';

import type { FootnoteReference, FootnotesLayoutInput } from '../types.js';

// Re-export types for consumers
export type { FootnoteReference, FootnotesLayoutInput };

// =============================================================================
// Types
// =============================================================================

/** Minimal shape of a converter object containing footnote data. */
export type ConverterLike = {
  footnotes?: Array<{ id?: unknown; content?: unknown[] }>;
};

/** A text run within a paragraph block. */
type Run = {
  kind?: string;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  color?: unknown;
  pmStart?: number | null;
  pmEnd?: number | null;
  dataAttrs?: Record<string, string>;
};

/** Paragraph block with typed runs array. */
type ParagraphBlock = FlowBlock & {
  kind: 'paragraph';
  runs?: Run[];
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Builds footnote layout input from editor state and converter data.
 *
 * Traverses the document to find footnote references, then builds layout
 * blocks for each referenced footnote with superscript markers prepended.
 *
 * No external side effects, no DOM access, no callbacks.
 * Note: Mutates blocks internally when adding footnote markers.
 *
 * @param editorState - The ProseMirror editor state
 * @param converter - Converter with footnote data
 * @param converterContext - Context with footnote numbering info
 * @param themeColors - Theme colors for styling
 * @returns FootnotesLayoutInput if footnotes exist, null otherwise
 */
export function buildFootnotesInput(
  editorState: EditorState | null | undefined,
  converter: ConverterLike | null | undefined,
  converterContext: ConverterContext | undefined,
  themeColors: unknown,
): FootnotesLayoutInput | null {
  if (!editorState) return null;

  const footnoteNumberById = converterContext?.footnoteNumberById;
  const importedFootnotes = Array.isArray(converter?.footnotes) ? converter.footnotes : [];

  if (importedFootnotes.length === 0) return null;

  // Find footnote references in the document
  const refs: FootnoteReference[] = [];
  const idsInUse = new Set<string>();

  editorState.doc.descendants((node, pos) => {
    if (node.type?.name !== 'footnoteReference') return;
    const id = node.attrs?.id;
    if (id == null) return;
    const key = String(id);
    // Use pos + 1 to point inside the node rather than at its boundary.
    // This ensures cursor placement lands within the footnote reference.
    const insidePos = Math.min(pos + 1, editorState.doc.content.size);
    refs.push({ id: key, pos: insidePos });
    idsInUse.add(key);
  });

  if (refs.length === 0) return null;

  // Build blocks for each footnote
  const blocksById = new Map<string, FlowBlock[]>();

  idsInUse.forEach((id) => {
    const entry = importedFootnotes.find((f) => String(f?.id) === id);
    const content = entry?.content;
    if (!Array.isArray(content) || content.length === 0) return;

    try {
      // Deep clone to prevent mutation of the original converter data
      const clonedContent = JSON.parse(JSON.stringify(content));
      const footnoteDoc = { type: 'doc', content: clonedContent };
      const result = toFlowBlocks(footnoteDoc, {
        blockIdPrefix: `footnote-${id}-`,
        enableRichHyperlinks: true,
        themeColors: themeColors as never,
        converterContext: converterContext as never,
      });

      if (result?.blocks?.length) {
        ensureFootnoteMarker(result.blocks, id, footnoteNumberById);
        blocksById.set(id, result.blocks);
      }
    } catch (_) {
      // Skip malformed footnotes - invalid JSON structure or conversion failure
    }
  });

  if (blocksById.size === 0) return null;

  return {
    refs,
    blocksById,
    gap: 2,
    topPadding: 4,
    dividerHeight: 1,
  };
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Checks if a run is a footnote number marker.
 *
 * @param run - The run to check
 * @returns True if the run has the footnote marker data attribute
 */
function isFootnoteMarker(run: Run): boolean {
  return Boolean(run.dataAttrs?.['data-sd-footnote-number']);
}

/**
 * Finds the first run with valid ProseMirror position data.
 * Used to inherit position info for the marker run.
 *
 * @param runs - Array of runs to search
 * @returns The first run with pmStart/pmEnd, or undefined
 */
function findRunWithPositions(runs: Run[]): Run | undefined {
  return runs.find((r) => {
    if (isFootnoteMarker(r)) return false;
    return (
      typeof r.pmStart === 'number' &&
      Number.isFinite(r.pmStart) &&
      typeof r.pmEnd === 'number' &&
      Number.isFinite(r.pmEnd)
    );
  });
}

/**
 * Resolves the display number for a footnote.
 * Falls back to 1 if the footnote ID is not in the mapping or invalid.
 *
 * @param id - The footnote ID
 * @param footnoteNumberById - Mapping of footnote IDs to display numbers
 * @returns The display number (1-based)
 */
function resolveDisplayNumber(id: string, footnoteNumberById: Record<string, number> | undefined): number {
  if (!footnoteNumberById || typeof footnoteNumberById !== 'object') return 1;
  const num = footnoteNumberById[id];
  if (typeof num === 'number' && Number.isFinite(num) && num > 0) return num;
  return 1;
}

/**
 * Converts digits to their superscript Unicode equivalents.
 * Non-digit characters pass through unchanged.
 *
 * @example
 * toSuperscriptDigits(123) // "¹²³"
 * toSuperscriptDigits("42") // "⁴²"
 *
 * @param value - The value to convert (coerced to string)
 * @returns String with digits replaced by superscript equivalents
 */
function toSuperscriptDigits(value: unknown): string {
  const SUPERSCRIPT_MAP: Record<string, string> = {
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹',
  };
  const str = String(value ?? '');
  return str
    .split('')
    .map((ch) => SUPERSCRIPT_MAP[ch] ?? ch)
    .join('');
}

/**
 * Computes the PM position range for the marker run.
 *
 * The marker inherits position info from an existing run so that clicking
 * on the footnote number positions the cursor correctly. The end position
 * is clamped to not exceed the original run's range.
 *
 * @param baseRun - The run to inherit positions from
 * @param markerLength - Length of the marker text
 * @returns Object with pmStart and pmEnd, or nulls if no base run
 */
function computeMarkerPositions(
  baseRun: Run | undefined,
  markerLength: number,
): { pmStart: number | null; pmEnd: number | null } {
  if (baseRun?.pmStart == null) {
    return { pmStart: null, pmEnd: null };
  }

  const pmStart = baseRun.pmStart;
  // Clamp pmEnd to not exceed the base run's end position
  const pmEnd =
    baseRun.pmEnd != null ? Math.max(pmStart, Math.min(baseRun.pmEnd, pmStart + markerLength)) : pmStart + markerLength;

  return { pmStart, pmEnd };
}

/**
 * Ensures a footnote block has a superscript marker at the start.
 *
 * Word and other editors display footnote content with a leading superscript
 * number (e.g., "¹ This is the footnote text."). This function prepends that
 * marker to the first paragraph's runs.
 *
 * If a marker already exists, updates its PM positions if missing.
 * Modifies the blocks array in place.
 *
 * @param blocks - Array of FlowBlocks to modify
 * @param id - The footnote ID
 * @param footnoteNumberById - Mapping of footnote IDs to display numbers
 */
function ensureFootnoteMarker(
  blocks: FlowBlock[],
  id: string,
  footnoteNumberById: Record<string, number> | undefined,
): void {
  const firstParagraph = blocks.find((b) => b?.kind === 'paragraph') as ParagraphBlock | undefined;
  if (!firstParagraph) return;

  const runs: Run[] = Array.isArray(firstParagraph.runs) ? firstParagraph.runs : [];
  const displayNumber = resolveDisplayNumber(id, footnoteNumberById);
  const markerText = toSuperscriptDigits(displayNumber);

  const baseRun = findRunWithPositions(runs);
  const { pmStart, pmEnd } = computeMarkerPositions(baseRun, markerText.length);

  // Check if marker already exists
  const existingMarker = runs.find(isFootnoteMarker);
  if (existingMarker) {
    // Update position info on existing marker if missing
    if (pmStart != null && pmEnd != null) {
      if (existingMarker.pmStart == null) existingMarker.pmStart = pmStart;
      if (existingMarker.pmEnd == null) existingMarker.pmEnd = pmEnd;
    }
    return;
  }

  // Find first text run to inherit font styling from
  const firstTextRun = runs.find((r) => typeof r.text === 'string');

  // Build the marker run
  const markerRun: Run = {
    kind: 'text',
    text: markerText,
    dataAttrs: { 'data-sd-footnote-number': 'true' },
    fontFamily: typeof firstTextRun?.fontFamily === 'string' ? firstTextRun.fontFamily : 'Arial',
    fontSize:
      typeof firstTextRun?.fontSize === 'number' && Number.isFinite(firstTextRun.fontSize) ? firstTextRun.fontSize : 12,
  };

  if (pmStart != null) markerRun.pmStart = pmStart;
  if (pmEnd != null) markerRun.pmEnd = pmEnd;
  if (firstTextRun?.color != null) markerRun.color = firstTextRun.color;

  // Insert marker at the very start of runs
  runs.unshift(markerRun);
  // Cast needed: local Run type is structurally compatible but not identical
  // to the FlowBlock's Run type from @superdoc/contracts
  (firstParagraph as { runs: Run[] }).runs = runs;
}
