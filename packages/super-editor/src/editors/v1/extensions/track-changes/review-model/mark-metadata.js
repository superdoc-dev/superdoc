// @ts-check
/**
 * Mark metadata helpers for the review graph.
 *
 * The graph is the semantic source of truth. Marks are the persistence
 * carrier. This module is the boundary that:
 *
 *   1. Reads optional persisted review attrs from a mark, falling back to
 *      inference when they are absent.
 *   2. Canonicalizes `sourceIds` to a deterministic JSON object so adjacent
 *      equivalent marks don't differ only by missing-vs-empty defaults.
 *   3. Provides the deterministic JSON serialization used by export.
 *
 * It deliberately knows nothing about transactions, ProseMirror state, or
 * editor identity. It operates on mark attrs only.
 */

import { TrackInsertMarkName, TrackDeleteMarkName, TrackFormatMarkName } from '../constants.js';

/** @typedef {'trackInsert'|'trackDelete'|'trackFormat'} TrackedMarkName */

/**
 * Canonical semantic types stored on marks.
 *
 * Internal graph values use these canonical v2-style strings. The public
 * document-api `TrackChangeType` union remains legacy `insert | delete |
 * format` until the contract is widened (closed product decision
 * 2026-05-21).
 *
 * @readonly
 */
export const CanonicalChangeType = Object.freeze({
  Insertion: 'insertion',
  Deletion: 'deletion',
  Replacement: 'replacement',
  Formatting: 'formatting',
  // Structural revisions (whole-object insert/delete) live on node attrs, not
  // marks. This is used for whole-table insert/delete. The public
  // document-api projection keeps the legacy `insert | delete | replacement |
  // format` union and maps structural table revisions back to insert/delete at
  // the adapter boundary.
  Structural: 'structural',
});

/**
 * Derived `subtype` values for v1 text scope.
 *
 * @readonly
 */
export const ChangeSubtype = Object.freeze({
  TextInsertion: 'text-insertion',
  TextDeletion: 'text-deletion',
  TextReplacement: 'text-replacement',
  RunFormatting: 'run-formatting',
  TableInsert: 'table-insert',
  TableDelete: 'table-delete',
});

/**
 * Derived side values for v1 text-overlap scope.
 *
 * @readonly
 */
export const SegmentSide = Object.freeze({
  Inserted: 'inserted',
  Deleted: 'deleted',
  Formatting: 'formatting',
});

/** @type {Set<string>} */
const CHANGE_TYPE_VALUES = new Set(Object.values(CanonicalChangeType));

/**
 * Derive the canonical segment side from a tracked mark name.
 *
 * @param {string} markName
 * @returns {'inserted'|'deleted'|'formatting'|null}
 */
export const sideFromMarkName = (markName) => {
  if (markName === TrackInsertMarkName) return SegmentSide.Inserted;
  if (markName === TrackDeleteMarkName) return SegmentSide.Deleted;
  if (markName === TrackFormatMarkName) return SegmentSide.Formatting;
  return null;
};

/**
 * Derive the subtype string from a canonical change type for v1 text scope.
 *
 * @param {string} changeType
 * @returns {string|null}
 */
export const subtypeFromChangeType = (changeType) => {
  switch (changeType) {
    case CanonicalChangeType.Insertion:
      return ChangeSubtype.TextInsertion;
    case CanonicalChangeType.Deletion:
      return ChangeSubtype.TextDeletion;
    case CanonicalChangeType.Replacement:
      return ChangeSubtype.TextReplacement;
    case CanonicalChangeType.Formatting:
      return ChangeSubtype.RunFormatting;
    default:
      return null;
  }
};

/**
 * Deterministic JSON serialization with sorted keys at every object level.
 *
 * Mirrors the rule in phase0-002 / "Attribute Defaults And Rendering":
 *
 *   "`sourceIds` must use one canonical serialization when stored on marks
 *    or exported as custom metadata: deterministic JSON with sorted keys.
 *    Do not alternate between object and compact string encodings."
 *
 * Arrays preserve their order — only object keys are sorted. Functions and
 * `undefined` values are dropped, matching JSON.stringify.
 *
 * @param {*} value
 * @returns {string}
 */
export const deterministicJson = (value) => {
  const canonical = canonicalizeForSerialization(value);
  // Top-level undefined/function => match JSON.stringify(undefined) === undefined.
  return JSON.stringify(canonical);
};

const canonicalizeForSerialization = (value) => {
  if (value === undefined || typeof value === 'function') return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map((entry) => {
      const inner = canonicalizeForSerialization(entry);
      // Arrays preserve slot positions; JSON.stringify renders undefined
      // slots as null to match standard JSON behavior.
      return inner === undefined ? null : inner;
    });
  }
  if (typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      const inner = canonicalizeForSerialization(value[key]);
      if (inner === undefined) continue;
      out[key] = inner;
    }
    return out;
  }
  return value;
};

/**
 * Normalize a `sourceIds` value to a canonical object form.
 *
 * Returns `{}` when input is null/undefined/non-object. String inputs are
 * parsed as JSON if possible; otherwise treated as an opaque `{ raw: <str> }`.
 *
 * Output is always a plain object whose entries are themselves deterministic.
 *
 * @param {*} value
 * @returns {Record<string, unknown>}
 */
export const canonicalizeSourceIds = (value) => {
  if (value == null) return {};

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return canonicalSourceIdsFromObject(parsed);
      }
    } catch {
      /* fall through */
    }
    return { raw: trimmed };
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return canonicalSourceIdsFromObject(value);
  }

  return {};
};

/**
 * @param {Record<string, unknown>} obj
 * @returns {Record<string, unknown>}
 */
const canonicalSourceIdsFromObject = (obj) => {
  /** @type {Record<string, unknown>} */
  const out = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    const v = obj[key];
    if (v == null) continue;
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (!trimmed) continue;
      out[key] = trimmed;
      continue;
    }
    if (typeof v === 'number' || typeof v === 'boolean') {
      out[key] = v;
      continue;
    }
    if (typeof v === 'object') {
      out[key] = canonicalizeForSerialization(v);
      continue;
    }
    // drop functions / undefined
  }
  return out;
};

/**
 * @typedef {Object} NormalizedTrackedAttrs
 * @property {string} id                  Active logical tracked-change id.
 * @property {string} revisionGroupId     Defaults to `id` for unsplit changes.
 * @property {string} splitFromId         Retired id this fragment descends from.
 * @property {string} changeType          Canonical type.
 * @property {string} replacementGroupId  Logical replacement group id.
 * @property {string} replacementSideId   Stable side id within a replacement.
 * @property {string} overlapParentId     Logical parent change id, or ''.
 * @property {Record<string, unknown>} sourceIds  Canonical sourceIds object.
 * @property {string} sourceId            Legacy raw Word `w:id` value or ''.
 * @property {string} importedAuthor      Imported author provenance.
 * @property {string} origin              Optional import origin.
 * @property {string} author              Display name.
 * @property {string} authorId            Stable actor id.
 * @property {string} authorEmail         Author email (not lowercased here).
 * @property {string} authorImage         Author image url/value.
 * @property {string} date                Created/modified ISO date.
 * @property {string} markType            One of trackInsert/trackDelete/trackFormat.
 * @property {string} side                Derived side.
 * @property {string} subtype             Derived subtype.
 * @property {string} explicitChangeType  Persisted changeType attr verbatim, or ''.
 * @property {boolean} hasReviewMetadata  Was any persisted review attr explicit?
 */

const stringAttr = (value) => (typeof value === 'string' ? value : '');

/**
 * Read review attrs off a mark/attrs blob with inference.
 *
 * Compatibility rules from phase0-002:
 * - `id` is the logical id.
 * - `revisionGroupId` defaults to `id`.
 * - `splitFromId` defaults to `''`.
 * - `changeType` is inferred from mark type if missing.
 * - `side` is inferred from mark type.
 * - explicit new metadata wins over legacy inference.
 * - `sourceIds` is canonicalized; legacy `sourceId` is folded in when present.
 *
 * @param {{ attrs?: Record<string, unknown>, type?: { name?: string } } | Record<string, unknown>} markOrAttrs
 * @param {string} [markName] Required when markOrAttrs is a plain attrs object.
 * @returns {NormalizedTrackedAttrs}
 */
export const readTrackedAttrs = (markOrAttrs, markName) => {
  const isMark = markOrAttrs && typeof markOrAttrs === 'object' && 'attrs' in markOrAttrs;
  const attrs = (isMark ? /** @type {*} */ (markOrAttrs).attrs : markOrAttrs) ?? {};
  const resolvedMarkName = markName ?? (isMark ? /** @type {*} */ (markOrAttrs).type?.name : '') ?? '';

  const id = stringAttr(attrs.id);
  const explicitRevisionGroupId = stringAttr(attrs.revisionGroupId);
  const explicitChangeType = stringAttr(attrs.changeType);
  const explicitOrigin = stringAttr(attrs.origin);
  const explicitSplitFromId = stringAttr(attrs.splitFromId);
  const explicitReplacementGroupId = stringAttr(attrs.replacementGroupId);
  const explicitReplacementSideId = stringAttr(attrs.replacementSideId);
  const explicitOverlapParentId = stringAttr(attrs.overlapParentId);

  const sideInferred = sideFromMarkName(resolvedMarkName) ?? '';
  const changeTypeInferred = inferChangeTypeFromMarkName(resolvedMarkName);
  const changeType =
    explicitChangeType && CHANGE_TYPE_VALUES.has(explicitChangeType) ? explicitChangeType : changeTypeInferred;
  const subtype = subtypeFromChangeType(changeType) ?? '';

  // sourceIds canonicalization — fold legacy `sourceId` into the canonical
  // shape when no explicit canonical entry exists.
  const sourceIds = canonicalizeSourceIds(attrs.sourceIds);
  const legacySourceId = stringAttr(attrs.sourceId);
  if (legacySourceId && resolvedMarkName) {
    const key = legacySourceIdKey(resolvedMarkName);
    if (key && !sourceIds[key]) {
      sourceIds[key] = legacySourceId;
    }
  }

  const hasReviewMetadata = Boolean(
    explicitChangeType ||
      explicitRevisionGroupId ||
      explicitSplitFromId ||
      explicitReplacementGroupId ||
      explicitReplacementSideId ||
      explicitOverlapParentId ||
      explicitOrigin ||
      (attrs.sourceIds != null && Object.keys(canonicalizeSourceIds(attrs.sourceIds)).length > 0),
  );

  return {
    id,
    revisionGroupId: explicitRevisionGroupId || id,
    splitFromId: explicitSplitFromId,
    changeType,
    replacementGroupId: explicitReplacementGroupId,
    replacementSideId: explicitReplacementSideId,
    overlapParentId: explicitOverlapParentId,
    sourceIds,
    sourceId: legacySourceId,
    importedAuthor: stringAttr(attrs.importedAuthor),
    origin: explicitOrigin,
    author: stringAttr(attrs.author),
    authorId: stringAttr(attrs.authorId),
    authorEmail: stringAttr(attrs.authorEmail),
    authorImage: stringAttr(attrs.authorImage),
    date: stringAttr(attrs.date),
    markType: resolvedMarkName,
    side: sideInferred,
    subtype,
    explicitChangeType: explicitChangeType && CHANGE_TYPE_VALUES.has(explicitChangeType) ? explicitChangeType : '',
    hasReviewMetadata,
  };
};

const inferChangeTypeFromMarkName = (markName) => {
  if (markName === TrackInsertMarkName) return CanonicalChangeType.Insertion;
  if (markName === TrackDeleteMarkName) return CanonicalChangeType.Deletion;
  if (markName === TrackFormatMarkName) return CanonicalChangeType.Formatting;
  return '';
};

const legacySourceIdKey = (markName) => {
  if (markName === TrackInsertMarkName) return 'wordIdInsert';
  if (markName === TrackDeleteMarkName) return 'wordIdDelete';
  if (markName === TrackFormatMarkName) return 'wordIdFormat';
  return '';
};

/**
 * Two adjacent marks should be considered "the same logical segment" when
 * every persisted attribute that survives normalization matches.
 *
 * Used by the graph builder to merge adjacent same-id, same-side mark spans
 * into one TrackedSegment. The comparison is intentionally normalization-aware:
 * a mark with an explicit `revisionGroupId: id` and a mark without that attr
 * compare equal, because the graph view treats missing-vs-default as the same.
 *
 * @param {NormalizedTrackedAttrs} a
 * @param {NormalizedTrackedAttrs} b
 * @returns {boolean}
 */
export const normalizedAttrsEqual = (a, b) => {
  if (a.markType !== b.markType) return false;
  if (a.id !== b.id) return false;
  if (a.revisionGroupId !== b.revisionGroupId) return false;
  if (a.splitFromId !== b.splitFromId) return false;
  if (a.changeType !== b.changeType) return false;
  // Note: explicitChangeType is intentionally NOT compared here. Two
  // adjacent marks where one persists `changeType: 'insertion'` and the
  // other relies on legacy inference must still merge — the spec's
  // attr-normalization rule says missing-vs-default must not split logical
  // segments.
  if (a.replacementGroupId !== b.replacementGroupId) return false;
  if (a.replacementSideId !== b.replacementSideId) return false;
  if (a.overlapParentId !== b.overlapParentId) return false;
  if (a.author !== b.author) return false;
  if (a.authorId !== b.authorId) return false;
  if (a.authorEmail !== b.authorEmail) return false;
  if (a.authorImage !== b.authorImage) return false;
  if (a.date !== b.date) return false;
  if (a.importedAuthor !== b.importedAuthor) return false;
  if (a.origin !== b.origin) return false;
  if (deterministicJson(a.sourceIds) !== deterministicJson(b.sourceIds)) return false;
  return true;
};

/**
 * Build the deterministic JSON encoding of a sourceIds object for storage
 * on a mark attr or export. Empty objects encode as `""` (empty string)
 * so PM mark equality stays clean for marks without source ids.
 *
 * @param {Record<string, unknown>} sourceIds
 * @returns {string}
 */
export const serializeSourceIds = (sourceIds) => {
  if (!sourceIds || Object.keys(sourceIds).length === 0) return '';
  return deterministicJson(sourceIds);
};
