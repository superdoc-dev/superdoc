/**
 * `superdoc/ui/react` — official React bindings for the
 * `createSuperDocUI` controller.
 *
 * Ships the provider, the lifecycle-correct context, and a typed
 * subscription helper. Domain-specific convenience hooks (selection,
 * comments, track changes, toolbar, per-command) are sugar on top of
 * `useSuperDocSlice` so consumers don't repeat the same `useEffect +
 * setState + cleanup` boilerplate per slice.
 *
 * ```tsx
 * import {
 *   SuperDocUIProvider,
 *   useSuperDocUI,
 *   useSuperDocSelection,
 *   useSuperDocComments,
 *   useSuperDocTrackChanges,
 *   useSuperDocToolbar,
 *   useSuperDocCommand,
 *   useSuperDocFontOptions,
 * } from 'superdoc/ui/react';
 * ```
 */

export {
  SuperDocUIProvider,
  useSuperDocUI,
  useSuperDocHost,
  useSetSuperDoc,
  useSuperDocSlice,
  type SuperDocHost,
} from './provider.js';

export {
  useSuperDocSelection,
  useSuperDocComments,
  useSuperDocContentControls,
  useSuperDocTrackChanges,
  useSuperDocToolbar,
  useSuperDocCommand,
  useSuperDocDocument,
  useSuperDocFontOptions,
  useSuperDocZoom,
} from './hooks.js';
