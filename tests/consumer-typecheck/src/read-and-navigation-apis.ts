/**
 * Consumer typecheck: read + navigation public APIs on `SuperDoc`.
 *
 * Drains the first batch of obligations from the public-method coverage
 * gate (PR #3481). Each assertion locks the parameter or return shape
 * of a method that exists on the supported root surface, so a future
 * migration cannot quietly narrow or widen the contract without CI
 * failing on the obligation diff.
 *
 * Methods covered here:
 *   - `getHTML(options?)` → `string[]`
 *   - `getZoom()` → `number`
 *   - `navigateTo(target)` → `Promise<boolean>`
 *   - `scrollToElement(elementId)` → `Promise<boolean>`
 *   - `goToSearchResult(match)` → `boolean | undefined`
 *
 * `goToSearchResult.parameters` is already locked in `search-match.ts`;
 * this file adds the `returns` assertion for the same method.
 */
import type { NavigableAddress, SuperDoc } from 'superdoc';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertEqual<A, B> = Equal<A, B> extends true ? true : never;

declare const sd: SuperDoc;

// ─── getHTML ─────────────────────────────────────────────────────────
// Returns the HTML string for every editor in document order. Options
// are forwarded to `editor.getHTML(options)` on each editor, so the
// public option shape matches the underlying Editor method:
// `{ unflattenLists?: boolean }`. The source signature was tightened
// in this PR to forward that shape explicitly via
// `Parameters<Editor['getHTML']>[0]`; the assertion below locks it.
const _htmlParamsOk: AssertEqual<Parameters<SuperDoc['getHTML']>, [{ unflattenLists?: boolean }?]> = true;
const _htmlReturnOk: AssertEqual<ReturnType<SuperDoc['getHTML']>, string[]> = true;
const _htmlValue: string[] = sd.getHTML();
const _htmlValueWithOpts: string[] = sd.getHTML({ unflattenLists: true });

// ─── getZoom ─────────────────────────────────────────────────────────
// Returns the active zoom percentage. Per JSDoc: 100 by default.
const _zoomReturnOk: AssertEqual<ReturnType<SuperDoc['getZoom']>, number> = true;
const _zoomValue: number = sd.getZoom();

// ─── navigateTo ──────────────────────────────────────────────────────
// Async navigation to a stable address (bookmark, block, comment,
// tracked change). Resolves true iff the address was found and
// navigated to. Type-only `import` of `NavigableAddress` is enough; no
// runtime construction.
const _navigateParamsOk: AssertEqual<Parameters<SuperDoc['navigateTo']>, [NavigableAddress]> = true;
const _navigateReturnOk: AssertEqual<ReturnType<SuperDoc['navigateTo']>, Promise<boolean>> = true;

// ─── scrollToElement ─────────────────────────────────────────────────
// Async scroll to a paragraph nodeId or comment entityId. Same
// boolean-resolution contract as navigateTo.
const _scrollParamsOk: AssertEqual<Parameters<SuperDoc['scrollToElement']>, [string]> = true;
const _scrollReturnOk: AssertEqual<ReturnType<SuperDoc['scrollToElement']>, Promise<boolean>> = true;

// ─── goToSearchResult (returns) ──────────────────────────────────────
// Param shape is locked in search-match.ts; this file pins the return
// shape so consumers know they need to handle the `undefined` case
// when no active editor exists.
const _gotoSearchReturnOk: AssertEqual<ReturnType<SuperDoc['goToSearchResult']>, boolean | undefined> = true;

void [
  _htmlParamsOk,
  _htmlReturnOk,
  _htmlValue,
  _htmlValueWithOpts,
  _zoomReturnOk,
  _zoomValue,
  _navigateParamsOk,
  _navigateReturnOk,
  _scrollParamsOk,
  _scrollReturnOk,
  _gotoSearchReturnOk,
];

// Suppress unused-import warning for the type-only navigation address;
// the fixture references it only as a type argument above.
export type _NavigableAddressUsage = NavigableAddress;
