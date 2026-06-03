/**
 * Consumer typecheck: SuperDoc's internal Pinia stores must not appear
 * on the public TypeScript surface (SD-3213f).
 *
 * `superdoc.superdocStore`, `superdoc.commentsStore`, and
 * `superdoc.highContrastModeStore` are internal Vue/Pinia runtime
 * references. Earlier versions of the published `SuperDoc.d.ts` exposed
 * them as public properties, which leaked the full Pinia store type
 * graph into the public surface and collapsed consumer IntelliSense to
 * `any` at every depth that reached through them. This fixture pins the
 * SD-3213f decision: those three fields are `@private` on `SuperDoc.js`,
 * so a strict consumer importing `SuperDoc` from `superdoc` must not be
 * able to access them.
 *
 * This is a TypeScript-surface hide, not runtime privacy. The fields
 * still exist on the runtime instance and internal package callers
 * keep working. Consumers can no longer reach into them via `.d.ts`.
 *
 * Positive checks below also pin that the documented host-accepting
 * factories `createHeadlessToolbar({ superdoc })` and
 * `createSuperDocUI({ superdoc })` continue to compile with a
 * `SuperDoc` instance after the hide. They compile because SD-3213f
 * also refactored `HeadlessToolbarSuperdocHost`: the raw
 * `superdocStore?` field was removed and replaced with two narrow
 * optional methods (`getPresentationEditorForDocument`, `getComment`)
 * that SuperDoc now implements directly. The internal
 * `resolveToolbarSources` keeps a `superdocStore?` legacy fallback for
 * custom host stubs that pre-date the narrow methods; cleanup of the
 * remaining `as never` casts in `create-super-doc-ui.ts` is tracked
 * separately as SD-3213g.
 */

import { SuperDoc } from 'superdoc';
import { createHeadlessToolbar } from 'superdoc/headless-toolbar';
import { createSuperDocUI } from 'superdoc/ui';

declare const superdoc: SuperDoc;

// --- Negative assertions ---------------------------------------------------
// Internal Pinia stores must not appear on the public SuperDoc surface.
// If a future change reintroduces them as public properties, the
// `@ts-expect-error` directive stops erroring (TS2578) and tsc fails.

// @ts-expect-error superdocStore is internal (SD-3213f); not part of the
// public TypeScript surface.
void superdoc.superdocStore;

// @ts-expect-error commentsStore is internal (SD-3213f); not part of the
// public TypeScript surface.
void superdoc.commentsStore;

// @ts-expect-error highContrastModeStore is internal (SD-3213f); not part
// of the public TypeScript surface.
void superdoc.highContrastModeStore;

// @ts-expect-error commentsList is the internal SuperComments mount
// handle (SD-3213); not part of the public TypeScript surface.
void superdoc.commentsList;

// @ts-expect-error app is the internal Vue app handle (SD-3213);
// not part of the public TypeScript surface. The documented public
// surface is `superdoc.toolbar` (the SuperToolbar wrapper), not
// `superdoc.app`.
void superdoc.app;

// @ts-expect-error toolbar.toolbar is the internal Vue
// ComponentPublicInstance mounted by SuperToolbar (SD-3213); the
// documented public surface is `superdoc.toolbar` itself. The
// nested `.toolbar` field is internal mount state.
void superdoc.toolbar.toolbar;

// Positive: `superdoc.toolbar` (the SuperToolbar class instance)
// remains accessible: it is the documented public surface
// (`apps/docs/editor/built-in-ui/toolbar.mdx` shows multiple
// `const toolbar = superdoc.toolbar` examples).
void superdoc.toolbar;

// --- Positive assertions ---------------------------------------------------
// Documented factories accepting a SuperDoc instance must continue to
// compile after the hide. These compile because SuperDoc now exposes the
// narrow host methods (`getPresentationEditorForDocument`, `getComment`)
// that replaced `HeadlessToolbarSuperdocHost.superdocStore?` in SD-3213f.

const _toolbarController = createHeadlessToolbar({ superdoc });
const _superDocUI = createSuperDocUI({ superdoc });

void _toolbarController;
void _superDocUI;

// --- Backward-compat: legacy inline host with `superdocStore` ----------------
// Pre-SD-3213f typed custom host stubs passed an inline object literal
// that included a typed `superdocStore.documents[]`. The SD-3213f host
// type is a union with a deprecated legacy branch so those stubs keep
// compiling without `any` casts. Without the union branch, TS would
// reject this object literal under excess-property checks at the
// `createHeadlessToolbar` call site.
const _legacyToolbarController = createHeadlessToolbar({
  superdoc: {
    activeEditor: null,
    superdocStore: {
      documents: [
        {
          getEditor: () => null,
          getPresentationEditor: () => null,
        },
      ],
    },
  },
});
void _legacyToolbarController;
