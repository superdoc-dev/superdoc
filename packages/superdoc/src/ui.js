/**
 * Public sub-entry: `superdoc/ui`
 *
 * Re-exports the browser-only UI controller from `@superdoc/super-editor`,
 * mirroring the `superdoc/headless-toolbar` shim pattern.
 *
 * Source: `packages/super-editor/src/ui/`
 * Domain namespaces (toolbar, comments, review, viewport, selection,
 * commands) are filed under SD-2667 and layer on top of `ui.select`.
 */
export { createSuperDocUI, shallowEqual } from '@superdoc/super-editor';
