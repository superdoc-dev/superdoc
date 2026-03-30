/**
 * Hyperlinks plan-engine wrappers — bridge hyperlink operations to the adapter layer.
 */

import type { Mark } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import type {
  HyperlinksListQuery,
  HyperlinksListResult,
  HyperlinksGetInput,
  HyperlinkInfo,
  HyperlinksWrapInput,
  HyperlinksInsertInput,
  HyperlinksPatchInput,
  HyperlinksRemoveInput,
  HyperlinkMutationResult,
  HyperlinkTarget,
  HyperlinkReadProperties,
  HyperlinkDomain,
  MutationOptions,
  ReceiptFailureCode,
  InlineAnchor,
} from '@superdoc/document-api';
import { buildDiscoveryResult, buildDiscoveryItem, buildResolvedHandle } from '@superdoc/document-api';
import { getBlockIndex, clearIndexCache } from '../helpers/index-cache.js';
import {
  buildInlineIndex,
  findInlineByAnchor,
  findInlineByType,
  type InlineCandidate,
} from '../helpers/inline-address-resolver.js';
import {
  paginate,
  resolveTextTarget,
  resolveDefaultInsertTarget,
  insertParagraphAtEnd,
  resolveWithinScope,
  scopeByRange,
} from '../helpers/adapter-utils.js';
import { getRevision } from './revision-tracker.js';
import { executeDomainCommand } from './plan-wrappers.js';
import { rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { DocumentApiAdapterError } from '../errors.js';
import {
  wrapWithLink,
  insertLinkedText,
  patchLinkMark,
  unwrapLink,
  deleteLinkedText,
  sanitizeHrefOrThrow,
  type HyperlinkWriteSpec,
} from '../helpers/hyperlink-mutation-helper.js';

// ---------------------------------------------------------------------------
// Read normalization
// ---------------------------------------------------------------------------

/**
 * Normalizes PM mark attrs to HyperlinkReadProperties.
 *
 * Applies the read normalization rules from the plan:
 * - #-prefixed href with no anchor → extract as anchor, suppress href
 * - #-prefixed href matching anchor → suppress href (synthetic)
 * - Real external href → report as-is
 */
function normalizeReadProperties(attrs: Record<string, unknown>): HyperlinkReadProperties {
  const rawHref = typeof attrs.href === 'string' ? attrs.href : undefined;
  const rawAnchor = typeof attrs.anchor === 'string' ? attrs.anchor : undefined;
  const rawDocLocation = typeof attrs.docLocation === 'string' ? attrs.docLocation : undefined;
  const rawTooltip = typeof attrs.tooltip === 'string' ? attrs.tooltip : undefined;
  const rawTarget = typeof attrs.target === 'string' ? attrs.target : undefined;
  const rawRel = typeof attrs.rel === 'string' ? attrs.rel : undefined;

  const props: HyperlinkReadProperties = {};

  // Determine effective anchor
  let effectiveAnchor = rawAnchor;
  let effectiveHref = rawHref;

  if (rawHref && rawHref.startsWith('#')) {
    const fragment = rawHref.slice(1);
    if (!rawAnchor) {
      // #-href with no anchor attr → normalize to anchor
      effectiveAnchor = fragment;
      effectiveHref = undefined;
    } else if (rawAnchor === fragment) {
      // #-href matches anchor → suppress synthetic href
      effectiveHref = undefined;
    }
    // else: #-href differs from anchor — keep both (unusual but possible)
  }

  if (effectiveHref) props.href = effectiveHref;
  if (effectiveAnchor) props.anchor = effectiveAnchor;
  if (rawDocLocation) props.docLocation = rawDocLocation;
  if (rawTooltip) props.tooltip = rawTooltip;
  if (rawTarget) props.target = rawTarget;
  if (rawRel) props.rel = rawRel;

  return props;
}

// ---------------------------------------------------------------------------
// Candidate → domain projection
// ---------------------------------------------------------------------------

function candidateToTarget(candidate: InlineCandidate): HyperlinkTarget {
  return {
    kind: 'inline',
    nodeType: 'hyperlink',
    anchor: candidate.anchor,
  };
}

function candidateToReadProperties(candidate: InlineCandidate): HyperlinkReadProperties {
  const attrs = (candidate.mark?.attrs ?? candidate.attrs ?? {}) as Record<string, unknown>;
  return normalizeReadProperties(attrs);
}

function extractDisplayText(editor: Editor, candidate: InlineCandidate): string | undefined {
  const doc = editor.state.doc;
  try {
    return doc.textBetween(candidate.pos, candidate.end, '');
  } catch {
    return undefined;
  }
}

function candidateToDomain(editor: Editor, candidate: InlineCandidate): HyperlinkDomain {
  return {
    address: candidateToTarget(candidate),
    properties: candidateToReadProperties(candidate),
    text: extractDisplayText(editor, candidate),
  };
}

function encodeInlineRef(anchor: InlineAnchor): string {
  return `${anchor.start.blockId}:${anchor.start.offset}:${anchor.end.offset}`;
}

// ---------------------------------------------------------------------------
// TOC guard
// ---------------------------------------------------------------------------

function isInsideTocBlock(editor: Editor, pos: number): boolean {
  const resolved = editor.state.doc.resolve(pos);
  for (let depth = resolved.depth; depth > 0; depth--) {
    const node = resolved.node(depth);
    if (node.type.name === 'tableOfContents') return true;
  }
  return false;
}

function rejectIfInsideToc(editor: Editor, pos: number, operationName: string): void {
  if (isInsideTocBlock(editor, pos)) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `${operationName}: target is inside a TOC block. TOC content is managed by toc.* operations.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Inline candidate resolution
// ---------------------------------------------------------------------------

function findHyperlinkCandidates(editor: Editor): InlineCandidate[] {
  const blockIndex = getBlockIndex(editor);
  const inlineIndex = buildInlineIndex(editor, blockIndex);
  return findInlineByType(inlineIndex, 'hyperlink');
}

function resolveHyperlinkCandidate(editor: Editor, target: HyperlinkTarget): InlineCandidate {
  const blockIndex = getBlockIndex(editor);
  const inlineIndex = buildInlineIndex(editor, blockIndex);
  const candidate = findInlineByAnchor(inlineIndex, target);
  if (!candidate) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Hyperlink target not found in document.', { target });
  }
  return candidate;
}

function resolveCandidateTextRange(
  editor: Editor,
  candidate: InlineCandidate,
  operationName: string,
): { from: number; to: number } {
  const start = candidate.anchor.start;
  const end = candidate.anchor.end;
  if (start.blockId !== end.blockId) {
    throw new DocumentApiAdapterError('INVALID_TARGET', `${operationName}: hyperlink anchor spans multiple blocks.`, {
      anchor: candidate.anchor,
    });
  }

  const resolved = resolveTextTarget(editor, {
    kind: 'text',
    blockId: start.blockId,
    range: { start: start.offset, end: end.offset },
  });
  if (!resolved) {
    throw new DocumentApiAdapterError(
      'TARGET_NOT_FOUND',
      `${operationName}: hyperlink text range could not be resolved.`,
      {
        anchor: candidate.anchor,
      },
    );
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

function hyperlinkSuccess(target: HyperlinkTarget): HyperlinkMutationResult {
  return { success: true, hyperlink: target };
}

function hyperlinkFailure(code: ReceiptFailureCode, message: string): HyperlinkMutationResult {
  return { success: false, failure: { code, message } };
}

function receiptApplied(receipt: ReturnType<typeof executeDomainCommand>): boolean {
  return receipt.steps[0]?.effect === 'changed';
}

// ---------------------------------------------------------------------------
// Filtering helpers for hyperlinks.list
// ---------------------------------------------------------------------------

function matchesListQuery(candidate: InlineCandidate, query: HyperlinksListQuery | undefined, editor: Editor): boolean {
  if (!query) return true;

  const props = candidateToReadProperties(candidate);

  if (query.hrefPattern && (!props.href || !props.href.includes(query.hrefPattern))) {
    return false;
  }
  if (query.anchor && props.anchor !== query.anchor) {
    return false;
  }
  if (query.textPattern) {
    const text = extractDisplayText(editor, candidate);
    if (!text || !text.includes(query.textPattern)) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export function hyperlinksListWrapper(editor: Editor, query?: HyperlinksListQuery): HyperlinksListResult {
  const revision = getRevision(editor);
  let candidates = findHyperlinkCandidates(editor);

  // Apply within scope filtering when provided
  if (query?.within) {
    const blockIndex = getBlockIndex(editor);
    const diagnostics: { message: string }[] = [];
    const withinResult = resolveWithinScope(blockIndex, { within: query.within }, diagnostics);
    if (!withinResult.ok) {
      // Scope block not found — return empty result rather than throwing
      candidates = [];
    } else {
      candidates = scopeByRange(candidates, withinResult.range);
    }
  }

  const filtered = candidates.filter((c) => matchesListQuery(c, query, editor));
  const allItems = filtered.map((candidate) => {
    const domain = candidateToDomain(editor, candidate);
    const ref = encodeInlineRef(candidate.anchor);
    const handle = buildResolvedHandle(ref, 'ephemeral', 'node');
    return buildDiscoveryItem(ref, handle, domain);
  });

  const { total, items: paged } = paginate(allItems, query?.offset, query?.limit);
  const effectiveLimit = query?.limit ?? total;

  return buildDiscoveryResult({
    evaluatedRevision: revision,
    total,
    items: paged,
    page: { limit: effectiveLimit, offset: query?.offset ?? 0, returned: paged.length },
  });
}

export function hyperlinksGetWrapper(editor: Editor, input: HyperlinksGetInput): HyperlinkInfo {
  const candidate = resolveHyperlinkCandidate(editor, input.target);
  return {
    address: candidateToTarget(candidate),
    properties: candidateToReadProperties(candidate),
    text: extractDisplayText(editor, candidate),
  };
}

// ---------------------------------------------------------------------------
// Mutation operations
// ---------------------------------------------------------------------------

function specFromInput(link: {
  destination: { href?: string; anchor?: string; docLocation?: string };
  tooltip?: string;
  target?: string;
  rel?: string;
}): HyperlinkWriteSpec {
  return {
    href: link.destination.href,
    anchor: link.destination.anchor,
    docLocation: link.destination.docLocation,
    tooltip: link.tooltip,
    target: link.target,
    rel: link.rel,
  };
}

export function hyperlinksWrapWrapper(
  editor: Editor,
  input: HyperlinksWrapInput,
  options?: MutationOptions,
): HyperlinkMutationResult {
  rejectTrackedMode('hyperlinks.wrap', options);

  const resolved = resolveTextTarget(editor, input.target);
  if (!resolved) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'hyperlinks.wrap: text target block not found.', {
      target: input.target,
    });
  }

  rejectIfInsideToc(editor, resolved.from, 'hyperlinks.wrap');

  // Check for existing links in range — detect overlaps
  const blockIndex = getBlockIndex(editor);
  const inlineIndex = buildInlineIndex(editor, blockIndex);
  const hyperlinks = findInlineByType(inlineIndex, 'hyperlink');
  const overlapping = hyperlinks.filter((c) => c.pos < resolved.to && c.end > resolved.from);

  if (overlapping.length > 1) {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'hyperlinks.wrap: target range spans multiple existing links.');
  }
  if (overlapping.length === 1) {
    const existing = overlapping[0];
    // Full overlap with same range — check if same destination (NO_OP)
    if (existing.pos === resolved.from && existing.end === resolved.to) {
      // Compare destinations
      const existingProps = candidateToReadProperties(existing);
      const spec = specFromInput(input.link);
      if (existingProps.href === spec.href && existingProps.anchor === spec.anchor) {
        return hyperlinkFailure('NO_OP', 'Text range is already linked with the same destination.');
      }
      // Different destination — will replace the link (fall through)
    } else {
      // Partial overlap
      throw new DocumentApiAdapterError(
        'INVALID_TARGET',
        'hyperlinks.wrap: target range partially overlaps an existing link. Remove the existing link first.',
      );
    }
  }

  // Validate href eagerly so dry-run and real execution have parity
  if (input.link.destination.href) {
    sanitizeHrefOrThrow(input.link.destination.href);
  }

  if (options?.dryRun) {
    // Build a projected target address for dry-run response
    const dryTarget: HyperlinkTarget = {
      kind: 'inline',
      nodeType: 'hyperlink',
      anchor: {
        start: { blockId: input.target.blockId, offset: input.target.range.start },
        end: { blockId: input.target.blockId, offset: input.target.range.end },
      },
    };
    return hyperlinkSuccess(dryTarget);
  }

  const spec = specFromInput(input.link);
  const receipt = executeDomainCommand(
    editor,
    () => {
      const result = wrapWithLink(editor, resolved.from, resolved.to, spec);
      if (result) clearIndexCache(editor);
      return result;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) {
    return hyperlinkFailure('NO_OP', 'Wrap operation produced no change.');
  }

  // Re-resolve to get the actual address post-mutation
  const postCandidate = findHyperlinkAtRange(editor, resolved.from, resolved.to);
  return hyperlinkSuccess(
    postCandidate
      ? candidateToTarget(postCandidate)
      : {
          kind: 'inline',
          nodeType: 'hyperlink',
          anchor: {
            start: { blockId: input.target.blockId, offset: input.target.range.start },
            end: { blockId: input.target.blockId, offset: input.target.range.end },
          },
        },
  );
}

export function hyperlinksInsertWrapper(
  editor: Editor,
  input: HyperlinksInsertInput,
  options?: MutationOptions,
): HyperlinkMutationResult {
  rejectTrackedMode('hyperlinks.insert', options);

  let insertPos: number;
  let blockId: string;
  let offset: number;
  let structuralEnd = false;

  if (input.target) {
    const resolved = resolveTextTarget(editor, input.target);
    if (!resolved) {
      throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'hyperlinks.insert: text target block not found.', {
        target: input.target,
      });
    }
    rejectIfInsideToc(editor, resolved.from, 'hyperlinks.insert');
    insertPos = resolved.from;
    blockId = input.target.blockId;
    offset = input.target.range.start;
  } else {
    // Insert at document end using the shared fallback resolver
    const fallback = resolveDefaultInsertTarget(editor);
    if (!fallback) {
      throw new DocumentApiAdapterError(
        'TARGET_NOT_FOUND',
        'hyperlinks.insert: document has no content to insert into.',
      );
    }
    if (fallback.kind === 'text-block') {
      insertPos = fallback.range.from;
      blockId = fallback.target.blockId;
      offset = fallback.target.range.start;
    } else {
      // structural-end: must create a paragraph host during mutation
      insertPos = fallback.insertPos;
      blockId = '';
      offset = 0;
      structuralEnd = true;
    }
  }

  // Validate href eagerly so dry-run and real execution have parity
  if (input.link.destination.href) {
    sanitizeHrefOrThrow(input.link.destination.href);
  }

  if (options?.dryRun) {
    const dryTarget: HyperlinkTarget = {
      kind: 'inline',
      nodeType: 'hyperlink',
      anchor: {
        start: { blockId, offset },
        end: { blockId, offset: offset + input.text.length },
      },
    };
    return hyperlinkSuccess(dryTarget);
  }

  const spec = specFromInput(input.link);
  const receipt = executeDomainCommand(
    editor,
    () => {
      if (structuralEnd) {
        // Create a new paragraph host, then apply the link mark over the inserted text
        insertParagraphAtEnd(editor, insertPos, input.text);
        clearIndexCache(editor);
        // The paragraph was inserted at insertPos; its text starts at insertPos + 1
        const textStart = insertPos + 1;
        const result = wrapWithLink(editor, textStart, textStart + input.text.length, spec);
        if (result) clearIndexCache(editor);
        return result;
      }
      const result = insertLinkedText(editor, insertPos, input.text, spec);
      if (result) clearIndexCache(editor);
      return result;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) {
    return hyperlinkFailure('NO_OP', 'Insert operation produced no change.');
  }

  // Re-resolve to get the actual address post-mutation
  const searchFrom = structuralEnd ? insertPos + 1 : insertPos;
  const searchTo = searchFrom + input.text.length;
  const postCandidate = findHyperlinkAtRange(editor, searchFrom, searchTo);
  return hyperlinkSuccess(
    postCandidate
      ? candidateToTarget(postCandidate)
      : {
          kind: 'inline',
          nodeType: 'hyperlink',
          anchor: {
            start: { blockId, offset },
            end: { blockId, offset: offset + input.text.length },
          },
        },
  );
}

export function hyperlinksPatchWrapper(
  editor: Editor,
  input: HyperlinksPatchInput,
  options?: MutationOptions,
): HyperlinkMutationResult {
  rejectTrackedMode('hyperlinks.patch', options);

  const candidate = resolveHyperlinkCandidate(editor, input.target);
  const resolvedRange = resolveCandidateTextRange(editor, candidate, 'hyperlinks.patch');
  rejectIfInsideToc(editor, resolvedRange.from, 'hyperlinks.patch');

  const existingMark = candidate.mark;
  if (!existingMark) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'hyperlinks.patch: resolved candidate has no mark.');
  }

  // Validate destination safety: patch must not clear both href and anchor.
  // A fragment-style href (#bookmark) counts as a valid destination even
  // without a separate anchor attr — it's how anchor-only links are stored.
  const oldAttrs = existingMark.attrs as Record<string, unknown>;
  const mergedHref = input.patch.href === undefined ? oldAttrs.href : input.patch.href;
  const mergedAnchor = input.patch.anchor === undefined ? oldAttrs.anchor : input.patch.anchor;
  const hasHref = typeof mergedHref === 'string' && mergedHref.length > 0;
  const hasAnchor = typeof mergedAnchor === 'string' && mergedAnchor.length > 0;
  if (!hasHref && !hasAnchor) {
    throw new DocumentApiAdapterError(
      'INVALID_INPUT',
      'hyperlinks.patch: resulting destination must have at least one of href or anchor.',
    );
  }

  // Sanitize href if provided
  if (typeof input.patch.href === 'string') {
    sanitizeHrefOrThrow(input.patch.href);
  }

  // Check NO_OP: if all patch fields match existing values
  const currentProps = candidateToReadProperties(candidate);
  const isNoop = Object.entries(input.patch).every(([key, value]) => {
    if (value === undefined) return true;
    if (value === null) return currentProps[key as keyof typeof currentProps] === undefined;
    return currentProps[key as keyof typeof currentProps] === value;
  });
  if (isNoop) {
    return hyperlinkFailure('NO_OP', 'Patch produces no change — all values already match.');
  }

  if (options?.dryRun) {
    return hyperlinkSuccess(candidateToTarget(candidate));
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      const result = patchLinkMark(editor, resolvedRange.from, resolvedRange.to, existingMark, input.patch);
      if (result) clearIndexCache(editor);
      return result;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) {
    return hyperlinkFailure('NO_OP', 'Patch operation produced no change.');
  }

  // Re-resolve to get updated address
  const postCandidate = findHyperlinkAtRange(editor, resolvedRange.from, resolvedRange.to);
  return hyperlinkSuccess(postCandidate ? candidateToTarget(postCandidate) : candidateToTarget(candidate));
}

export function hyperlinksRemoveWrapper(
  editor: Editor,
  input: HyperlinksRemoveInput,
  options?: MutationOptions,
): HyperlinkMutationResult {
  rejectTrackedMode('hyperlinks.remove', options);

  const candidate = resolveHyperlinkCandidate(editor, input.target);
  const resolvedRange = resolveCandidateTextRange(editor, candidate, 'hyperlinks.remove');
  rejectIfInsideToc(editor, resolvedRange.from, 'hyperlinks.remove');

  const mode = input.mode ?? 'unwrap';
  const targetAddress = candidateToTarget(candidate);

  if (options?.dryRun) {
    return hyperlinkSuccess(targetAddress);
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      const result =
        mode === 'unwrap'
          ? unwrapLink(editor, resolvedRange.from, resolvedRange.to)
          : deleteLinkedText(editor, resolvedRange.from, resolvedRange.to);
      if (result) clearIndexCache(editor);
      return result;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) {
    return hyperlinkFailure('NO_OP', `Remove (${mode}) operation produced no change.`);
  }

  return hyperlinkSuccess(targetAddress);
}

// ---------------------------------------------------------------------------
// Post-mutation resolution helper
// ---------------------------------------------------------------------------

function findHyperlinkAtRange(editor: Editor, from: number, to: number): InlineCandidate | undefined {
  const blockIndex = getBlockIndex(editor);
  const inlineIndex = buildInlineIndex(editor, blockIndex);
  const hyperlinks = findInlineByType(inlineIndex, 'hyperlink');
  // Find the candidate closest to the expected range
  return (
    hyperlinks.find((c) => c.pos >= from - 1 && c.pos <= from + 1 && c.end >= to - 1 && c.end <= to + 1) ??
    hyperlinks.find((c) => c.pos <= from && c.end >= to)
  );
}
