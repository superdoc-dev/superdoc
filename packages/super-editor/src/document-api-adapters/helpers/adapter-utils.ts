import type {
  Query,
  TextAddress,
  TextMutationResolution,
  UnknownNodeDiagnostic,
  WriteRequest,
} from '@superdoc/document-api';
import { DocumentApiValidationError } from '@superdoc/document-api';
import { getBlockIndex } from './index-cache.js';
import { findBlockById, isTextBlockCandidate, type BlockCandidate, type BlockIndex } from './node-address-resolver.js';
import { computeTextContentLength, resolveTextRangeInBlock } from './text-offset-resolver.js';
import { buildTextMutationResolution, readTextAtResolvedRange } from './text-mutation-resolution.js';
import type { Transaction } from 'prosemirror-state';
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
 * Collects the absolute positions of all direct children of the doc node.
 * Used to distinguish top-level blocks from nested blocks (e.g. paragraphs
 * inside table cells) when resolving the default insertion target.
 */
function collectTopLevelPositions(doc: {
  childCount: number;
  child(index: number): { nodeSize: number };
}): Set<number> {
  const positions = new Set<number>();
  let offset = 0;
  for (let i = 0; i < doc.childCount; i++) {
    positions.add(offset);
    offset += doc.child(i).nodeSize;
  }
  return positions;
}

/**
 * Result of resolving the default insertion target.
 *
 * - `text-block`: The last top-level text block was found; insert at its content end.
 * - `structural-end`: No top-level text block exists at or after the desired
 *   insertion point. The caller must create a writable host (e.g. a paragraph)
 *   at `insertPos` before inserting content.
 */
export type DefaultInsertTarget =
  | { kind: 'text-block'; target: TextAddress; range: ResolvedTextTarget }
  | { kind: 'structural-end'; insertPos: number };

/**
 * Resolves the deterministic default insertion target for insert-without-target calls.
 *
 * Targets the **end** of the last top-level writable text block in document
 * order, so that target-less inserts behave as "append to document end."
 *
 * Only top-level blocks (direct children of the doc node) are considered.
 * Nested text blocks inside tables, SDTs, or other containers are excluded
 * so that a document ending in a table resolves to the last top-level
 * paragraph before it, not to a cell paragraph inside it.
 *
 * When no top-level text block exists, returns `structural-end` with the
 * position at the end of the document content (`doc.content.size`), signaling
 * that the caller must create a writable host before insertion.
 */
export function resolveDefaultInsertTarget(editor: Editor): DefaultInsertTarget | null {
  const index = getBlockIndex(editor);
  const doc = editor.state.doc;
  const topLevelPositions = collectTopLevelPositions(doc);

  // Walk candidates in reverse to find the last top-level text block.
  for (let i = index.candidates.length - 1; i >= 0; i--) {
    const candidate = index.candidates[i];
    if (topLevelPositions.has(candidate.pos) && isTextBlockCandidate(candidate)) {
      const textLength = computeTextContentLength(candidate.node);
      const range = resolveTextRangeInBlock(candidate.node, candidate.pos, { start: textLength, end: textLength });
      if (!range) continue;

      return {
        kind: 'text-block',
        target: {
          kind: 'text',
          blockId: candidate.nodeId,
          range: { start: textLength, end: textLength },
        },
        range,
      };
    }
  }

  // No top-level text block found. If the document has any content,
  // signal structural-end so the caller can create a writable host.
  if (doc.content.size > 0) {
    return { kind: 'structural-end', insertPos: doc.content.size };
  }

  return null;
}

/** Resolved write target with the effective address, absolute range, and resolution snapshot. */
export type ResolvedWrite = {
  requestedTarget?: TextAddress;
  /**
   * The resolved target address used for the mutation.
   *
   * When {@link structuralEnd} is `true`, this is a synthetic placeholder
   * (`blockId: ''`) that should not be used for block lookup or display.
   */
  effectiveTarget: TextAddress;
  range: ResolvedTextTarget;
  resolution: TextMutationResolution;
  /**
   * When `true`, the resolved position is at the structural end of the
   * document where no text block exists. The caller must create a writable
   * host (paragraph) at `range.from` before inserting content.
   */
  structuralEnd?: true;
};

/**
 * Creates a new paragraph containing the given text and inserts it at the
 * specified position using the editor's transaction pipeline.
 *
 * Used by structural-end handlers when the document ends with non-text blocks
 * and a writable host must be created before inserting content.
 *
 * @param applyMeta - Optional callback to annotate the transaction before
 *   dispatch (e.g. `applyTrackedMutationMeta` for tracked-mode inserts).
 */
export function insertParagraphAtEnd(
  editor: Editor,
  pos: number,
  text: string,
  applyMeta?: (tr: Transaction) => Transaction,
): void {
  const schema = editor.state.schema;
  const textNode = schema.text(text);
  const paragraph = schema.nodes.paragraph.create(null, textNode);
  const tr = editor.state.tr;
  tr.insert(pos, paragraph);
  if (applyMeta) applyMeta(tr);
  editor.dispatch(tr);
}

/**
 * Resolves the write target for a mutation request.
 *
 * When the request is a target-less insert, falls back to the document-end
 * insertion point via {@link resolveDefaultInsertTarget}. Otherwise resolves
 * the explicit target address.
 *
 * For structural-end resolutions (doc ends in non-text blocks), the returned
 * `ResolvedWrite` has `structuralEnd: true` and the caller is responsible for
 * creating a writable host before insertion.
 */
export function resolveWriteTarget(editor: Editor, request: WriteRequest): ResolvedWrite | null {
  const requestedTarget = request.target;

  if (request.kind === 'insert' && !request.target) {
    const fallback = resolveDefaultInsertTarget(editor);
    if (!fallback) return null;

    if (fallback.kind === 'structural-end') {
      const pos = fallback.insertPos;
      const syntheticRange: ResolvedTextTarget = { from: pos, to: pos };
      const syntheticTarget: TextAddress = { kind: 'text', blockId: '', range: { start: 0, end: 0 } };
      return {
        requestedTarget,
        effectiveTarget: syntheticTarget,
        range: syntheticRange,
        resolution: buildTextMutationResolution({
          requestedTarget,
          target: syntheticTarget,
          range: syntheticRange,
          text: '',
        }),
        structuralEnd: true,
      };
    }

    const text = readTextAtResolvedRange(editor, fallback.range);
    return {
      requestedTarget,
      effectiveTarget: fallback.target,
      range: fallback.range,
      resolution: buildTextMutationResolution({
        requestedTarget,
        target: fallback.target,
        range: fallback.range,
        text,
      }),
    };
  }

  const target = request.target;
  if (!target) return null;

  const range = resolveTextTarget(editor, target);
  if (!range) return null;

  const text = readTextAtResolvedRange(editor, range);
  return {
    requestedTarget,
    effectiveTarget: target,
    range,
    resolution: buildTextMutationResolution({ requestedTarget, target, range, text }),
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
 * Validates pagination inputs, throwing `INVALID_INPUT` for invalid values.
 *
 * @param offset - Must be non-negative when provided.
 * @param limit - Must be positive when provided.
 * @throws {DocumentApiValidationError} `INVALID_INPUT` for negative offset or non-positive limit.
 */
export function validatePaginationInput(offset?: number, limit?: number): void {
  if (offset != null && offset < 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', `offset must be >= 0, got ${offset}`, { offset });
  }
  if (limit != null && limit <= 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', `limit must be > 0, got ${limit}`, { limit });
  }
}

/**
 * Applies offset/limit pagination to an array, returning the total count and the sliced page.
 *
 * @param items - The full result array.
 * @param offset - Number of items to skip (default `0`).
 * @param limit - Maximum items to return (default: all remaining).
 * @returns An object with `total` (pre-pagination count) and `items` (the sliced page).
 * @throws {DocumentApiValidationError} `INVALID_INPUT` for negative offset or non-positive limit.
 */
export function paginate<T>(items: T[], offset = 0, limit?: number): { total: number; items: T[] } {
  validatePaginationInput(offset, limit);
  const total = items.length;
  const effectiveLimit = limit ?? total;
  return { total, items: items.slice(offset, offset + effectiveLimit) };
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
