/**
 * Vanilla Custom UI example: bootstrap.
 *
 * The whole point of this file is to show that everything `superdoc/ui/react`
 * does on top of `createSuperDocUI` is sugar. Each domain (`toolbar.ts`,
 * `comments.ts`, `track-changes.ts`, `document.ts`) attaches its
 * subscriptions through the shared {@link Disposer} so HMR and unload
 * tear them down in lockstep.
 */

import { SuperDoc } from 'superdoc';
import { createSuperDocUI, type SuperDocUI } from 'superdoc/ui';
import 'superdoc/style.css';

import './style.css';
import { Disposer } from './bind';
import { mountToolbar } from './toolbar';
import { mountActivitySidebar } from './comments';
import { mountTrackChangesPanel } from './track-changes';
import { mountDocumentControls } from './document';

const $ = (sel: string): HTMLElement => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`[vanilla] missing element: ${sel}`);
  return el as HTMLElement;
};

const disposer = new Disposer();

// `toolbar: null` (the SuperDoc default) means the built-in toolbar is
// not rendered. We drive everything through the controller and our
// own DOM in `toolbar.ts`. `modules.comments: false` disables the
// built-in comments UI for the same reason. The React wrapper exposes
// `hideToolbar` as a single boolean; in vanilla you just don't pass a
// `toolbar` element. Logging this as a finding: the prop names diverge
// across surfaces. `superdoc/ui/vue` (and any future framework
// adapter) should rename to a single canonical option, e.g.
// `builtInToolbar: false`, and surface it consistently.
const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/sample-review.docx',
  documentMode: 'editing',
  user: { name: 'Alex Rivera', email: 'alex@example.com' },
  modules: {
    comments: false,
    trackChanges: { replacements: 'independent' },
  },
  telemetry: { enabled: false },
});

// Cast through `unknown` because `SuperDocUIOptions.superdoc` is the
// structural `SuperDocLike` shape from `superdoc/ui`, not the concrete
// `SuperDoc` class. Both shapes overlap on every method the controller
// reads, but TypeScript can't see that across the package boundary.
// Logging this as a DX finding for SD-2874: a public typed factory
// (`createSuperDocUI(superdoc)` accepting the real class) would erase
// this cast for every framework adapter, not just vanilla.
const ui: SuperDocUI = createSuperDocUI({ superdoc: superdoc as unknown as Parameters<typeof createSuperDocUI>[0]['superdoc'] });

// Wire each surface. Each mount* returns nothing; they push their
// own unsubscribes onto the shared disposer so we can tear down in
// one call. This is the lifecycle pattern hooks hide.
mountToolbar({
  toolbarEl: $('#toolbar'),
  ui,
  disposer,
  onComposeComment: () => activity.openComposer(),
});

const activity = mountActivitySidebar({
  activityEl: $('#comments-list'),
  composerMountEl: $('#composer-mount'),
  ui,
  disposer,
});

mountTrackChangesPanel({
  panelEl: $('#track-changes-list'),
  ui,
  disposer,
});

mountDocumentControls({
  toolbarEl: $('#toolbar'),
  ui,
  disposer,
});

// Lifecycle: HMR drops the old controller's subscriptions before the
// module re-evaluates. `beforeunload` covers the regular tab-close
// case. `ui.destroy()` tears down the controller's own internal
// subscriptions; `superdoc.destroy()` unmounts the editor itself.
// Both are required: `ui.destroy()` does not delegate to the host.
const teardown = () => {
  disposer.flush();
  ui.destroy();
  superdoc.destroy();
};

window.addEventListener('beforeunload', teardown);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.removeEventListener('beforeunload', teardown);
    teardown();
  });
}
