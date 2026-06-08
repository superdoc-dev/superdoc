/**
 * Public sub-entry: `superdoc/ui/react`
 *
 * Official React bindings for the `createSuperDocUI` controller —
 * provider, lifecycle-correct context, and typed subscription helper
 * plus per-domain hooks. See `packages/super-editor/src/ui/react/`.
 */
export {
  SuperDocUIProvider,
  useSuperDocUI,
  useSuperDocHost,
  useSetSuperDoc,
  useSuperDocSlice,
  useSuperDocSelection,
  useSuperDocComments,
  useSuperDocContentControls,
  useSuperDocTrackChanges,
  useSuperDocToolbar,
  useSuperDocCommand,
  useSuperDocDocument,
  useSuperDocZoom,
} from '@superdoc/super-editor/ui/react';
