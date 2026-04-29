/**
 * Public sub-entry: `superdoc/ui`
 *
 * Re-exports the browser-only UI controller from
 * `@superdoc/super-editor`. A dedicated `@superdoc/super-editor/ui`
 * sub-export (with its own Vite build entry) would tighten bundle
 * + IDE-resolve hygiene for consumers; tracked as a follow-up. For
 * now consumers only pull the two named runtime exports below, so
 * tree-shaking already drops the rest at the consumer's bundler
 * step.
 *
 * Source: `packages/super-editor/src/ui/`
 */
export { createSuperDocUI, shallowEqual } from '@superdoc/super-editor';
