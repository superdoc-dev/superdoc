/**
 * Consumer typecheck: `SuperDoc.search()` returns `SearchMatch[] | undefined`,
 * and `SuperDoc.goToSearchResult()` accepts `SearchMatch` (SD-2828).
 *
 * Before this contract was published, both APIs typed the match value as
 * `Object` / `Object[]`, so consumers wiring a custom search UI lost field
 * types on `id`, `from`, `to`, `text`. This fixture pins the shape: each
 * field is read off a real match, and the same value is passed back into
 * `goToSearchResult` to prove the round-trip type compatibility.
 *
 * If a future change re-narrows or strips any of the listed fields, the
 * destructuring or the `goToSearchResult` call below stops compiling and
 * CI fails.
 */
import type { SearchMatch, SuperDoc } from 'superdoc';

declare const sd: SuperDoc;

const results: SearchMatch[] | undefined = sd.search('hello');
// `search` also accepts a RegExp at runtime; the type must include it.
// Regression guard: a TS-only narrowing to `string` (e.g. during a JS→TS
// migration of SuperDoc) would silently break this call until consumer
// upgrade-time. SD-typecheck-superdoc-ts.
sd.search(/hello/i);

if (results && results.length > 0) {
  const first: SearchMatch = results[0];

  // Each public field must be a real type, not `any`.
  const id: string = first.id;
  const from: number = first.from;
  const to: number = first.to;
  const text: string = first.text;

  // Pass the match back through `goToSearchResult` unchanged.
  sd.goToSearchResult(first);

  void [id, from, to, text];
}

// Strict type-equality: a future change that re-narrows the return type
// (e.g. to `unknown[]` or a more specific subtype) would still be assignable
// to `SearchMatch[] | undefined` from one direction; `Equal` fails the
// fixture if the type drifts in either direction.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertEqual<A, B> = Equal<A, B> extends true ? true : never;

const _searchReturnTypeIsExact: AssertEqual<ReturnType<SuperDoc['search']>, SearchMatch[] | undefined> = true;
const _searchParamTypeIsExact: AssertEqual<Parameters<SuperDoc['search']>[0], string | RegExp> = true;
const _goToParamTypeIsExact: AssertEqual<Parameters<SuperDoc['goToSearchResult']>[0], SearchMatch> = true;

void [_searchReturnTypeIsExact, _searchParamTypeIsExact, _goToParamTypeIsExact, results];
