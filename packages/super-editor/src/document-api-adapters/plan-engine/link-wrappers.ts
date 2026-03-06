/**
 * Link plan-engine wrappers — bridge links.* operations to the adapter layer.
 *
 * Links are mark-based (not nodes). This delegates to the existing hyperlink
 * mutation helpers for the actual ProseMirror mark operations.
 */

import type { Editor } from '../../core/Editor.js';
import type {
  LinkListInput,
  LinksListResult,
  LinkGetInput,
  LinkInfo,
  LinkInsertInput,
  LinkUpdateInput,
  LinkRemoveInput,
  LinkMutationResult,
  LinkAddress,
  LinkDestination,
  TextAddress,
  MutationOptions,
  ReceiptFailureCode,
} from '@superdoc/document-api';
import { buildDiscoveryResult } from '@superdoc/document-api';
import { findAllLinks, resolveLinkTarget, extractLinkInfo, buildLinkDiscoveryItem } from '../helpers/link-resolver.js';
import { paginate, resolveTextTarget } from '../helpers/adapter-utils.js';
import { getRevision } from './revision-tracker.js';
import { executeDomainCommand } from './plan-wrappers.js';
import { rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { clearIndexCache, getBlockIndex } from '../helpers/index-cache.js';
import { DocumentApiAdapterError } from '../errors.js';
import {
  wrapWithLink,
  insertLinkedText,
  patchLinkMark,
  unwrapLink,
  sanitizeHrefOrThrow,
  type HyperlinkWriteSpec,
} from '../helpers/hyperlink-mutation-helper.js';
import { buildInlineIndex, findInlineByType } from '../helpers/inline-address-resolver.js';

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

function linkSuccess(address: LinkAddress): LinkMutationResult {
  return { success: true, link: address };
}

function linkFailure(code: ReceiptFailureCode, message: string): LinkMutationResult {
  return { success: false, failure: { code, message } };
}

function receiptApplied(receipt: ReturnType<typeof executeDomainCommand>): boolean {
  return receipt.steps[0]?.effect === 'changed';
}

// ---------------------------------------------------------------------------
// Destination → HyperlinkWriteSpec
// ---------------------------------------------------------------------------

function destinationToSpec(destination: LinkDestination, tooltip?: string): HyperlinkWriteSpec {
  if (destination.kind === 'external') {
    return {
      href: destination.href,
      tooltip: tooltip ?? destination.tooltip,
    };
  }
  return {
    anchor: destination.bookmarkName,
    tooltip: tooltip ?? destination.tooltip,
  };
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export function linksListWrapper(editor: Editor, query?: LinkListInput): LinksListResult {
  const revision = getRevision(editor);
  const candidates = findAllLinks(editor);

  const allItems = candidates.map((c) => buildLinkDiscoveryItem(editor, c, revision));
  const { total, items: paged } = paginate(allItems, query?.offset, query?.limit);
  const effectiveLimit = query?.limit ?? total;

  return buildDiscoveryResult({
    evaluatedRevision: revision,
    total,
    items: paged,
    page: { limit: effectiveLimit, offset: query?.offset ?? 0, returned: paged.length },
  });
}

export function linksGetWrapper(editor: Editor, input: LinkGetInput): LinkInfo {
  const candidate = resolveLinkTarget(editor, input.target);
  return extractLinkInfo(editor, candidate);
}

// ---------------------------------------------------------------------------
// Mutation operations
// ---------------------------------------------------------------------------

export function linksInsertWrapper(
  editor: Editor,
  input: LinkInsertInput,
  options?: MutationOptions,
): LinkMutationResult {
  rejectTrackedMode('links.insert', options);

  // Convert TextTarget (segments-based) to TextAddress (flat)
  const firstSegment = input.at.segments[0];
  const textAddress: TextAddress = {
    kind: 'text',
    blockId: firstSegment.blockId,
    range: firstSegment.range,
  };

  const resolved = resolveTextTarget(editor, textAddress);
  if (!resolved) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'links.insert: target block not found.', {
      target: input.at,
    });
  }

  if (input.destination.kind === 'external') {
    sanitizeHrefOrThrow(input.destination.href);
  }

  const dryAddress: LinkAddress = {
    kind: 'inline',
    nodeType: 'hyperlink',
    anchor: {
      start: { blockId: firstSegment.blockId, offset: firstSegment.range.start },
      end: { blockId: firstSegment.blockId, offset: firstSegment.range.end },
    },
  };

  if (options?.dryRun) {
    return linkSuccess(dryAddress);
  }

  const spec = destinationToSpec(input.destination);

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
    return linkFailure('NO_OP', 'Insert operation produced no change.');
  }

  // Re-resolve post-mutation
  const postCandidate = findLinkAtRange(editor, resolved.from, resolved.to);
  return linkSuccess(postCandidate ? candidateToAddress(postCandidate) : dryAddress);
}

export function linksUpdateWrapper(
  editor: Editor,
  input: LinkUpdateInput,
  options?: MutationOptions,
): LinkMutationResult {
  rejectTrackedMode('links.update', options);

  const candidate = resolveLinkTarget(editor, input.target);
  const existingMark = candidate.mark;
  if (!existingMark) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'links.update: resolved candidate has no mark.');
  }

  // Build patch from LinkPatch → hyperlink attrs
  const patchAttrs: Record<string, unknown> = {};
  if (input.patch.destination) {
    if (input.patch.destination.kind === 'external') {
      sanitizeHrefOrThrow(input.patch.destination.href);
      patchAttrs.href = input.patch.destination.href;
      patchAttrs.anchor = null;
    } else {
      patchAttrs.anchor = input.patch.destination.bookmarkName;
      patchAttrs.href = `#${input.patch.destination.bookmarkName}`;
    }
  }
  if (input.patch.tooltip !== undefined) {
    patchAttrs.tooltip = input.patch.tooltip;
  }

  if (Object.keys(patchAttrs).length === 0) {
    return linkFailure('NO_OP', 'No patch fields provided.');
  }

  const address = candidateToAddress(candidate);

  if (options?.dryRun) {
    return linkSuccess(address);
  }

  const resolvedRange = resolveTextRange(editor, candidate);

  const receipt = executeDomainCommand(
    editor,
    () => {
      const result = patchLinkMark(editor, resolvedRange.from, resolvedRange.to, existingMark, patchAttrs);
      if (result) clearIndexCache(editor);
      return result;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) {
    return linkFailure('NO_OP', 'Update operation produced no change.');
  }

  return linkSuccess(address);
}

export function linksRemoveWrapper(
  editor: Editor,
  input: LinkRemoveInput,
  options?: MutationOptions,
): LinkMutationResult {
  rejectTrackedMode('links.remove', options);

  const candidate = resolveLinkTarget(editor, input.target);
  const address = candidateToAddress(candidate);

  if (options?.dryRun) {
    return linkSuccess(address);
  }

  const resolvedRange = resolveTextRange(editor, candidate);

  const receipt = executeDomainCommand(
    editor,
    () => {
      const result = unwrapLink(editor, resolvedRange.from, resolvedRange.to);
      if (result) clearIndexCache(editor);
      return result;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) {
    return linkFailure('NO_OP', 'Remove operation produced no change.');
  }

  return linkSuccess(address);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function candidateToAddress(candidate: { anchor: LinkAddress['anchor'] }): LinkAddress {
  return { kind: 'inline', nodeType: 'hyperlink', anchor: candidate.anchor };
}

function resolveTextRange(editor: Editor, candidate: { pos: number; end: number }): { from: number; to: number } {
  return { from: candidate.pos, to: candidate.end };
}

function findLinkAtRange(editor: Editor, from: number, to: number) {
  const blockIndex = getBlockIndex(editor);
  const inlineIndex = buildInlineIndex(editor, blockIndex);
  const links = findInlineByType(inlineIndex, 'hyperlink');
  return (
    links.find((c) => c.pos >= from - 1 && c.pos <= from + 1 && c.end >= to - 1 && c.end <= to + 1) ??
    links.find((c) => c.pos <= from && c.end >= to)
  );
}
