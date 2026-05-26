// @ts-check
import { normalizeActorEmail, normalizeActorId, normalizeActorName } from '@superdoc/common';

/**
 * Identity helpers for the review graph.
 *
 * Same-user behavior requires high-confidence identity. Actor ids are the
 * canonical principal when both sides provide them. Legacy/imported content
 * still falls back to trusted author-email matching when ids are absent.
 */

/**
 * Trim and lowercase an email value. Anything not a string normalizes to ''.
 * @param {unknown} value
 * @returns {string}
 */
export const normalizeEmail = (value) => {
  return normalizeActorEmail(value);
};

/**
 * Trim and lowercase a display-name value. Anything not a string normalizes to ''.
 * @param {unknown} value
 * @returns {string}
 */
export const normalizeName = (value) => {
  return normalizeActorName(value);
};

const normalizeImportedAuthorName = (value) => {
  const normalized = normalizeName(value).replace(/\s+\(imported\)$/, '');
  return normalized === 'undefined' || normalized === 'null' ? '' : normalized;
};

/**
 * @typedef {Object} UserIdentity
 * @property {string} id        normalized actor id, '' when unknown.
 * @property {string} email     normalized email, '' when unknown.
 * @property {string} name      display name (may be empty).
 * @property {boolean} hasId    true when normalized id is non-empty.
 * @property {boolean} hasEmail true when normalized email is non-empty.
 * @property {string} [importedAuthor] imported author provenance, when present.
 */

/**
 * Read the current user identity from the editor options.
 * Tolerates a missing editor / options / user so callers can pass a partial
 * editor (or a snapshot for tests).
 *
 * @param {{ options?: { user?: { id?: unknown, name?: unknown, email?: unknown } } } | null | undefined} editor
 * @returns {UserIdentity}
 */
export const getCurrentUserIdentity = (editor) => {
  const user = editor?.options?.user ?? null;
  const id = normalizeActorId(user?.id);
  const email = normalizeEmail(user?.email);
  const name = typeof user?.name === 'string' ? user.name : '';
  return { id, email, name, hasId: id.length > 0, hasEmail: email.length > 0 };
};

/**
 * Pull the author identity off a mark's attrs (or a graph-shaped change/segment).
 * Accepts the raw mark, its attrs, or a graph object with `author`/`authorEmail`.
 *
 * @param {*} changeOrAttrs
 * @returns {UserIdentity}
 */
export const getChangeAuthorIdentity = (changeOrAttrs) => {
  if (!changeOrAttrs) return { id: '', email: '', name: '', hasId: false, hasEmail: false };

  // Accept either { attrs: {...} }, { mark: { attrs } }, or a flat attrs map.
  const attrs = changeOrAttrs.attrs ?? changeOrAttrs.mark?.attrs ?? changeOrAttrs;

  const id = normalizeActorId(attrs?.authorId);
  const email = normalizeEmail(attrs?.authorEmail);
  const name = typeof attrs?.author === 'string' ? attrs.author : '';
  const importedAuthor = typeof attrs?.importedAuthor === 'string' ? attrs.importedAuthor : '';
  /** @type {UserIdentity} */
  const identity = { id, email, name, hasId: id.length > 0, hasEmail: email.length > 0 };
  if (importedAuthor) identity.importedAuthor = importedAuthor;
  return identity;
};

const hasImportedAuthorConflict = ({ currentUser, change }) => {
  const importedAuthorName = normalizeImportedAuthorName(change?.importedAuthor);
  const currentName = normalizeName(currentUser?.name);
  const changeName = normalizeName(change?.name);

  if (!importedAuthorName || !currentName || !changeName) return false;
  if (importedAuthorName === currentName) return false;
  if (changeName === currentName) return false;
  return true;
};

const hasImportedInsertionProvenance = (attrs) => {
  const sourceId = attrs?.sourceId;
  if (sourceId !== undefined && sourceId !== null && String(sourceId).trim()) {
    return true;
  }

  if (normalizeImportedAuthorName(attrs?.importedAuthor)) {
    return true;
  }

  const sourceIds = attrs?.sourceIds;
  if (typeof sourceIds === 'string') {
    const trimmed = sourceIds.trim();
    return Boolean(trimmed && trimmed !== '{}' && trimmed !== 'null');
  }
  if (sourceIds && typeof sourceIds === 'object' && !Array.isArray(sourceIds)) {
    return Object.keys(sourceIds).length > 0;
  }

  return false;
};

/**
 * @typedef {(
 *   | 'same-user'
 *   | 'different-user'
 *   | 'unknown-current-user'
 *   | 'unknown-change-author'
 *   | 'conflicting'
 * )} OwnershipClassification
 */

/**
 * Classify ownership between the current editor user and a change author.
 *
 * Rules:
 * - when both sides provide actor ids, id match is authoritative.
 * - otherwise, normalized authorEmail match is high-confidence => `same-user`.
 * - display name alone is never same-user.
 * - missing current user email is `unknown-current-user`.
 * - missing change author email is `unknown-change-author`.
 * - both emails present but different => `different-user`.
 * - conflicting signals (e.g. emails match but names differ in a way that
 *   indicates an impersonation) are reported as `conflicting`. Caller treats
 *   it as different-user; the distinct code lets diagnostics report it.
 *
 * Only `same-user` may trigger same-user refinement. Every other code MUST
 * use different-user overlap behavior.
 *
 * @param {{ currentUser?: UserIdentity, change?: UserIdentity }} input
 * @returns {OwnershipClassification}
 */
export const classifyOwnership = ({ currentUser, change }) => {
  const cur = currentUser ?? { id: '', email: '', name: '', hasId: false, hasEmail: false };
  const auth = change ?? { id: '', email: '', name: '', hasId: false, hasEmail: false };

  if (hasImportedAuthorConflict({ currentUser: cur, change: auth })) {
    return 'conflicting';
  }

  if (cur.hasId && auth.hasId) {
    return cur.id === auth.id ? 'same-user' : 'different-user';
  }

  if (!cur.hasEmail) return 'unknown-current-user';
  if (!auth.hasEmail) return 'unknown-change-author';

  if (cur.email === auth.email) {
    return 'same-user';
  }

  return 'different-user';
};

/**
 * Convenience: returns true only when the classification is high-confidence
 * same-user. Use this as the gate before applying same-user refinement.
 *
 * @param {OwnershipClassification} classification
 * @returns {boolean}
 */
export const isSameUserHighConfidence = (classification) => classification === 'same-user';

/**
 * Refinement is slightly more permissive than review ownership. When neither
 * side carries actor ids or emails, legacy anonymous typing still coalesces
 * into the same logical change only when the stored no-email author is
 * actually unattributed, or when display names match.
 *
 * @param {{ currentUser?: UserIdentity, change?: UserIdentity }} input
 * @returns {boolean}
 */
export const matchesSameUserRefinement = ({ currentUser, change }) => {
  const cur = currentUser ?? { id: '', email: '', name: '', hasId: false, hasEmail: false };
  const auth = change ?? { id: '', email: '', name: '', hasId: false, hasEmail: false };
  const classification = classifyOwnership({ currentUser: cur, change: auth });
  if (isSameUserHighConfidence(classification)) return true;

  if (!cur.hasId && !auth.hasId && !cur.hasEmail && !auth.hasEmail) {
    const changeName = normalizeName(auth.name) || normalizeImportedAuthorName(auth.importedAuthor);
    if (!changeName) return true;
    const currentName = normalizeName(cur.name);
    return Boolean(currentName && currentName === changeName);
  }

  return false;
};

/**
 * Imported/no-email insertions predate reliable authorEmail metadata. They may
 * collapse on delete only when the mark is truly unattributed, or when its
 * no-email display name matches the current user. A named different author
 * with no email is still different-user review state and must be protected.
 *
 * @param {{ currentUser?: { id?: unknown, name?: unknown, email?: unknown }, insertionAttrs?: Record<string, unknown> | null | undefined }} input
 * @returns {boolean}
 */
export const shouldCollapseNoEmailInsertion = ({ currentUser, insertionAttrs }) => {
  const authorId = normalizeActorId(insertionAttrs?.authorId);
  const currentId = normalizeActorId(currentUser?.id);
  if (authorId || currentId) {
    return Boolean(authorId && currentId && authorId === currentId);
  }

  const authorEmail = normalizeEmail(insertionAttrs?.authorEmail);
  if (authorEmail) return false;

  if (!hasImportedInsertionProvenance(insertionAttrs)) return false;

  const authorName =
    normalizeName(insertionAttrs?.author) || normalizeImportedAuthorName(insertionAttrs?.importedAuthor);
  if (!authorName) return true;

  const currentName = normalizeName(currentUser?.name);
  return Boolean(currentName && currentName === authorName);
};
