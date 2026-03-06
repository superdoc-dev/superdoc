/**
 * Link resolver — finds, resolves, and extracts info from hyperlink marks.
 *
 * Links are ProseMirror marks (not nodes). Resolution walks the document
 * for `link` marks via the inline-address-resolver infrastructure.
 */

import type { Editor } from '../../core/Editor.js';
import type {
  LinkAddress,
  LinkDomain,
  LinkInfo,
  LinkDestination,
  DiscoveryItem,
  InlineAnchor,
} from '@superdoc/document-api';
import { buildDiscoveryItem, buildResolvedHandle } from '@superdoc/document-api';
import { getBlockIndex } from './index-cache.js';
import {
  buildInlineIndex,
  findInlineByAnchor,
  findInlineByType,
  type InlineCandidate,
} from './inline-address-resolver.js';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Candidate helpers
// ---------------------------------------------------------------------------

function candidateToAddress(candidate: InlineCandidate): LinkAddress {
  return {
    kind: 'inline',
    nodeType: 'hyperlink',
    anchor: candidate.anchor,
  };
}

function extractDestination(attrs: Record<string, unknown>): LinkDestination {
  const href = typeof attrs.href === 'string' ? attrs.href : undefined;
  const anchor = typeof attrs.anchor === 'string' ? attrs.anchor : undefined;
  const tooltip = typeof attrs.tooltip === 'string' ? attrs.tooltip : undefined;

  // Internal link: has an anchor reference (bookmark)
  if (anchor) {
    return { kind: 'internal', bookmarkName: anchor, ...(tooltip && { tooltip }) };
  }

  // #-prefixed href → internal
  if (href?.startsWith('#')) {
    return { kind: 'internal', bookmarkName: href.slice(1), ...(tooltip && { tooltip }) };
  }

  // External link
  return { kind: 'external', href: href ?? '', ...(tooltip && { tooltip }) };
}

function extractDisplayText(editor: Editor, candidate: InlineCandidate): string {
  try {
    return editor.state.doc.textBetween(candidate.pos, candidate.end, '');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Public resolution functions
// ---------------------------------------------------------------------------

export function findAllLinks(editor: Editor): InlineCandidate[] {
  const blockIndex = getBlockIndex(editor);
  const inlineIndex = buildInlineIndex(editor, blockIndex);
  return findInlineByType(inlineIndex, 'hyperlink');
}

export function resolveLinkTarget(editor: Editor, target: LinkAddress): InlineCandidate {
  const blockIndex = getBlockIndex(editor);
  const inlineIndex = buildInlineIndex(editor, blockIndex);
  const candidate = findInlineByAnchor(inlineIndex, target);
  if (!candidate) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Link target not found in document.', { target });
  }
  return candidate;
}

export function extractLinkInfo(editor: Editor, candidate: InlineCandidate): LinkInfo {
  const attrs = (candidate.mark?.attrs ?? candidate.attrs ?? {}) as Record<string, unknown>;
  return {
    address: candidateToAddress(candidate),
    destination: extractDestination(attrs),
    tooltip: typeof attrs.tooltip === 'string' ? attrs.tooltip : undefined,
    text: extractDisplayText(editor, candidate),
  };
}

// ---------------------------------------------------------------------------
// Discovery item builder
// ---------------------------------------------------------------------------

function encodeInlineRef(anchor: InlineAnchor): string {
  return `${anchor.start.blockId}:${anchor.start.offset}:${anchor.end.offset}`;
}

export function buildLinkDiscoveryItem(
  editor: Editor,
  candidate: InlineCandidate,
  evaluatedRevision: string,
): DiscoveryItem<LinkDomain> {
  const attrs = (candidate.mark?.attrs ?? candidate.attrs ?? {}) as Record<string, unknown>;
  const address = candidateToAddress(candidate);
  const domain: LinkDomain = {
    address,
    destination: extractDestination(attrs),
    tooltip: typeof attrs.tooltip === 'string' ? attrs.tooltip : undefined,
    text: extractDisplayText(editor, candidate),
  };

  const ref = encodeInlineRef(candidate.anchor);
  const handle = buildResolvedHandle(ref, 'ephemeral', 'node');
  const id = `link:${ref}:${evaluatedRevision}`;
  return buildDiscoveryItem(id, handle, domain);
}
