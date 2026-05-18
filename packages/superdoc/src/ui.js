/**
 * Public sub-entry: `superdoc/ui`
 *
 * Re-exports the browser-only UI controller from the dedicated
 * `@superdoc/super-editor/ui` sub-export. The narrow subpath points at
 * `packages/super-editor/src/ui/index.ts` directly so consumers do not
 * drag the editor root/main barrel — Vue components, the SuperDoc app
 * shell, and other top-level UI infrastructure. The bundle still pulls
 * SuperConverter, jszip, xml-js, and similar shared chunks because the
 * UI controller depends on them transitively (verified against the
 * emitted `dist/ui.es.js`); what the narrow path avoids is the
 * app-shell chunk specifically.
 *
 * `packages/superdoc/scripts/audit-bundle.cjs` enforces the shape on
 * the emitted bundle.
 *
 * Source: `packages/super-editor/src/ui/`
 */
export { BUILT_IN_COMMAND_IDS, createSuperDocUI, shallowEqual } from '@superdoc/super-editor/ui';
