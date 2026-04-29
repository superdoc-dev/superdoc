/**
 * Public sub-entry: `superdoc/ui`
 *
 * Re-exports the browser-only UI controller from the dedicated
 * `@superdoc/super-editor/ui` sub-export. This sub-export points at
 * `packages/super-editor/src/ui/index.ts` directly, so consumers
 * pull only the UI controller and its types — not the editor core,
 * SuperConverter, jszip, xml-js, headless-toolbar, etc. that the
 * package's main entry transitively imports.
 *
 * Source: `packages/super-editor/src/ui/`
 */
export { createSuperDocUI, shallowEqual } from '@superdoc/super-editor/ui';
