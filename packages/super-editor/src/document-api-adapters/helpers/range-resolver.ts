/**
 * Range resolver adapter — resolves two explicit anchors into a contiguous
 * document range with a transparent SelectionTarget and mutation-ready ref.
 *
 * Composes existing primitives:
 * - SelectionPoint resolution (selection-target-resolver.ts)
 * - V3 ref encoding (query-match-adapter.ts)
 * - Revision tracking (revision-tracker.ts)
 * - Block index (index-cache.ts)
 */

import type {
  ResolveRangeInput,
  ResolveRangeOutput,
  RangeAnchor,
  RangeBlockPreview,
  SelectionTarget,
  SelectionPoint,
  SelectionEdgeNodeType,
} from '@superdoc/document-api';
import { SELECTION_EDGE_NODE_TYPES } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { getBlockIndex } from './index-cache.js';
import { isTextBlockCandidate, type BlockCandidate, type BlockIndex } from './node-address-resolver.js';
import { resolveSelectionPointPosition } from './selection-target-resolver.js';
import { encodeV3Ref } from '../plan-engine/query-match-adapter.js';
import { getRevision, checkRevision } from '../plan-engine/revision-tracker.js';
import { PlanError } from '../plan-engine/errors.js';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PREVIEW_TEXT_MAX_LENGTH = 2000;
const BLOCK_PREVIEW_MAX_LENGTH = 200;

const EDGE_NODE_TYPES: ReadonlySet<string> = new Set(SELECTION_EDGE_NODE_TYPES);

// ---------------------------------------------------------------------------
// Document-edge resolution
// ---------------------------------------------------------------------------

/**
 * Resolves "document start" to the first block's outer boundary position.
 *
 * Using the block's `pos` (instead of a hardcoded interior position) ensures
 * non-text blocks like tables produce valid nodeEdge selection points rather
 * than invalid text points.
 */
function resolveDocumentStart(index: BlockIndex): number {
  const first = index.candidates[0];
  return first ? first.pos : 1;
}

/**
 * Resolves "document end" to the outermost last block's outer boundary.
 *
 * Uses the maximum `end` across all candidates (not just the last in the list)
 * because nested blocks (e.g. paragraphs inside a table) may appear after
 * their container in the flat candidate list yet end before it.
 */
function resolveDocumentEnd(editor: Editor, index: BlockIndex): number {
  let maxEnd = 0;
  for (const c of index.candidates) {
    if (c.end > maxEnd) maxEnd = c.end;
  }
  return maxEnd > 0 ? maxEnd : editor.state.doc.content.size - 1;
}

// ---------------------------------------------------------------------------
// Ref anchor resolution
// ---------------------------------------------------------------------------

/**
 * Decodes a text ref and extracts the start or end boundary as an absolute position.
 *
 * Only accepts `text:` prefixed refs (V3 text refs from query.match or ranges.resolve).
 */
function resolveRefAnchor(editor: Editor, ref: string, boundary: 'start' | 'end', revision: string): number {
  if (!ref.startsWith('text:')) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `Only text refs (from query.match or ranges.resolve) are valid range anchors. Got prefix: "${ref.split(':')[0]}".`,
      { ref, boundary },
    );
  }

  const encoded = ref.slice('text:'.length);
  let payload: unknown;
  try {
    payload = JSON.parse(atob(encoded));
  } catch {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'Invalid text ref encoding.', { ref, boundary });
  }

  const data = payload as {
    v?: number;
    rev?: string;
    segments?: Array<{ blockId: string; start: number; end: number }>;
  };

  if (!data.segments?.length) {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'Ref contains no segments.', { ref, boundary });
  }

  if (data.rev !== revision) {
    throw new PlanError(
      'REVISION_MISMATCH',
      `REVISION_MISMATCH — ref was created at revision ${data.rev} but document is at revision ${revision}. Re-run the discovery operation to obtain a fresh ref.`,
      undefined,
      {
        ref,
        boundary,
        refRevision: data.rev,
        currentRevision: revision,
        refStability: 'ephemeral',
        remediation: 'Re-run ranges.resolve or query.match to obtain a fresh ref valid for the current revision.',
      },
    );
  }

  const seg = boundary === 'start' ? data.segments[0] : data.segments[data.segments.length - 1];
  const offset = boundary === 'start' ? seg.start : seg.end;
  const point: SelectionPoint = { kind: 'text', blockId: seg.blockId, offset };

  return resolveSelectionPointPosition(editor, point);
}

// ---------------------------------------------------------------------------
// Anchor dispatch
// ---------------------------------------------------------------------------

function resolveAnchor(editor: Editor, anchor: RangeAnchor, revision: string, index: BlockIndex): number {
  switch (anchor.kind) {
    case 'document':
      return anchor.edge === 'start' ? resolveDocumentStart(index) : resolveDocumentEnd(editor, index);
    case 'point':
      return resolveSelectionPointPosition(editor, anchor.point);
    case 'ref':
      return resolveRefAnchor(editor, anchor.ref, anchor.boundary, revision);
  }
}

// ---------------------------------------------------------------------------
// Absolute position → SelectionPoint mapping
// ---------------------------------------------------------------------------

/**
 * Returns true when the block's node type is valid for nodeEdge selection anchors.
 */
function isEdgeNodeType(nodeType: string): nodeType is SelectionEdgeNodeType {
  return EDGE_NODE_TYPES.has(nodeType);
}

/**
 * Computes the text-model character offset from block content start to an
 * absolute PM position.
 */
function computeTextOffset(editor: Editor, blockContentStart: number, absPos: number): number {
  if (absPos <= blockContentStart) return 0;
  return editor.state.doc.textBetween(blockContentStart, absPos, '', '\ufffc').length;
}

/**
 * Converts an absolute PM position to a SelectionPoint by finding the
 * enclosing block and computing the character offset or node-edge boundary.
 */
function absPositionToSelectionPoint(editor: Editor, index: BlockIndex, absPos: number): SelectionPoint {
  for (const candidate of index.candidates) {
    const blockContentStart = candidate.pos + 1;
    const blockContentEnd = candidate.end - 1;

    // Position at this block's opening boundary → nodeEdge before (if valid type)
    if (absPos === candidate.pos && isEdgeNodeType(candidate.nodeType)) {
      return {
        kind: 'nodeEdge',
        node: { kind: 'block', nodeType: candidate.nodeType, nodeId: candidate.nodeId },
        edge: 'before',
      };
    }

    // Position at this block's closing boundary → nodeEdge after (if valid type)
    if (absPos === candidate.end && isEdgeNodeType(candidate.nodeType)) {
      return {
        kind: 'nodeEdge',
        node: { kind: 'block', nodeType: candidate.nodeType, nodeId: candidate.nodeId },
        edge: 'after',
      };
    }

    // Position inside this block's content → text point (text blocks only).
    // Structural containers (table, tableRow) are skipped so that nested
    // text-block candidates get a chance to match.
    if (absPos >= blockContentStart && absPos <= blockContentEnd && isTextBlockCandidate(candidate)) {
      return {
        kind: 'text',
        blockId: candidate.nodeId,
        offset: computeTextOffset(editor, blockContentStart, absPos),
      };
    }
  }

  // Edge case: position falls between blocks (in PM gap positions).
  // Map to the nearest block boundary.
  return resolveGapPosition(index, absPos);
}

/**
 * Handles positions that fall in PM structural gaps (between block nodes).
 * Maps to the nearest valid block boundary.
 */
function resolveGapPosition(index: BlockIndex, absPos: number): SelectionPoint {
  const first = index.candidates[0];
  const last = index.candidates[index.candidates.length - 1];

  if (first && absPos <= first.pos && isEdgeNodeType(first.nodeType)) {
    return {
      kind: 'nodeEdge',
      node: { kind: 'block', nodeType: first.nodeType, nodeId: first.nodeId },
      edge: 'before',
    };
  }

  if (last && absPos >= last.end && isEdgeNodeType(last.nodeType)) {
    return {
      kind: 'nodeEdge',
      node: { kind: 'block', nodeType: last.nodeType, nodeId: last.nodeId },
      edge: 'after',
    };
  }

  // Last resort: use text offset 0 of the nearest block
  const fallback = first ?? last;
  if (fallback) {
    return { kind: 'text', blockId: fallback.nodeId, offset: 0 };
  }

  throw new DocumentApiAdapterError(
    'INVALID_TARGET',
    `Could not map position ${absPos} to a SelectionPoint — document appears empty.`,
    { absPos },
  );
}

// ---------------------------------------------------------------------------
// SelectionTarget construction
// ---------------------------------------------------------------------------

function buildSelectionTarget(editor: Editor, index: BlockIndex, absFrom: number, absTo: number): SelectionTarget {
  return {
    kind: 'selection',
    start: absPositionToSelectionPoint(editor, index, absFrom),
    end: absPositionToSelectionPoint(editor, index, absTo),
  };
}

// ---------------------------------------------------------------------------
// Preview generation
// ---------------------------------------------------------------------------

/**
 * Iterates blocks overlapping [absFrom, absTo) and collects:
 * - per-block preview entries
 * - concatenated text preview (truncated if needed)
 */
function buildPreview(
  editor: Editor,
  index: BlockIndex,
  absFrom: number,
  absTo: number,
): { text: string; truncated: boolean; blocks: RangeBlockPreview[] } {
  const blocks: RangeBlockPreview[] = [];
  let fullText = '';

  for (const candidate of index.candidates) {
    if (candidate.end <= absFrom || candidate.pos >= absTo) continue;

    const blockContentStart = candidate.pos + 1;
    const blockContentEnd = candidate.end - 1;
    const rangeStart = Math.max(blockContentStart, absFrom);
    const rangeEnd = Math.min(blockContentEnd, absTo);
    if (rangeStart > rangeEnd) continue;

    const blockText = editor.state.doc.textBetween(rangeStart, rangeEnd, '', '\ufffc');

    blocks.push({
      nodeId: candidate.nodeId,
      nodeType: candidate.nodeType,
      textPreview:
        blockText.length > BLOCK_PREVIEW_MAX_LENGTH ? blockText.slice(0, BLOCK_PREVIEW_MAX_LENGTH) : blockText,
    });

    if (fullText.length > 0) fullText += '\n';
    fullText += blockText;
  }

  const truncated = fullText.length > PREVIEW_TEXT_MAX_LENGTH;
  return {
    text: truncated ? fullText.slice(0, PREVIEW_TEXT_MAX_LENGTH) : fullText,
    truncated,
    blocks,
  };
}

// ---------------------------------------------------------------------------
// Ref encoding
// ---------------------------------------------------------------------------

/**
 * Finds the nearest text-block candidate to a given position.
 * Used as a fallback when a range spans only structural boundaries.
 */
function findNearestTextCandidate(index: BlockIndex, pos: number): BlockCandidate | undefined {
  let best: BlockCandidate | undefined;
  let bestDist = Infinity;
  for (const c of index.candidates) {
    if (!isTextBlockCandidate(c)) continue;
    const dist = pos < c.pos ? c.pos - pos : pos > c.end ? pos - c.end : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

/**
 * Encodes the resolved range as a V3 text ref so it can be consumed by
 * the existing delete/replace/format mutation paths.
 *
 * Only text-block candidates produce segments — structural containers (table,
 * tableRow) are skipped because their nested text blocks provide the actual
 * content segments. A fallback ensures collapsed or boundary-only ranges
 * produce at least one segment when a nearby text block exists.
 *
 * Returns `null` when the range contains no text content at all (e.g. an
 * image-only document) — encoding a ref with zero segments would produce
 * a dead-on-arrival handle that fails on round-trip.
 */
function encodeRangeRef(
  editor: Editor,
  index: BlockIndex,
  absFrom: number,
  absTo: number,
  revision: string,
): string | null {
  const segments: Array<{ blockId: string; start: number; end: number }> = [];

  for (const candidate of index.candidates) {
    if (candidate.end <= absFrom || candidate.pos >= absTo) continue;
    if (!isTextBlockCandidate(candidate)) continue;

    const blockContentStart = candidate.pos + 1;
    const blockContentEnd = candidate.end - 1;
    const segStart = Math.max(blockContentStart, absFrom);
    const segEnd = Math.min(blockContentEnd, absTo);
    if (segStart > segEnd) continue;

    segments.push({
      blockId: candidate.nodeId,
      start: computeTextOffset(editor, blockContentStart, segStart),
      end: computeTextOffset(editor, blockContentStart, segEnd),
    });
  }

  // Collapsed or boundary-only ranges may not intersect any text-block content.
  // Try to find a nearby text block for a zero-width fallback segment.
  if (segments.length === 0) {
    const fallback = findNearestTextCandidate(index, absFrom);
    if (fallback) {
      const blockContentStart = fallback.pos + 1;
      const clampedPos = Math.max(blockContentStart, Math.min(fallback.end - 1, absFrom));
      const offset = computeTextOffset(editor, blockContentStart, clampedPos);
      segments.push({ blockId: fallback.nodeId, start: offset, end: offset });
    }
  }

  // No text content exists in the document — cannot encode a valid ref.
  if (segments.length === 0) {
    return null;
  }

  return encodeV3Ref({
    v: 3,
    rev: revision,
    matchId: `range:${absFrom}-${absTo}`,
    scope: 'match',
    segments,
  });
}

// ---------------------------------------------------------------------------
// Coverage check
// ---------------------------------------------------------------------------

/**
 * Returns true when the V3 text ref can faithfully represent the full range.
 *
 * A structural candidate (table, image, etc.) that fully *contains* the range
 * is a benign ancestor — e.g. a table wrapping the selected paragraph. The
 * ref still faithfully encodes the text selection within it. A structural
 * candidate that the range *crosses* (extends beyond its boundaries) or that
 * sits alongside text blocks as a sibling makes the ref lossy.
 */
function rangeContainsOnlyTextBlocks(index: BlockIndex, absFrom: number, absTo: number): boolean {
  for (const candidate of index.candidates) {
    if (candidate.end <= absFrom || candidate.pos >= absTo) continue;
    if (isTextBlockCandidate(candidate)) continue;
    // Structural ancestor that fully wraps the range — benign.
    if (candidate.pos <= absFrom && candidate.end >= absTo) continue;
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves two explicit anchors into a contiguous document range.
 *
 * Returns a transparent SelectionTarget, a mutation-ready ref, and preview metadata.
 */
export function resolveRange(editor: Editor, input: ResolveRangeInput): ResolveRangeOutput {
  const revision = getRevision(editor);

  if (input.expectedRevision !== undefined) {
    checkRevision(editor, input.expectedRevision);
  }

  const index = getBlockIndex(editor);

  // Resolve both anchors to absolute PM positions
  const rawFrom = resolveAnchor(editor, input.start, revision, index);
  const rawTo = resolveAnchor(editor, input.end, revision, index);

  // Normalize to document order
  const absFrom = Math.min(rawFrom, rawTo);
  const absTo = Math.max(rawFrom, rawTo);

  const target = buildSelectionTarget(editor, index, absFrom, absTo);

  // The V3 text ref can only encode text-block content segments. The ref is
  // lossy when the target uses nodeEdge endpoints (structural block boundaries)
  // OR when structural blocks (table, image, etc.) fall within the range — even
  // if both endpoints are text points.
  const coversFullTarget =
    target.start.kind === 'text' && target.end.kind === 'text' && rangeContainsOnlyTextBlocks(index, absFrom, absTo);

  return {
    evaluatedRevision: revision,
    handle: {
      ref: encodeRangeRef(editor, index, absFrom, absTo, revision),
      refStability: 'ephemeral',
      coversFullTarget,
    },
    target,
    preview: buildPreview(editor, index, absFrom, absTo),
  };
}
