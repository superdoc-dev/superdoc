/**
 * Consumer typecheck: SuperDoc typed event map
 * (SD-3213 follow-up to the Whiteboard event map #3422).
 *
 * Before this change, `SuperDoc` extended `eventemitter3` with no event
 * map, so every `superdoc.on(name, cb)` gave consumers `(...args: any[])
 * => void`. The documentation at `apps/docs/editor/superdoc/events.mdx`
 * advertises ~15 events with specific payload shapes, but none of those
 * shapes was typed for consumers.
 *
 * The event map is **closed**: unknown event names (e.g. typos like
 * `'reayd'`) are TS errors. This is a TS-only tightening: the runtime
 * `eventemitter3` still accepts any string, so only consumers relying
 * on dynamic event names see new errors. Verified internal SuperDoc
 * code emits/subscribes only to the enumerated events.
 *
 * `exception` is typed as a union of three payload shapes the runtime
 * currently emits today; consumers narrow with `'stage' in payload` etc.
 * Normalizing the emit sites is tracked as a separate follow-up.
 *
 * `whiteboard:change` reuses the `WhiteboardData` typedef from
 * the stacked SD-3213 Whiteboard PR (#3422); this fixture verifies that
 * the integration works end-to-end through `superdoc.on('whiteboard:change', ...)`.
 */

import type { SuperDoc, Editor, User, AwarenessState, Comment, DocumentMode } from 'superdoc';

declare const superdoc: SuperDoc;

// --- Lifecycle events ------------------------------------------------------

superdoc.on('ready', ({ superdoc: instance }) => {
  const ref: SuperDoc = instance;
  void ref;
});

superdoc.on('editorBeforeCreate', ({ editor }) => {
  const ref: Editor = editor;
  void ref;
});

superdoc.on('editorCreate', ({ editor }) => {
  const ref: Editor = editor;
  void ref;
});

superdoc.on('editorDestroy', () => {
  // No payload.
});

superdoc.on('pdf:document-ready', () => {
  // No payload.
});

// --- UI events -------------------------------------------------------------

superdoc.on('sidebar-toggle', (isOpened) => {
  const flag: boolean = isOpened;
  void flag;
});

superdoc.on('zoomChange', ({ zoom, mode }) => {
  const value: number = zoom;
  // `mode` narrows to the closed manual/fit-width union.
  const zoomMode: 'manual' | 'fit-width' = mode;
  void value;
  void zoomMode;
});

superdoc.on('viewport-change', ({ availableWidth, documentWidth, fitZoom }) => {
  const available: number = availableWidth;
  const docWidth: number = documentWidth;
  const fit: number = fitZoom;
  void available;
  void docWidth;
  void fit;
});

superdoc.on('formatting-marks-change', ({ showFormattingMarks, superdoc: instance }) => {
  const flag: boolean = showFormattingMarks;
  const ref: SuperDoc = instance;
  void flag;
  void ref;
});

superdoc.on('document-mode-change', ({ documentMode }) => {
  // `documentMode` narrows to the documented closed union.
  const mode: DocumentMode = documentMode;
  void mode;
  // Negative: any other string must error.
  // @ts-expect-error SD-3213: DocumentMode is closed; only editing/viewing/suggesting.
  const bad: DocumentMode = 'reviewing';
  void bad;
});

// --- Content events --------------------------------------------------------

superdoc.on('editor-update', (payload) => {
  // Envelope is required surface/headerId/sectionType; editor and
  // sourceEditor optional (effectiveEditor may be undefined).
  const surface: string = payload.surface;
  const headerId: string | null = payload.headerId;
  const sectionType: string | null = payload.sectionType;
  const editor: Editor | undefined = payload.editor;
  const source: Editor | undefined = payload.sourceEditor;
  void surface;
  void headerId;
  void sectionType;
  void editor;
  void source;
});

superdoc.on('content-error', ({ error, editor }) => {
  // `error` is `unknown` (the runtime emit accepts arbitrary errors).
  // Consumers must narrow before reading.
  void error;
  const ref: Editor = editor;
  void ref;
});

superdoc.on('fonts-resolved', (payload) => {
  // Payload reuses the existing public `FontsResolvedPayload`.
  const documentFonts: string[] = payload.documentFonts;
  const unsupportedFonts: string[] = payload.unsupportedFonts;
  void documentFonts;
  void unsupportedFonts;
});

superdoc.on('pagination-update', ({ totalPages, superdoc: instance }) => {
  const count: number = totalPages;
  const ref: SuperDoc = instance;
  void count;
  void ref;
});

superdoc.on('list-definitions-change', (payload) => {
  // Reuses existing public `ListDefinitionsPayload`. Inner fields are
  // typed as `unknown` (intentional: deep shape is not part of the
  // public contract).
  const change: unknown = payload.change;
  void change;
});

// --- Comments events -------------------------------------------------------

superdoc.on('comments-update', (event) => {
  // `type` is `string` on the public payload; the runtime emits
  // discrete update kinds (e.g. `'created'`, `'updated'`, `'deleted'`)
  // but the type is intentionally open so consumers can match on
  // current and future kinds without recompilation.
  const type: string = event.type;
  void type;
  if (event.comment) {
    const comment: Comment = event.comment;
    const id: string = comment.commentId;
    void id;
  }
  if (event.changes) {
    for (const change of event.changes) {
      const key: string = change.key;
      const commentId: string = change.commentId;
      void key;
      void commentId;
    }
  }
});

// --- Collaboration events --------------------------------------------------

superdoc.on('collaboration-ready', ({ editor }) => {
  const ref: Editor = editor;
  void ref;
});

superdoc.on('awareness-update', ({ states, added, removed, superdoc: instance }) => {
  for (const state of states) {
    const s: AwarenessState = state;
    void s;
  }
  for (const id of added) {
    const n: number = id;
    void n;
  }
  for (const id of removed) {
    const n: number = id;
    void n;
  }
  const ref: SuperDoc = instance;
  void ref;
});

superdoc.on('locked', ({ isLocked, lockedBy }) => {
  const locked: boolean = isLocked;
  // `lockedBy` is optional; when present it can be User or null
  // (runtime initializes as `config.lockedBy || null`).
  const user: User | null | undefined = lockedBy;
  void locked;
  void user;
});

// --- Whiteboard events (re-uses WhiteboardData from #3422) -----------------

superdoc.on('whiteboard:init', ({ whiteboard }) => {
  // Whiteboard is the public class; just exercising the binding.
  void whiteboard;
});

superdoc.on('whiteboard:ready', ({ whiteboard }) => {
  void whiteboard;
});

superdoc.on('whiteboard:change', (data) => {
  // `WhiteboardData` from the stacked #3422: output shape with required
  // fields, so no optional chaining needed.
  const pages = data.pages;
  void pages;
  const meta = data.meta;
  void meta;
  const version: 1 = data.version;
  void version;
});

superdoc.on('whiteboard:enabled', (enabled) => {
  const flag: boolean = enabled;
  void flag;
});

superdoc.on('whiteboard:tool', (tool) => {
  const name: string = tool;
  void name;
});

// --- Exception (union of three current runtime shapes) ---------------------

superdoc.on('exception', (payload) => {
  // `error` is always present on every union member.
  void payload.error;

  // The store-init shape is uniquely identified by `stage`. The other
  // two shapes (restore vs editor lifecycle) overlap structurally and
  // can't be cleanly discriminated without a tag, so consumers narrow
  // with `'stage' in payload` for the store case and use `'code' in
  // payload` or `'document' in payload` for the others.
  if ('stage' in payload && payload.stage === 'document-init') {
    const stage: 'document-init' = payload.stage;
    void stage;
    void payload.document;
  }
});

// --- Closed-map negative assertion -----------------------------------------

// Unknown event names must be a TS error. If a future PR widens the map
// with an index signature (open fallback), this directive becomes unused
// and tsc fails (TS2578).
// @ts-expect-error SD-3213: SuperDocEventMap is closed; unknown events are not allowed.
superdoc.on('reayd', () => {});

// --- Host contract: real SuperDoc + narrow + broad stubs all compile -------

// `createHeadlessToolbar({ superdoc })` and `createSuperDocUI({ superdoc })`
// accept a real SuperDoc instance even after the closed event-map
// tightening. The host shapes split their `on`/`off` event-name unions
// to exactly what each controller subscribes to:
// `HeadlessToolbarSuperdocHostEvent` (4 events) for the toolbar host,
// `SuperDocUIHostEvent` (3 events) for the UI controller. SuperDoc's
// closed `SuperDocEventMap`-typed `on` satisfies both.
import { createHeadlessToolbar } from 'superdoc/headless-toolbar';
import { createSuperDocUI } from 'superdoc/ui';
void createHeadlessToolbar({ superdoc });
void createSuperDocUI({ superdoc });

// Custom UI host stub typed precisely to the 4 events the UI
// controller subscribes to must satisfy `SuperDocLike`. Pinning this
// so a future widening of `SuperDocUIHostEvent` (e.g. re-adding
// `formatting-marks-change`) doesn't silently regress this stub
// shape: such a change would fail this assertion under strict
// (property-syntax) variance, and would still be a precision loss
// even under TS method bivariance. `viewport-change` joined the set
// when `ui.zoom` started observing viewport metrics (SD-3294).
declare const customUIHost: {
  on?(
    event: 'editorCreate' | 'document-mode-change' | 'zoomChange' | 'viewport-change',
    handler: (...args: unknown[]) => void,
  ): unknown;
  off?(
    event: 'editorCreate' | 'document-mode-change' | 'zoomChange' | 'viewport-change',
    handler: (...args: unknown[]) => void,
  ): unknown;
};
void createSuperDocUI({ superdoc: customUIHost });

// Custom toolbar host stub typed precisely to the 4 events the
// toolbar subscribes to must satisfy `HeadlessToolbarSuperdocHost`.
declare const customToolbarHost: {
  on?: (
    event: 'editorCreate' | 'document-mode-change' | 'formatting-marks-change' | 'zoomChange',
    listener: (...args: any[]) => void,
  ) => void;
  off?: (
    event: 'editorCreate' | 'document-mode-change' | 'formatting-marks-change' | 'zoomChange',
    listener: (...args: any[]) => void,
  ) => void;
};
void createHeadlessToolbar({ superdoc: customToolbarHost });

// Broad string-based custom stubs remain assignable to both host
// contracts: a function that accepts any string can be called with
// the specific event names the host will pass.
declare const broadHost: {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  off?: (event: string, listener: (...args: unknown[]) => void) => void;
};
void createHeadlessToolbar({ superdoc: broadHost });
void createSuperDocUI({ superdoc: broadHost });
