/**
 * Consumer typecheck: Document API surface (SD-673 Phase 3).
 *
 * Proves a customer-style TypeScript project can:
 *
 * 1. Import the public `DocumentApi` type from `superdoc`.
 * 2. Call representative operations (`find`, `query.match`, `insert`,
 *    `format.apply`, `contentControls.*`, `comments.create`,
 *    `capabilities()`, `metadata.*`) and consume the returned shapes
 *    via real typed fields (not `any`).
 * 3. Have TypeScript reject bad input shapes via `@ts-expect-error`.
 *
 * Scope:
 * - The fixture is structural / type-level only. The `doc` value is
 *   `declare const`ed so no runtime is involved; this exists for
 *   `tsc --noEmit`.
 * - Coverage is representative, not exhaustive. The Document API has
 *   403 operations; this fixture pins ~10 high-traffic call shapes
 *   that customers exercise most.
 * - Inputs / outputs are pinned via `Parameters<...>[0]` and
 *   `ReturnType<...>` instead of named imports. That validates the
 *   `DocumentApi` member typing without depending on every sub-type
 *   being separately re-exported.
 *
 * Out of scope:
 * - The access path from `superdoc` runtime instance to `editor.doc`
 *   is a separate concern (currently requires a cast in many code
 *   paths because `Editor.doc` is not statically typed on the Editor
 *   class; `PresentationEditor.doc` is). This fixture validates the
 *   `DocumentApi` shape, which is what consumers care about once they
 *   have a handle.
 */

import type { DocumentApi, TextAddress, TextTarget, TextSegment } from 'superdoc';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// Typed handle — no runtime; pure type-level validation.
declare const doc: DocumentApi;

// =========================================================================
// 1. capabilities()
// =========================================================================

// `CapabilitiesApi` is a callable. Both `capabilities()` and
// `capabilities.get()` must return the same shape and that shape must
// not collapse to `any`.
const caps = doc.capabilities();
const capsViaGet = doc.capabilities.get();
const _capsNotAny: Equal<typeof caps, any> = false;
const _capsGetSameShape: Equal<typeof caps, typeof capsViaGet> = true;
void _capsNotAny;
void _capsGetSameShape;

// =========================================================================
// 2. find / query.match
// =========================================================================

// `find` accepts a typed input shape and returns typed items.
const findResult = doc.find({
  select: { type: 'text', pattern: 'ACME Corp' },
});
const _findResultNotAny: Equal<typeof findResult, any> = false;
void _findResultNotAny;

// items is iterable and each item exposes `address` typed (not any).
if (findResult.items[0]) {
  type FindItem = (typeof findResult.items)[number];
  const _itemNotAny: Equal<FindItem, any> = false;
  void _itemNotAny;
  const _itemHasAddress: FindItem extends { address: unknown } ? true : false = true;
  void _itemHasAddress;
}

// `query.match` accepts the canonical nested input.
const queryMatch = doc.query.match({
  select: { type: 'text', pattern: 'ACME Corp' },
  require: 'first',
});
const _queryMatchNotAny: Equal<typeof queryMatch, any> = false;
void _queryMatchNotAny;
// Returned items expose a target consumers can pass to mutations.
if (queryMatch.items?.[0]) {
  type QueryItem = NonNullable<(typeof queryMatch.items)[number]>;
  const _qItemNotAny: Equal<QueryItem, any> = false;
  void _qItemNotAny;
}

// =========================================================================
// 3. insert
// =========================================================================

// Insert with a text value at end-of-document (no target).
const insertReceipt = doc.insert({ value: 'new content' });
const _insertReceiptNotAny: Equal<typeof insertReceipt, any> = false;
void _insertReceiptNotAny;

// Insert with options (tracked mode).
doc.insert({ value: 'tracked content' }, { changeMode: 'tracked' });

// Receipts expose `success` boolean (typed, not any).
type InsertReceipt = ReturnType<DocumentApi['insert']>;
const _insertHasSuccess: InsertReceipt extends { success: boolean } ? true : false = true;
void _insertHasSuccess;

// =========================================================================
// 4. format.apply
// =========================================================================

// `format.apply` takes a SelectionTarget (start/end anchors), not a
// TextTarget (segments). The input shape is inferred from the
// DocumentApi member.
type FormatApplyInput = Parameters<DocumentApi['format']['apply']>[0];
const formatInput: FormatApplyInput = {
  target: {
    kind: 'selection',
    start: { kind: 'text', blockId: 'p1', offset: 0 },
    end: { kind: 'text', blockId: 'p1', offset: 5 },
  },
  inline: { bold: true },
};
const formatReceipt = doc.format.apply(formatInput);
const _formatReceiptNotAny: Equal<typeof formatReceipt, any> = false;
void _formatReceiptNotAny;

// =========================================================================
// 5. contentControls.*
// =========================================================================

// `selectByTag` returns typed items.
const ccSelect = doc.contentControls.selectByTag({ tag: 'customer' });
const _ccSelectNotAny: Equal<typeof ccSelect, any> = false;
void _ccSelectNotAny;
// Result has an items array (or similar collection); proven by not-any
// on the items element type when accessed.
if (ccSelect.items?.[0]) {
  type CCItem = NonNullable<(typeof ccSelect.items)[number]>;
  const _ccItemNotAny: Equal<CCItem, any> = false;
  void _ccItemNotAny;
}

// =========================================================================
// 6. comments.create — accepts TextTarget directly
// =========================================================================

const commentTarget: TextTarget = {
  kind: 'text',
  segments: [{ blockId: 'p1', range: { start: 0, end: 5 } }],
};
const commentCreate = doc.comments.create({
  text: 'Review this section.',
  target: commentTarget,
});
const _commentCreateNotAny: Equal<typeof commentCreate, any> = false;
void _commentCreateNotAny;

// Also accepts TextAddress for the legacy/insertion-point style.
const commentAddress: TextAddress = {
  kind: 'text',
  blockId: 'p1',
  range: { start: 0, end: 5 },
};
doc.comments.create({ text: 'Another', target: commentAddress });

// =========================================================================
// 7. metadata.* (anchored metadata)
// =========================================================================

// `list` accepts optional filter input and returns typed entries.
const metaList = doc.metadata.list({});
const _metaListNotAny: Equal<typeof metaList, any> = false;
void _metaListNotAny;

// `get` returns nullable info.
const metaGet = doc.metadata.get({ id: 'meta-1' });
const _metaGetNotAny: Equal<typeof metaGet, any> = false;
void _metaGetNotAny;
// nullable in the return union (the JSDoc says "or null if not found").
type MetaGetReturn = ReturnType<DocumentApi['metadata']['get']>;
const _metaGetHandlesNull: null extends MetaGetReturn ? true : false = true;
void _metaGetHandlesNull;

// =========================================================================
// 8. invoke<T> — typed dispatch narrows by operationId
// =========================================================================

// Concrete calls: the typed overload must narrow `invoke({ operationId,
// ... })` to the same return type as a direct member call.
// `ReturnType<DocumentApi['invoke']>` alone is not enough — TS resolves
// `ReturnType` on overloads to the LAST overload's return (here
// `unknown` from the dynamic-dispatch signature), so a regression that
// removed the typed overload would still leave that assertion passing.
// The concrete-call equality checks below actually exercise the typed
// overload; if it disappears, these fail.
//
// `operationId` is held as the literal (not widened to `string`) so the
// generic infers `T extends OperationId` correctly.
//
// Both branches of `InvokeRequest<T>` are covered: operations with no
// options (`find`, registry `options: never`) and operations with
// options (`insert`, registry `options: MutationOptions`). A regression
// in either branch — e.g. reintroducing the `Record<string, never>`
// intersection that previously made the no-options branch unmatchable —
// will fail one of these equality checks.

// No-options branch: `find`.
declare const findInvokeRequest: {
  operationId: 'find';
  input: Parameters<DocumentApi['find']>[0];
};
const invokeFindResult = doc.invoke(findInvokeRequest);
const _invokeFindNarrows: Equal<typeof invokeFindResult, ReturnType<DocumentApi['find']>> = true;
void _invokeFindNarrows;

// With-options branch: `insert`.
declare const insertInvokeRequest: {
  operationId: 'insert';
  input: Parameters<DocumentApi['insert']>[0];
  options: NonNullable<Parameters<DocumentApi['insert']>[1]>;
};
const invokeInsertResult = doc.invoke(insertInvokeRequest);
const _invokeInsertNarrows: Equal<typeof invokeInsertResult, ReturnType<DocumentApi['insert']>> = true;
void _invokeInsertNarrows;

// =========================================================================
// Negative assertions — bad inputs must be rejected
// =========================================================================

// @ts-expect-error SD-673 Phase 3: `find` requires a `select` input, not a bare string.
doc.find('ACME Corp');

// @ts-expect-error SD-673 Phase 3: `select.type` must be a known selector kind, not arbitrary string.
doc.find({ select: { type: 'bogus-selector-kind' } });

// @ts-expect-error SD-673 Phase 3: `require` accepts only specific cardinality literals.
doc.query.match({ select: { type: 'text', pattern: 'foo' }, require: 'bogus-cardinality' });

// @ts-expect-error SD-673 Phase 3: `insert` requires an `InsertInput`, not a bare string.
doc.insert('hello');

// @ts-expect-error SD-673 Phase 3: `changeMode` accepts only 'direct' | 'tracked'.
doc.insert({ value: 'x' }, { changeMode: 'bogus-mode' });

// @ts-expect-error SD-673 Phase 3: `format.apply` requires a target and inline object.
doc.format.apply({});

// @ts-expect-error SD-673 Phase 3: `comments.create` requires a `text` field.
doc.comments.create({ target: commentTarget });

// @ts-expect-error SD-673 Phase 3: `metadata.get` requires an `id`.
doc.metadata.get({});

// @ts-expect-error SD-673 Phase 3: TextSegment requires both blockId and range.
const _badSegment: TextSegment = { blockId: 'p1' };
