/**
 * Consumer typecheck: SuperDoc `Config` callback payload shapes.
 *
 * Locks the corrected callback contracts against the emitted `.d.ts`
 * with strict identity equality. Each assertion proves the named
 * public payload type is what `Config.onX` receives, not an inline
 * literal or a stale shape that drifted from the runtime emit.
 *
 * Why these assertions exist: the `Config.onX` callbacks register
 * through an `EventEmitter` bridge. Before the typed bridge work,
 * that bridge cast through `any`, which silently allowed several
 * mismatches between `Config.onX` and `SuperDocEventMap[event]`:
 *
 *   - `onLocked` declared `lockedBy: User`; runtime emits
 *     `lockedBy: User | null` (lockSuperdoc defaults lockedBy to null).
 *   - `onEditorCreate` / `onEditorBeforeCreate` declared
 *     `(editor: Editor)`; runtime emits `(payload: { editor: Editor })`.
 *   - `onCommentsUpdate` declared `{ type, data: object }`; runtime
 *     emits `{ type, comment?, changes? }` (never a `data` field).
 *   - `onAwarenessUpdate` declared `{ context, states }`; runtime
 *     emits `{ states, added, removed, superdoc }`.
 *   - `onListDefinitionsChange` declared `(params: {})`; runtime
 *     emits a typed `ListDefinitionsPayload`.
 *   - `onReady` declared its parameter as `editor` while the type
 *     was `{ superdoc: SuperDoc }`; parameter renamed to `params`
 *     and typed against the named payload.
 *
 * The typed `#onConfig<K>(event, listener)` bridge in SuperDoc
 * catches event/callback drift at registration sites. This fixture
 * locks exact emitted consumer shapes, including the cases the bridge
 * does not catch on its own: broad types like `{}` are contravariantly
 * assignable to any narrower payload, so the bridge accepted
 * `Config.onListDefinitionsChange?: (params: {}) => void` even
 * though the runtime emits a typed `ListDefinitionsPayload`. The
 * AssertEqual against the exported payload type is what surfaces
 * that class of mismatch.
 */
import type {
  Config,
  ContentControlActiveChangePayload,
  ContentControlClickPayload,
  EditorUpdateEvent,
  ListDefinitionsPayload,
  SuperDocAwarenessUpdatePayload,
  SuperDocCommentsUpdatePayload,
  SuperDocEditorPayload,
  SuperDocLockedPayload,
  SuperDocReadyPayload,
  SuperDocViewportChangePayload,
  SuperDocZoomPayload,
} from 'superdoc';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertEqual<A, B> = Equal<A, B> extends true ? true : never;

// Extract the first parameter type of an optional callback. F is
// constrained so `NonNullable<F>` actually resolves to a function and
// `Parameters<...>` can extract from it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ParamOf<F extends ((...args: any) => any) | undefined> = Parameters<NonNullable<F>>[0];

// ─── onReady ────────────────────────────────────────────────────────
const _onReadyOk: AssertEqual<ParamOf<Config['onReady']>, SuperDocReadyPayload> = true;

// ─── onEditorBeforeCreate / onEditorCreate ──────────────────────────
// Both receive the wrapper `{ editor: Editor }`, not a bare Editor.
const _onEditorBeforeCreateOk: AssertEqual<ParamOf<Config['onEditorBeforeCreate']>, SuperDocEditorPayload> = true;
const _onEditorCreateOk: AssertEqual<ParamOf<Config['onEditorCreate']>, SuperDocEditorPayload> = true;
const _onCollaborationReadyOk: AssertEqual<ParamOf<Config['onCollaborationReady']>, SuperDocEditorPayload> = true;

// ─── onLocked ───────────────────────────────────────────────────────
// lockedBy is `User | null` (non-optional) - runtime always emits the
// key, value may be null on unlock or unattributed locks.
const _onLockedOk: AssertEqual<ParamOf<Config['onLocked']>, SuperDocLockedPayload> = true;

// ─── onCommentsUpdate ───────────────────────────────────────────────
const _onCommentsUpdateOk: AssertEqual<ParamOf<Config['onCommentsUpdate']>, SuperDocCommentsUpdatePayload> = true;

// ─── onContentControlActiveChange / onContentControlClick ───────────
// The public payload types must match what the Config callbacks receive
// (and be importable by name from 'superdoc').
const _onContentControlActiveChangeOk: AssertEqual<
  ParamOf<Config['onContentControlActiveChange']>,
  ContentControlActiveChangePayload
> = true;
const _onContentControlClickOk: AssertEqual<
  ParamOf<Config['onContentControlClick']>,
  ContentControlClickPayload
> = true;

// ─── onAwarenessUpdate ──────────────────────────────────────────────
// Field set is `{ states, added, removed, superdoc }` - NOT `context`.
const _onAwarenessUpdateOk: AssertEqual<ParamOf<Config['onAwarenessUpdate']>, SuperDocAwarenessUpdatePayload> = true;

// ─── onListDefinitionsChange ────────────────────────────────────────
const _onListDefinitionsChangeOk: AssertEqual<
  ParamOf<Config['onListDefinitionsChange']>,
  ListDefinitionsPayload
> = true;

// ─── onEditorUpdate ─────────────────────────────────────────────────
// EditorUpdateEvent was reconciled in this PR: editor / sourceEditor
// became optional (runtime can produce undefined when both are
// missing), headerId / sectionType became required `string | null`
// (runtime payload builder always sets them, defaulting to null).
const _onEditorUpdateOk: AssertEqual<ParamOf<Config['onEditorUpdate']>, EditorUpdateEvent> = true;

// ─── onZoomChange ───────────────────────────────────────────────────
// Fires for every zoom source: setZoom(), toolbar, fit-width mode.
const _onZoomChangeOk: AssertEqual<ParamOf<Config['onZoomChange']>, SuperDocZoomPayload> = true;

// ─── onViewportChange ───────────────────────────────────────────────
// Pure measurements: fit policy options (min/max/padding) never affect them.
const _onViewportChangeOk: AssertEqual<ParamOf<Config['onViewportChange']>, SuperDocViewportChangePayload> = true;

void [
  _onReadyOk,
  _onEditorBeforeCreateOk,
  _onEditorCreateOk,
  _onCollaborationReadyOk,
  _onLockedOk,
  _onCommentsUpdateOk,
  _onAwarenessUpdateOk,
  _onListDefinitionsChangeOk,
  _onEditorUpdateOk,
  _onZoomChangeOk,
  _onViewportChangeOk,
];
