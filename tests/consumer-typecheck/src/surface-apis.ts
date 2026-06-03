/**
 * Consumer typecheck: surface public APIs on `SuperDoc`.
 *
 * Locks the `openSurface` and `closeSurface` contracts (parameters
 * and returns) against the emitted `.d.ts` with strict identity
 * equality. A future migration that narrows or widens either signature
 * will fail the obligation diff rather than slipping past CI.
 *
 * `openSurface` is generic: `openSurface<TResult = unknown>(request)`.
 * `ReturnType<SuperDoc['openSurface']>` applies the `TResult = unknown`
 * default, so the locked return is `SurfaceHandle<unknown>`. Callers
 * that bind an explicit `TResult` get `SurfaceHandle<TResult>` at the
 * call site; this fixture asserts the default-instantiated shape on
 * the bare method type, which is what `Parameters` / `ReturnType`
 * actually see.
 *
 * Drained obligations (4):
 *   - openSurface:parameters / openSurface:returns
 *   - closeSurface:parameters / closeSurface:returns
 */
import type { SuperDoc, SurfaceHandle, SurfaceRequest } from 'superdoc';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertEqual<A, B> = Equal<A, B> extends true ? true : never;

declare const sd: SuperDoc;
declare const request: SurfaceRequest;

// ─── openSurface ────────────────────────────────────────────────────
// Forwards to SurfaceManager.open. Generic on TResult (default
// `unknown`); the returned handle's `result` promise resolves with a
// SurfaceOutcome carrying that TResult.
const _openSurfaceParamsOk: AssertEqual<Parameters<SuperDoc['openSurface']>, [request: SurfaceRequest]> = true;
const _openSurfaceReturnOk: AssertEqual<ReturnType<SuperDoc['openSurface']>, SurfaceHandle<unknown>> = true;
const _openSurfaceHandle: SurfaceHandle<unknown> = sd.openSurface(request);
void _openSurfaceHandle;

// Lock the generic at the call site. A future refactor that drops
// `<TResult>` (e.g. inlining the default) would still satisfy the
// Parameters / ReturnType assertions above, since utility-type
// extraction sees the default-instantiated shape. This explicit
// binding fails to compile if `TResult` stops flowing into the
// returned `SurfaceHandle<TResult>`.
const _typedSurfaceHandle: SurfaceHandle<{ accepted: true }> = sd.openSurface<{ accepted: true }>(request);
void _typedSurfaceHandle;

// ─── closeSurface ───────────────────────────────────────────────────
// Closes a surface by id, or the topmost surface when `id` is
// omitted. Forwards to SurfaceManager.close.
const _closeSurfaceParamsOk: AssertEqual<Parameters<SuperDoc['closeSurface']>, [id?: string]> = true;
const _closeSurfaceReturnOk: AssertEqual<ReturnType<SuperDoc['closeSurface']>, void> = true;
sd.closeSurface();
sd.closeSurface('surface-id');

void [_openSurfaceParamsOk, _openSurfaceReturnOk, _closeSurfaceParamsOk, _closeSurfaceReturnOk];
