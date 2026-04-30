/**
 * `superdoc/ui/react` — official React bindings for the
 * `createSuperDocUI` controller.
 *
 * Ships the provider, the lifecycle-correct context, and a typed
 * subscription helper. Domain-specific convenience hooks (selection,
 * comments, review, toolbar, per-command) are sugar on top of
 * `useSuperDocSlice` so consumers don't repeat the same `useEffect +
 * setState + cleanup` boilerplate per slice.
 *
 * ```tsx
 * import {
 *   SuperDocUIProvider,
 *   useSuperDocUI,
 *   useSuperDocSelection,
 *   useSuperDocComments,
 *   useSuperDocReview,
 *   useSuperDocToolbar,
 *   useSuperDocCommand,
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
  useSuperDocReview,
  useSuperDocToolbar,
  useSuperDocCommand,
} from './hooks.js';
