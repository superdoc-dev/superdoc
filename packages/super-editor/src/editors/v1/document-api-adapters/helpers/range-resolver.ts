/**
 * Range resolver adapter — resolves two explicit anchors into a contiguous
 * document range with a transparent SelectionTarget and mutation-ready ref.
 *
 * Composes existing primitives:
 * - SelectionPoint resolution (selection-target-resolver.ts)
 * - V3/V4 ref encoding (query-match-adapter.ts, story-ref-codec.ts)
 * - Revision tracking (revision-tracker.ts)
 * - Block index (index-cache.ts)
 * - Story runtime resolution (resolve-story-runtime.ts)
 */

import type {
  ResolveRangeInput,
  ResolveRangeOutput,
  RangeAnchor,
  RangeBlockPreview,
  SelectionTarget,
  SelectionPoint,
  SelectionEdgeNodeType,
  StoryLocator,
} from '@superdoc/document-api';
import { SELECTION_EDGE_NODE_TYPES, storyLocatorToKey } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { getBlockIndex } from './index-cache.js';
import { isTextBlockCandidate, type BlockCandidate, type BlockIndex } from './node-address-resolver.js';
import { resolveSelectionPointPosition } from './selection-target-resolver.js';
import { encodeV3Ref } from '../plan-engine/query-match-adapter.js';
import { getRevision, checkRevision } from '../plan-engine/revision-tracker.js';
import { PlanError } from '../plan-engine/errors.js';
import { DocumentApiAdapterError } from '../errors.js';
import { decodeRef, encodeV4Ref } from '../story-runtime/story-ref-codec.js';
import { resolveStoryFromRef, resolveStoryFromInput } from '../story-runtime/resolve-story-context.js';
import { resolveStoryRuntime } from '../story-runtime/resolve-story-runtime.js';
import { BODY_STORY_KEY, buildStoryKey } from '../story-runtime/story-key.js';

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
 * Accepts both V3 (`text:...`) and V4 (`text:v4:...`) refs from query.match or ranges.resolve.
 */
function resolveRefAnchor(editor: Editor, ref: string, boundary: 'start' | 'end', revision: string): number {
  const decoded = decodeRef(ref);

  if (!decoded) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `Only text refs (from query.match or ranges.resolve) are valid range anchors. Got: "${ref}".`,
      { ref, boundary },
    );
  }

  const segments = decoded.segments;
  if (!segments?.length) {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'Ref contains no segments.', { ref, boundary });
  }

  if (decoded.rev !== revision) {
    throw new PlanError(
      'REVISION_MISMATCH',
      `REVISION_MISMATCH — ref was created at revision ${decoded.rev} but document is at revision ${revision}. Re-run the discovery operation to obtain a fresh ref.`,
      undefined,
      {
        ref,
        boundary,
        refRevision: decoded.rev,
        currentRevision: revision,
        refStability: 'ephemeral',
        remediation: 'Re-run ranges.resolve or query.match to obtain a fresh ref valid for the current revision.',
      },
    );
  }
  const seg = boundary === 'start' ? segments[0] : segments[segments.length - 1];
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

function buildSelectionTarget(
  editor: Editor,
  index: BlockIndex,
  absFrom: number,
  absTo: number,
  story?: StoryLocator,
): SelectionTarget {
  return {
    kind: 'selection',
    start: absPositionToSelectionPoint(editor, index, absFrom),
    end: absPositionToSelectionPoint(editor, index, absTo),
    // Attach story metadata for non-body stories so that callers can chain
    // the target into mutations without repeating `in`. Body stories omit
    // the field for backward compatibility (body is the default).
    ...(story && { story }),
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
  storyKey?: string,
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

  // Non-body stories use V4 refs to preserve the storyKey for downstream
  // mutations. Body stories keep V3 for backward compatibility.
  if (storyKey && storyKey !== BODY_STORY_KEY) {
    return encodeV4Ref({
      v: 4,
      rev: revision,
      storyKey,
      scope: 'match',
      matchId: `range:${absFrom}-${absTo}`,
      segments,
    });
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
 * Builds a complete `ResolveRangeOutput` from absolute PM positions.
 *
 * This is the shared core that both `resolveRange` (anchor-based) and the
 * UI-selection bridge (`selection-range-resolver.ts`) use.
 *
 * When `expectedRevision` is provided, it is checked against the current
 * document revision. When omitted (typical for UI-selection bridge calls),
 * the current revision is read and returned as `evaluatedRevision`.
 */
export function resolveAbsoluteRange(
  editor: Editor,
  input: { absFrom: number; absTo: number; expectedRevision?: string; storyLocator?: StoryLocator },
): ResolveRangeOutput {
  const revision = getRevision(editor);

  if (input.expectedRevision !== undefined) {
    checkRevision(editor, input.expectedRevision);
  }

  const index = getBlockIndex(editor);

  // Normalize to document order
  const absFrom = Math.min(input.absFrom, input.absTo);
  const absTo = Math.max(input.absFrom, input.absTo);

  // Non-body stories attach metadata to the target and encode V4 refs.
  // Body stories (undefined or explicit body locator) omit the field for
  // backward compatibility.
  const isNonBody = input.storyLocator !== undefined && input.storyLocator.storyType !== 'body';
  const storyForTarget = isNonBody ? input.storyLocator : undefined;
  const storyKey = isNonBody ? buildStoryKey(input.storyLocator!) : undefined;

  const target = buildSelectionTarget(editor, index, absFrom, absTo, storyForTarget);

  // The V3 text ref can only encode text-block content segments. The ref is
  // lossy when the target uses nodeEdge endpoints (structural block boundaries)
  // OR when structural blocks (table, image, etc.) fall within the range — even
  // if both endpoints are text points.
  const coversFullTarget =
    target.start.kind === 'text' && target.end.kind === 'text' && rangeContainsOnlyTextBlocks(index, absFrom, absTo);

  return {
    evaluatedRevision: revision,
    handle: {
      ref: encodeRangeRef(editor, index, absFrom, absTo, revision, storyKey),
      refStability: 'ephemeral',
      coversFullTarget,
    },
    target,
    preview: buildPreview(editor, index, absFrom, absTo),
  };
}

// ---------------------------------------------------------------------------
// Story resolution for range anchors
// ---------------------------------------------------------------------------

/**
 * Extracts the story locator embedded in a range anchor's ref, if any.
 *
 * Only `ref`-kind anchors can carry story information (via V4 refs).
 * `document` and `point` anchors are story-agnostic.
 */
function extractStoryFromAnchor(anchor: RangeAnchor): StoryLocator | undefined {
  if (anchor.kind !== 'ref') return undefined;
  return resolveStoryFromRef(anchor.ref);
}

/**
 * Reconciles stories extracted from the start and end anchors.
 *
 * Both anchors must target the same story — a range cannot span multiple stories.
 * Returns `undefined` when neither anchor carries story information.
 */
function reconcileAnchorStories(
  startStory: StoryLocator | undefined,
  endStory: StoryLocator | undefined,
): StoryLocator | undefined {
  if (!startStory) return endStory;
  if (!endStory) return startStory;

  if (storyLocatorToKey(startStory) !== storyLocatorToKey(endStory)) {
    throw new DocumentApiAdapterError(
      'INVALID_INPUT',
      `Range anchor story mismatch: start ref targets "${storyLocatorToKey(startStory)}" ` +
        `but end ref targets "${storyLocatorToKey(endStory)}". A range cannot span multiple stories.`,
      { startStory: storyLocatorToKey(startStory), endStory: storyLocatorToKey(endStory) },
    );
  }

  return startStory;
}

/**
 * Resolves the effective story locator for a range operation.
 *
 * Merges three potential sources using the standard precedence rules:
 * 1. `input.in` — explicit story targeting on the operation input
 * 2. Ref anchors — V4 refs in `start` or `end` that embed a storyKey
 *
 * All sources must agree; mismatches produce a clear error.
 */
function resolveRangeStory(input: ResolveRangeInput): StoryLocator | undefined {
  const startStory = extractStoryFromAnchor(input.start);
  const endStory = extractStoryFromAnchor(input.end);
  const anchorStory = reconcileAnchorStories(startStory, endStory);

  return resolveStoryFromInput({ in: input.in }, anchorStory ? { story: anchorStory } : undefined);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Resolves two explicit anchors into a contiguous document range.
 *
 * Story-aware: resolves the target story from `input.in` and/or V4 ref
 * anchors, then evaluates all anchors against the correct story editor's
 * document state and revision counter.
 *
 * @param hostEditor - The body (host) editor — used to resolve story runtimes.
 * @param input      - The range resolution input with anchors and optional story locator.
 * @returns A transparent SelectionTarget, a mutation-ready ref, and preview metadata.
 */
export function resolveRange(hostEditor: Editor, input: ResolveRangeInput): ResolveRangeOutput {
  // Determine which story to resolve against (defaults to body).
  const storyLocator = resolveRangeStory(input);
  const runtime = resolveStoryRuntime(hostEditor, storyLocator);
  const storyEditor = runtime.editor;

  const revision = getRevision(storyEditor);

  if (input.expectedRevision !== undefined) {
    checkRevision(storyEditor, input.expectedRevision);
  }

  const index = getBlockIndex(storyEditor);

  // Resolve both anchors to absolute PM positions in the story's document
  const rawFrom = resolveAnchor(storyEditor, input.start, revision, index);
  const rawTo = resolveAnchor(storyEditor, input.end, revision, index);

  return resolveAbsoluteRange(storyEditor, { absFrom: rawFrom, absTo: rawTo, storyLocator });
}
