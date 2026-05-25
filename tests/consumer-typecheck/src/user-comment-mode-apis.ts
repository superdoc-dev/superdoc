/**
 * Consumer typecheck: comment + mode public APIs on `SuperDoc`.
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
 *
 * `setDocumentMode` has no declared return type in source; TS infers
 * `void`, which the emitted `.d.ts` ships. The `void` assertion is
 * deliberate: it forces a future tightening that introduces a real
 * return value (e.g. `boolean`) to land as an intentional contract
 * change.
 *
 * `addSharedUser` / `removeSharedUser` obligations are intentionally
 * deferred (still on the debt snapshot). Their parameter and return
 * types reference a different `User` interface than the one
 * `superdoc` re-exports publicly: the methods accept the internal
 * `User` from `packages/superdoc/src/core/types/index.ts`, while
 * `import { User } from 'superdoc'` resolves to the super-editor
 * `User` re-exported via `src/public/index.ts`. Strict `AssertEqual<>`
 * fails on this identity mismatch even though the shapes are
 * structurally similar. The right fix is upstream — unify the two
 * User types so the public consumer surface and the method signature
 * match — not loosen the fixture assertion class. Tracked as a
 * separate follow-up.
 */
import type { DocumentMode, SuperDoc } from 'superdoc';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertEqual<A, B> = Equal<A, B> extends true ? true : never;

declare const sd: SuperDoc;

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

void [_getCommentParamsOk, _getCommentReturnOk, _commentValue, _setDocumentModeParamsOk, _setDocumentModeReturnOk];
