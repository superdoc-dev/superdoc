/**
 * query.match adapter — deterministic matching with cardinality contracts.
 *
 * Emits the canonical `match → blocks → runs` hierarchy (D1).
 * Every text match includes blocks with style-decomposed runs and V3 refs.
 * Node matches return empty blocks — stable nodeId ref for block-level
 * nodes, ephemeral V3 ref for inline nodes (D13).
 *
 * See plans/query-match-blocks-runs-plan.md for design decisions D1–D20.
 */

import type {
  QueryMatchInput,
  QueryMatchOutput,
  QueryMatchItem,
  TextMatchItem,
  NodeMatchItem,
  MatchBlock,
  MatchRun,
  CardinalityRequirement,
  TextAddress,
  HighlightRange,
  InlineAnchor,
  PageInfo,
} from '@superdoc/document-api';
import {
  SNIPPET_MAX_LENGTH,
  SNIPPET_CONTEXT_CHARS,
  buildResolvedHandle,
  buildDiscoveryResult,
} from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { findAdapter } from '../find-adapter.js';
import { getBlockIndex } from '../helpers/index-cache.js';
import { validatePaginationInput } from '../helpers/adapter-utils.js';
import { captureRunsInRange } from './style-resolver.js';
import { getRevision } from './revision-tracker.js';
import { planError } from './errors.js';
import { coalesceRuns, toMatchStyle, extractRunStyleId, assertRunTilingInvariant } from './match-style-helpers.js';

// ---------------------------------------------------------------------------
// V3 ref encoding (D6)
// ---------------------------------------------------------------------------

interface TextRefV3 {
  v: 3;
  rev: string;
  matchId: string;
  scope: 'match' | 'block' | 'run';
  segments: Array<{ blockId: string; start: number; end: number }>;
  blockIndex?: number;
  runIndex?: number;
}

function encodeV3Ref(payload: TextRefV3): string {
  return `text:${btoa(JSON.stringify(payload))}`;
}

// ---------------------------------------------------------------------------
// Block/run builders (D4, D5)
// ---------------------------------------------------------------------------

/**
 * Builds the MatchBlock + MatchRun hierarchy for a text match.
 *
 * @param editor - The ProseMirror editor instance.
 * @param textRanges - Raw text ranges from the find adapter context.
 * @param evaluatedRevision - Current doc revision for ref encoding.
 * @param matchId - The match's deterministic ID.
 * @returns Array of MatchBlocks in document order (D16).
 */
function buildMatchBlocks(
  editor: Editor,
  textRanges: TextAddress[],
  evaluatedRevision: string,
  matchId: string,
): MatchBlock[] {
  const index = getBlockIndex(editor);
  const doc = editor.state.doc;

  // Group text ranges by block, preserving encounter order (D5, D16)
  const blockGroupMap = new Map<string, TextAddress[]>();
  const blockOrder: string[] = [];
  for (const range of textRanges) {
    const existing = blockGroupMap.get(range.blockId);
    if (existing) {
      existing.push(range);
    } else {
      blockGroupMap.set(range.blockId, [range]);
      blockOrder.push(range.blockId);
    }
  }

  const blocks: MatchBlock[] = [];

  for (let blockIdx = 0; blockIdx < blockOrder.length; blockIdx++) {
    const blockId = blockOrder[blockIdx];
    const ranges = blockGroupMap.get(blockId)!;
    const candidate = index.candidates.find((c) => c.nodeId === blockId);
    if (!candidate) continue;

    // Coalesce to one contiguous range per block (D5)
    const from = Math.min(...ranges.map((r) => r.range.start));
    const to = Math.max(...ranges.map((r) => r.range.end));

    // Check for discontiguous ranges within the same block (D5)
    const sorted = [...ranges].sort((a, b) => a.range.start - b.range.start);
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].range.end < sorted[i + 1].range.start) {
        throw planError(
          'INVALID_INPUT',
          `discontiguous text ranges in block ${blockId}: gap between ${sorted[i].range.end} and ${sorted[i + 1].range.start}`,
        );
      }
    }

    // Get block-level metadata
    const blockStart = candidate.pos + 1;
    const blockEnd = candidate.end - 1;
    const blockText = doc.textBetween(blockStart, blockEnd, '\n', '\ufffc');
    const matchedText = blockText.slice(from, to);
    const node = doc.nodeAt(candidate.pos);
    const nodeType = node?.type.name ?? 'paragraph';

    // Build paragraph style (D10)
    const paragraphStyle = buildParagraphStyle(node);

    // Capture PM runs within the matched range and coalesce (D4)
    const captured = captureRunsInRange(editor, candidate.pos, from, to);
    const coalesced = coalesceRuns(captured.runs);

    // Project to contract MatchRun[] with V3 refs
    const blockRange = { start: from, end: to };
    const runs: MatchRun[] = coalesced.map((run, runIdx) => ({
      range: { start: run.from, end: run.to },
      text: blockText.slice(run.from, run.to),
      styleId: extractRunStyleId(run.marks),
      styles: toMatchStyle(run.marks),
      ref: encodeV3Ref({
        v: 3,
        rev: evaluatedRevision,
        matchId,
        scope: 'run',
        segments: [{ blockId, start: run.from, end: run.to }],
        blockIndex: blockIdx,
        runIndex: runIdx,
      }),
    }));

    // Remove undefined styleId fields to keep output clean
    for (const run of runs) {
      if (run.styleId === undefined) delete run.styleId;
    }

    // Assert run-tiling invariant (D4)
    assertRunTilingInvariant(runs, blockRange, blockId);

    const block: MatchBlock = {
      blockId,
      nodeType,
      range: blockRange,
      text: matchedText,
      ref: encodeV3Ref({
        v: 3,
        rev: evaluatedRevision,
        matchId,
        scope: 'block',
        segments: [{ blockId, start: from, end: to }],
        blockIndex: blockIdx,
      }),
      runs,
    };

    if (paragraphStyle) block.paragraphStyle = paragraphStyle;

    blocks.push(block);
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Paragraph style extraction (D10)
// ---------------------------------------------------------------------------

function buildParagraphStyle(
  node: import('prosemirror-model').Node | null | undefined,
): MatchBlock['paragraphStyle'] | undefined {
  if (!node) return undefined;

  const attrs = node.attrs;
  const styleId = attrs?.paragraphProperties?.styleId;
  const listRendering = attrs?.listRendering;
  const isListItem = listRendering != null;
  const listLevel = isListItem ? listRendering?.level : undefined;

  const hasAny = styleId || isListItem;
  if (!hasAny) return undefined;

  const result: NonNullable<MatchBlock['paragraphStyle']> = {};
  if (typeof styleId === 'string' && styleId.length > 0) result.styleId = styleId;
  if (isListItem) result.isListItem = true;
  if (typeof listLevel === 'number' && listLevel >= 0) result.listLevel = listLevel;

  return result;
}

// ---------------------------------------------------------------------------
// Snippet builder for blocks/runs (D11, D17)
// ---------------------------------------------------------------------------

/**
 * Builds a snippet from the blocks hierarchy per D11 assembly order.
 * Returns undefined if editor state is not available (test mocks).
 */
function buildBlocksSnippet(
  editor: Editor,
  blocks: MatchBlock[],
): { snippet: string; highlightRange: HighlightRange } | undefined {
  if (!editor.state?.doc || blocks.length === 0) return undefined;

  const index = getBlockIndex(editor);
  const doc = editor.state.doc;

  // D11 step 1: join block match texts
  const matchText = blocks.map((b) => b.text).join('\n');

  // D11 step 2: if matchText exceeds budget, return prefix
  if (matchText.length >= SNIPPET_MAX_LENGTH) {
    return {
      snippet: matchText.slice(0, SNIPPET_MAX_LENGTH),
      highlightRange: { start: 0, end: SNIPPET_MAX_LENGTH },
    };
  }

  // D11 steps 3-4: compute context budget
  const remainingBudget = SNIPPET_MAX_LENGTH - matchText.length;
  const contextEachSide = Math.min(SNIPPET_CONTEXT_CHARS, Math.floor(remainingBudget / 2));

  // D11 step 5: left context from first block
  let leftContext = '';
  const firstBlock = blocks[0];
  const firstCandidate = index.candidates.find((c) => c.nodeId === firstBlock.blockId);
  if (firstCandidate) {
    const blockStart = firstCandidate.pos + 1;
    const blockEnd = firstCandidate.end - 1;
    const fullBlockText = doc.textBetween(blockStart, blockEnd, '\n', '\ufffc');
    const contextStart = Math.max(0, firstBlock.range.start - contextEachSide);
    leftContext = fullBlockText.slice(contextStart, firstBlock.range.start);
  }

  // D11 step 6: right context from last block
  let rightContext = '';
  const lastBlock = blocks[blocks.length - 1];
  const lastCandidate = index.candidates.find((c) => c.nodeId === lastBlock.blockId);
  if (lastCandidate) {
    const blockStart = lastCandidate.pos + 1;
    const blockEnd = lastCandidate.end - 1;
    const fullBlockText = doc.textBetween(blockStart, blockEnd, '\n', '\ufffc');
    const contextEnd = Math.min(fullBlockText.length, lastBlock.range.end + contextEachSide);
    rightContext = fullBlockText.slice(lastBlock.range.end, contextEnd);
  }

  // D11 steps 7-8
  let snippet = leftContext + matchText + rightContext;
  let highlightRange: HighlightRange = {
    start: leftContext.length,
    end: leftContext.length + matchText.length,
  };

  // D11 step 9: final clip
  if (snippet.length > SNIPPET_MAX_LENGTH) {
    snippet = snippet.slice(0, SNIPPET_MAX_LENGTH);
    highlightRange = {
      start: highlightRange.start,
      end: Math.min(highlightRange.end, SNIPPET_MAX_LENGTH),
    };
  }

  return { snippet, highlightRange };
}

// ---------------------------------------------------------------------------
// Post-filter pagination (D20)
// ---------------------------------------------------------------------------

/** Applies offset/limit pagination to an already-filtered array. */
function applyPagination<T>(items: T[], offset: number, limit?: number): T[] {
  validatePaginationInput(offset, limit);
  if (limit === undefined) return items.slice(offset);
  return items.slice(offset, offset + limit);
}

// ---------------------------------------------------------------------------
// Inline anchor → V3 ref segments
// ---------------------------------------------------------------------------

/**
 * Builds V3 ref segments from a cross-block inline anchor.
 * The first segment runs from anchor.start to end of its block;
 * the last segment runs from start of its block to anchor.end.
 */
function buildInlineAnchorSegments(
  editor: Editor,
  anchor: InlineAnchor,
): Array<{ blockId: string; start: number; end: number }> {
  const index = getBlockIndex(editor);
  const doc = editor.state.doc;

  const startCandidate = index.candidates.find((c) => c.nodeId === anchor.start.blockId);
  const endCandidate = index.candidates.find((c) => c.nodeId === anchor.end.blockId);

  if (!startCandidate || !endCandidate) {
    // Fallback: single segment from start anchor (best-effort)
    return [{ blockId: anchor.start.blockId, start: anchor.start.offset, end: anchor.start.offset }];
  }

  const startBlockText = doc.textBetween(startCandidate.pos + 1, startCandidate.end - 1, '\n', '\ufffc');

  return [
    { blockId: anchor.start.blockId, start: anchor.start.offset, end: startBlockText.length },
    { blockId: anchor.end.blockId, start: 0, end: anchor.end.offset },
  ];
}

// ---------------------------------------------------------------------------
// Zero-width match filtering (D20)
// ---------------------------------------------------------------------------

/** Returns true if a match has zero total text width across all ranges. */
function isZeroWidthMatch(textRanges: TextAddress[]): boolean {
  return textRanges.every((r) => r.range.start === r.range.end);
}

// ---------------------------------------------------------------------------
// Main adapter
// ---------------------------------------------------------------------------

export function queryMatchAdapter(editor: Editor, input: QueryMatchInput): QueryMatchOutput {
  const evaluatedRevision = getRevision(editor);
  const require: CardinalityRequirement = input.require ?? 'any';

  // Validate pagination + cardinality interaction
  if ((require === 'first' || require === 'exactlyOne') && (input.limit !== undefined || input.offset !== undefined)) {
    throw planError('INVALID_INPUT', `limit/offset are not valid when require is "${require}"`);
  }

  const isTextSelector = input.select.type === 'text';

  // Execute search using the find adapter infrastructure.
  // For text selectors, omit limit/offset here because zero-width filtering (D20)
  // must run on all matches before pagination. We paginate ourselves after filtering.
  const query = {
    select: input.select,
    within: input.within,
    includeNodes: input.includeNodes,
    limit: isTextSelector ? undefined : input.limit,
    offset: isTextSelector ? undefined : input.offset,
  };

  const result = findAdapter(editor, query);

  // Build raw match entries and apply zero-width filtering (D20)
  const rawMatches: Array<{
    address: import('@superdoc/document-api').NodeAddress;
    textRanges?: TextAddress[];
  }> = [];

  for (const item of result.items) {
    const address = item.address;
    const textRanges = item.context?.textRanges?.length ? item.context.textRanges : undefined;

    // D20: drop zero-width text matches
    if (isTextSelector && textRanges && isZeroWidthMatch(textRanges)) continue;

    rawMatches.push({ address, textRanges });
  }

  // totalMatches counts actionable matches after zero-width filtering (D20).
  // For text selectors, rawMatches is the full filtered set (no pagination yet).
  // For node selectors, findAdapter already applied pagination, so use its total.
  const totalMatches = isTextSelector ? rawMatches.length : result.total;

  // Apply pagination for text selectors after zero-width filtering (D20).
  const userOffset = input.offset ?? 0;
  const paginatedMatches = isTextSelector ? applyPagination(rawMatches, userOffset, input.limit) : rawMatches;

  // Apply cardinality checks on actionable matches (D20)
  if (require === 'first' || require === 'exactlyOne' || require === 'all') {
    if (totalMatches === 0) {
      throw planError('MATCH_NOT_FOUND', 'selector matched zero ranges');
    }
  }
  if (require === 'exactlyOne' && totalMatches > 1) {
    throw planError('AMBIGUOUS_MATCH', `selector matched ${totalMatches} ranges, expected exactly one`, undefined, {
      matchCount: totalMatches,
    });
  }

  // Build match items with offset-aware id (D7).
  // For text selectors, userOffset is the caller's pagination offset into the
  // filtered set, so item indexes are dense over actionable results only.
  const matchItems: QueryMatchItem[] = paginatedMatches.map((raw, pageIdx) => {
    const id = `m:${userOffset + pageIdx}`;

    if (isTextSelector && raw.textRanges?.length) {
      // Text match → build blocks/runs hierarchy (D1)
      const blocks = buildMatchBlocks(editor, raw.textRanges, evaluatedRevision, id);

      if (blocks.length === 0) {
        // Shouldn't happen after zero-width filtering, but guard
        throw planError('INTERNAL_ERROR', `text match produced no blocks for ${id}`);
      }

      // Build snippet from blocks (D11)
      const snippetResult = buildBlocksSnippet(editor, blocks);

      // Build match-level V3 ref (D6)
      const segments = blocks.map((b) => ({ blockId: b.blockId, start: b.range.start, end: b.range.end }));
      const ref = encodeV3Ref({
        v: 3,
        rev: evaluatedRevision,
        matchId: id,
        scope: 'match',
        segments,
      });

      return {
        id,
        handle: buildResolvedHandle(ref, 'ephemeral', 'text'),
        matchKind: 'text',
        address: raw.address,
        snippet: snippetResult?.snippet ?? '',
        highlightRange: snippetResult?.highlightRange ?? { start: 0, end: 0 },
        blocks: blocks as [MatchBlock, ...MatchBlock[]],
      } satisfies TextMatchItem;
    } else {
      // Node match → empty blocks (D13)
      if (raw.address.kind === 'block') {
        // Block node → stable nodeId ref
        return {
          id,
          handle: buildResolvedHandle(raw.address.nodeId, 'stable', 'node'),
          matchKind: 'node',
          address: raw.address,
          blocks: [],
        } satisfies NodeMatchItem;
      }

      // Inline node → encode anchor as ephemeral V3 ref so it's resolvable
      const anchor = raw.address.anchor;
      const segments =
        anchor.start.blockId === anchor.end.blockId
          ? [{ blockId: anchor.start.blockId, start: anchor.start.offset, end: anchor.end.offset }]
          : buildInlineAnchorSegments(editor, anchor);

      return {
        id,
        handle: buildResolvedHandle(
          encodeV3Ref({ v: 3, rev: evaluatedRevision, matchId: id, scope: 'match', segments }),
          'ephemeral',
          'node',
        ),
        matchKind: 'node',
        address: raw.address,
        blocks: [],
      } satisfies NodeMatchItem;
    }
  });

  // Apply cardinality truncation for 'first'
  const truncated = require === 'first' ? matchItems.slice(0, 1) : matchItems;

  // Build pagination metadata
  const page: PageInfo = {
    limit: input.limit ?? totalMatches,
    offset: userOffset,
    returned: truncated.length,
  };

  return buildDiscoveryResult({
    evaluatedRevision,
    total: totalMatches,
    items: truncated,
    page,
  });
}
