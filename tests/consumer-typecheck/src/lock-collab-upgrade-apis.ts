/**
 * Consumer typecheck: locking and collaboration-upgrade public APIs
 * on `SuperDoc`.
 *
 * Locks parameters and returns for `setLocked`, `lockSuperdoc`, and
 * `upgradeToCollaboration` against the emitted `.d.ts` with strict
 * identity equality.
 *
 * Three source tightenings landed alongside this fixture:
 *
 *   - `setLocked`, `lockSuperdoc`: added explicit `: void` return
 *     types. The emit was already void; the explicit annotation makes
 *     the source contract match the emit at a glance.
 *
 *   - `upgradeToCollaboration`: added explicit `: Promise<void>`
 *     return type. Same reasoning - the async function already
 *     resolved to void.
 *
 *   - `lockSuperdoc` JSDoc previously documented only `lockedBy` (and
 *     called it `User`, dropping the runtime-accepted `null` half).
 *     Rewrote to document both `isLocked` and `lockedBy: User | null`,
 *     including the `null` default. The runtime has always emitted
 *     `lockedBy: User | null` through the `locked` event; this PR only
 *     aligns the doc with that reality.
 *
 * Removes 6 debt entries (snapshot 7 -> 1, total tracked obligations
 * 75 -> 72). The parameter obligations are satisfied by `Parameters<>`
 * assertions below; the three `:returns` obligations drop out of the
 * gate's tracking because the source now declares `void` / `Promise<void>`
 * explicitly (gate's `returnsMeaningful` check treats explicit
 * void-likes as non-obligation). The fixture still asserts
 * `ReturnType<>` for each so the return shape stays locked the same
 * way the parameters are.
 */
import type { SuperDoc, UpgradeToCollaborationOptions, User } from 'superdoc';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertEqual<A, B> = Equal<A, B> extends true ? true : never;

declare const sd: SuperDoc;
declare const upgradeOpts: UpgradeToCollaborationOptions;
declare const realUser: User;

// ─── setLocked ──────────────────────────────────────────────────────
// Writes `locked` and `lockedBy` into each document's Yjs meta map.
// Default parameter `lock = true` means the emit is `(lock?: boolean)`.
const _setLockedParamsOk: AssertEqual<Parameters<SuperDoc['setLocked']>, [lock?: boolean]> = true;
const _setLockedReturnOk: AssertEqual<ReturnType<SuperDoc['setLocked']>, void> = true;
sd.setLocked(true);
sd.setLocked();

// ─── lockSuperdoc ───────────────────────────────────────────────────
// Sets `isLocked` / `lockedBy` on the instance and emits `locked`.
// `lockedBy` is `User | null` to match the runtime: unlocking (or
// locking without a known user) passes null.
const _lockSuperdocParamsOk: AssertEqual<
  Parameters<SuperDoc['lockSuperdoc']>,
  [isLocked?: boolean, lockedBy?: User | null]
> = true;
const _lockSuperdocReturnOk: AssertEqual<ReturnType<SuperDoc['lockSuperdoc']>, void> = true;
sd.lockSuperdoc(true, realUser);
sd.lockSuperdoc(false, null);
sd.lockSuperdoc();

// ─── upgradeToCollaboration ─────────────────────────────────────────
// Destructive promotion: overwrites the target collab room with the
// caller's local state. Limited to single-DOCX + external
// `{ ydoc, provider }` collaboration (see source for full constraints).
const _upgradeParamsOk: AssertEqual<
  Parameters<SuperDoc['upgradeToCollaboration']>,
  [options: UpgradeToCollaborationOptions]
> = true;
const _upgradeReturnOk: AssertEqual<ReturnType<SuperDoc['upgradeToCollaboration']>, Promise<void>> = true;
const _upgraded: Promise<void> = sd.upgradeToCollaboration(upgradeOpts);
void _upgraded;

void [
  _setLockedParamsOk,
  _setLockedReturnOk,
  _lockSuperdocParamsOk,
  _lockSuperdocReturnOk,
  _upgradeParamsOk,
  _upgradeReturnOk,
];
