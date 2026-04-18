/**
 * Canonical representation of diffable document state.
 *
 * All fingerprinting and snapshot capture flows through this module to ensure
 * a single source of truth for what "diffable state" means.
 */

import type { Node as PMNode } from 'prosemirror-model';
import type { NumberingProperties, StylesDocumentProperties } from '@superdoc/style-engine/ooxml';
import type { CommentInput } from '../algorithm/comment-diffing';
import type { HeaderFooterState } from '../algorithm/header-footer-diffing';
import type { PartsState } from '../algorithm/parts-diffing';
import { COMMENT_ATTRS_DIFF_IGNORED_KEYS } from '../algorithm/comment-diffing';
import { normalizeDocJSON } from '../algorithm/semantic-normalization';

/** The canonical diffable state of one document. */
export interface CanonicalDiffableState {
  body: Record<string, unknown>;
  comments: Record<string, unknown>[];
  styles: Record<string, unknown> | null;
  numbering: Record<string, unknown> | null;
  headerFooters: HeaderFooterState | null;
  partsState: PartsState | null;
}

/**
 * Keys stripped from the canonical comment representation.
 *
 * The diffing algorithm strips `textJson` and `elements` from *attribute*
 * comparison because body content is compared structurally via
 * `tokenizeCommentText`.  The fingerprint, however, must still cover body
 * content — otherwise an external snapshot can tamper with comment bodies
 * without changing the fingerprint.
 *
 * We therefore re-use the diff ignored-key list but explicitly keep
 * `textJson`, `elements`, and `commentId` in the canonical output.
 */
const CANONICAL_COMMENT_IGNORED_KEYS = COMMENT_ATTRS_DIFF_IGNORED_KEYS.filter(
  (key) => key !== 'textJson' && key !== 'elements' && key !== 'commentId',
);

/**
 * Strips non-semantic ownership fields from a comment for canonical
 * representation while preserving body-content fields (`textJson`,
 * `elements`) and identity fields (`commentId`) so they are covered by
 * the fingerprint.
 */
function canonicalizeComment(comment: CommentInput): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(comment)) {
    if (!CANONICAL_COMMENT_IGNORED_KEYS.includes(key)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Builds the canonical diffable state from raw editor data.
 *
 * This is the single source of truth for what parts of a document are
 * considered during fingerprinting and diffing.
 */
export function buildCanonicalDiffableState(
  doc: PMNode,
  comments: CommentInput[],
  styles: StylesDocumentProperties | null | undefined,
  numbering: NumberingProperties | null | undefined,
  headerFooters: HeaderFooterState | null | undefined,
  partsState: PartsState | null | undefined,
): CanonicalDiffableState {
  return {
    body: normalizeDocJSON(doc.toJSON() as Record<string, unknown>),
    comments: comments.map(canonicalizeComment),
    styles: styles ? (styles as unknown as Record<string, unknown>) : null,
    numbering: numbering ? (numbering as unknown as Record<string, unknown>) : null,
    headerFooters: headerFooters ? structuredClone(headerFooters) : null,
    partsState: partsState ? structuredClone(partsState) : null,
  };
}

/**
 * Recursively sorts object keys for stable serialization.
 * Arrays are preserved in order; only object key ordering is normalized.
 */
function sortKeysDeep(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Produces a stable JSON string from a canonical diffable state.
 * Key ordering is recursively normalized so that equivalent states
 * always produce identical strings regardless of insertion order.
 */
export function stableStringify(state: CanonicalDiffableState): string {
  return JSON.stringify(sortKeysDeep(state));
}
