import type { Query, TextAddress, UnknownNodeDiagnostic } from '@superdoc/document-api';
import { getBlockIndex } from './index-cache.js';
import { findBlockById, isTextBlockCandidate, type BlockCandidate, type BlockIndex } from './node-address-resolver.js';
import { resolveTextRangeInBlock } from './text-offset-resolver.js';
import type { Editor } from '../../core/Editor.js';
import { DocumentApiAdapterError } from '../errors.js';

export type WithinResult = { ok: true; range: { start: number; end: number } | undefined } | { ok: false };
export type ResolvedTextTarget = { from: number; to: number };

function findTextBlockCandidates(index: BlockIndex, blockId: string): BlockCandidate[] {
  return index.candidates.filter((candidate) => candidate.nodeId === blockId && isTextBlockCandidate(candidate));
}

function assertUnambiguous(matches: BlockCandidate[], blockId: string): void {
  if (matches.length > 1) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `Block ID "${blockId}" is ambiguous: matched ${matches.length} text blocks.`,
      {
        blockId,
        matchCount: matches.length,
      },
    );
  }
}

function findInlineWithinTextBlock(index: BlockIndex, blockId: string): BlockCandidate | undefined {
  const matches = findTextBlockCandidates(index, blockId);
  assertUnambiguous(matches, blockId);
  return matches[0];
}

/**
 * Resolves a {@link TextAddress} to absolute ProseMirror positions.
 *
 * @param editor - The editor instance.
 * @param target - The text address to resolve.
 * @returns Absolute `{ from, to }` positions, or `null` if the target block cannot be found.
 * @throws {DocumentApiAdapterError} `INVALID_TARGET` when multiple text blocks share the same blockId.
 */
export function resolveTextTarget(editor: Editor, target: TextAddress): ResolvedTextTarget | null {
  const index = getBlockIndex(editor);
  const matches = findTextBlockCandidates(index, target.blockId);
  assertUnambiguous(matches, target.blockId);
  const block = matches[0];
  if (!block) return null;
  return resolveTextRangeInBlock(block.node, block.pos, target.range);
}

/**
 * Resolves the deterministic default insertion target for insert-without-target calls.
 *
 * Priority:
 * 1) First paragraph block in document order.
 * 2) First editable text block in document order.
 */
export function resolveDefaultInsertTarget(editor: Editor): { target: TextAddress; range: ResolvedTextTarget } | null {
  const index = getBlockIndex(editor);
  const firstParagraph = index.candidates.find(
    (candidate) => candidate.nodeType === 'paragraph' && isTextBlockCandidate(candidate),
  );
  const firstTextBlock = firstParagraph ?? index.candidates.find((candidate) => isTextBlockCandidate(candidate));
  if (!firstTextBlock) return null;

  const range = resolveTextRangeInBlock(firstTextBlock.node, firstTextBlock.pos, { start: 0, end: 0 });
  if (!range) return null;

  return {
    target: {
      kind: 'text',
      blockId: firstTextBlock.nodeId,
      range: { start: 0, end: 0 },
    },
    range,
  };
}

/**
 * Appends a diagnostic message to the mutable diagnostics array.
 *
 * @param diagnostics - Array to push the diagnostic into.
 * @param message - Human-readable diagnostic message.
 */
export function addDiagnostic(diagnostics: UnknownNodeDiagnostic[], message: string): void {
  diagnostics.push({ message });
}

/**
 * Applies offset/limit pagination to an array, returning the total count and the sliced page.
 *
 * @param items - The full result array.
 * @param offset - Number of items to skip (default `0`).
 * @param limit - Maximum items to return (default: all remaining).
 * @returns An object with `total` (pre-pagination count) and `items` (the sliced page).
 */
export function paginate<T>(items: T[], offset = 0, limit = items.length): { total: number; items: T[] } {
  const total = items.length;
  const safeOffset = Math.max(0, offset ?? 0);
  const safeLimit = Math.max(0, limit ?? total);
  return { total, items: items.slice(safeOffset, safeOffset + safeLimit) };
}

/**
 * Deduplicates diagnostics by message + hint + address, preserving insertion order.
 *
 * @param diagnostics - The diagnostics to deduplicate.
 * @returns A new array with unique diagnostics.
 */
export function dedupeDiagnostics(diagnostics: UnknownNodeDiagnostic[]): UnknownNodeDiagnostic[] {
  const seen = new Set<string>();
  const unique: UnknownNodeDiagnostic[] = [];

  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.message}|${diagnostic.hint ?? ''}|${
      diagnostic.address ? JSON.stringify(diagnostic.address) : ''
    }`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(diagnostic);
  }

  return unique;
}

/**
 * Resolves the `within` scope of a query to an absolute position range.
 *
 * @param index - Pre-built block index.
 * @param query - The query whose `within` clause should be resolved.
 * @param diagnostics - Mutable array to collect diagnostics into.
 * @returns `{ ok: true, range }` on success (range is `undefined` when no scope), or `{ ok: false }` with a diagnostic.
 */
export function resolveWithinScope(
  index: BlockIndex,
  query: Query,
  diagnostics: UnknownNodeDiagnostic[],
): WithinResult {
  if (!query.within) return { ok: true, range: undefined };

  if (query.within.kind === 'block') {
    const within = findBlockById(index, query.within);
    if (!within) {
      addDiagnostic(
        diagnostics,
        `Within block "${query.within.nodeType}" with id "${query.within.nodeId}" was not found in the document.`,
      );
      return { ok: false };
    }
    return { ok: true, range: { start: within.pos, end: within.end } };
  }

  if (query.within.anchor.start.blockId !== query.within.anchor.end.blockId) {
    addDiagnostic(diagnostics, 'Inline within anchors that span multiple blocks are not supported.');
    return { ok: false };
  }

  const block = findInlineWithinTextBlock(index, query.within.anchor.start.blockId);
  if (!block) {
    addDiagnostic(
      diagnostics,
      `Within inline anchor block "${query.within.anchor.start.blockId}" was not found in the document.`,
    );
    return { ok: false };
  }

  const resolved = resolveTextRangeInBlock(block.node, block.pos, {
    start: query.within.anchor.start.offset,
    end: query.within.anchor.end.offset,
  });
  if (!resolved) {
    addDiagnostic(diagnostics, 'Inline within anchor offsets could not be resolved in the target block.');
    return { ok: false };
  }

  return { ok: true, range: { start: resolved.from, end: resolved.to } };
}

/**
 * Filters candidates to those fully contained within the given position range.
 * Returns the full array unchanged when `range` is `undefined`.
 *
 * @param candidates - Candidates with `pos` and `end` fields.
 * @param range - Optional absolute position range to filter by.
 * @returns Filtered candidates.
 */
export function scopeByRange<T extends { pos: number; end: number }>(
  candidates: T[],
  range: { start: number; end: number } | undefined,
): T[] {
  if (!range) return candidates;
  return candidates.filter((candidate) => candidate.pos >= range.start && candidate.end <= range.end);
}

/**
 * Binary-searches a sorted candidate array for the entry containing `pos`.
 * Uses half-open interval `[candidate.pos, candidate.end)`.
 *
 * @param candidates - Sorted array of candidates with `pos` and `end` fields.
 * @param pos - The absolute document position to look up.
 * @returns The matching candidate, or `undefined` if no candidate contains the position.
 */
export function findCandidateByPos<T extends { pos: number; end: number }>(
  candidates: T[],
  pos: number,
): T | undefined {
  let low = 0;
  let high = candidates.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const candidate = candidates[mid];
    if (pos < candidate.pos) {
      high = mid - 1;
      continue;
    }
    if (pos >= candidate.end) {
      low = mid + 1;
      continue;
    }
    return candidate;
  }

  return undefined;
}
