/**
 * Consumer typecheck: comment + mode + shared-user public APIs on `SuperDoc`.
 *
 * Drains the second batch of obligations from the public-method
 * coverage gate (#3481). Each assertion locks the parameter or return
 * shape of a method on the supported root surface, so a future
 * migration cannot quietly narrow or widen the contract without CI
 * failing on the obligation diff.
 *
 * Methods covered here (return types verified against the emitted
 * `.d.ts`, not inferred from intent):
 *
 *   - `getComment(commentId)` → `Record<string, unknown> | null`
 *   - `setDocumentMode(type)` → `void`
 *   - `addSharedUser(user)` → `void`
 *   - `removeSharedUser(email)` → `void`
 *
 * The mutation methods have no declared return type in source; TS
 * infers `void`, which the emitted `.d.ts` ships. The `void`
 * assertion is deliberate: a future tightening that introduces a
 * real return value (e.g. `boolean` for "found and removed") will
 * fail this assertion and land as an intentional contract change.
 *
 * `addSharedUser` / `removeSharedUser` previously failed identity
 * equality on their `User` parameter because the methods accepted a
 * SuperDoc-internal `User` interface that re-declared the public
 * super-editor `User`. This PR unifies the two so the imported
 * `User` from `superdoc` is the same symbol the methods accept.
 */
import type { DocumentMode, SuperDoc, User } from 'superdoc';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertEqual<A, B> = Equal<A, B> extends true ? true : never;

declare const sd: SuperDoc;
declare const realUser: User;

// ─── getComment ─────────────────────────────────────────────────────
// Looks up a comment by id in the comments Pinia store. Returns the
// raw comment record (untyped at the Pinia layer, hence
// `Record<string, unknown>`) or `null` for unknown ids / no store.
const _getCommentParamsOk: AssertEqual<Parameters<SuperDoc['getComment']>, [commentId: string]> = true;
const _getCommentReturnOk: AssertEqual<ReturnType<SuperDoc['getComment']>, Record<string, unknown> | null> = true;
const _commentValue: Record<string, unknown> | null = sd.getComment('comment-id-1');

// ─── setDocumentMode ────────────────────────────────────────────────
// Switches the document mode. Early-returns on falsy `type` and on
// pre-ready state. Return is `void`.
const _setDocumentModeParamsOk: AssertEqual<Parameters<SuperDoc['setDocumentMode']>, [type: DocumentMode]> = true;
const _setDocumentModeReturnOk: AssertEqual<ReturnType<SuperDoc['setDocumentMode']>, void> = true;
const editingMode: DocumentMode = 'editing';
sd.setDocumentMode(editingMode);

// ─── addSharedUser ──────────────────────────────────────────────────
// No-op when the user's email is already present; otherwise appends to
// `superdoc.users`. Return is `void`.
const _addSharedUserParamsOk: AssertEqual<Parameters<SuperDoc['addSharedUser']>, [user: User]> = true;
const _addSharedUserReturnOk: AssertEqual<ReturnType<SuperDoc['addSharedUser']>, void> = true;
sd.addSharedUser(realUser);

// ─── removeSharedUser ───────────────────────────────────────────────
// Removes by email match. Silent on no-match. Return is `void`.
const _removeSharedUserParamsOk: AssertEqual<Parameters<SuperDoc['removeSharedUser']>, [email: string]> = true;
const _removeSharedUserReturnOk: AssertEqual<ReturnType<SuperDoc['removeSharedUser']>, void> = true;
sd.removeSharedUser('user@example.com');

void [
  _getCommentParamsOk,
  _getCommentReturnOk,
  _commentValue,
  _setDocumentModeParamsOk,
  _setDocumentModeReturnOk,
  _addSharedUserParamsOk,
  _addSharedUserReturnOk,
  _removeSharedUserParamsOk,
  _removeSharedUserReturnOk,
];
