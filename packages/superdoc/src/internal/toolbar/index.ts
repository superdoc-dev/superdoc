/**
 * Internal built-in toolbar surface for the V2 `superdoc` package.
 *
 * Internal only — these symbols are NOT part of any public package export and
 * must not be re-exported from `src/public/*`. The compatibility catalog is the
 * single legacy-name map; the rendered shell is the single non-`null`
 * `superdoc.toolbar` handle that projects the V2 command controller.
 */
export {
  BUILT_IN_TOOLBAR_CATALOG,
  ALL_BUILT_IN_TOOLBAR_ITEM_NAMES,
  getBuiltInToolbarItem,
  listBuiltInToolbarItemsByGroup,
  resolveToolbarCommandId,
  assertCatalogAlignedWithController,
  type BuiltInToolbarItemEntry,
  type ToolbarGroup,
  type ToolbarItemDisposition,
} from './compatibility-catalog.js';

// The rendered built-in toolbar shell. This is the real
// `superdoc.toolbar` handle for `new SuperDoc({ toolbar })`: it renders the
// legacy built-in toolbar DOM and exposes the documented handle surface while
// consuming the single shared command controller for command truth.
export { createBuiltInToolbar, BuiltInToolbar } from './built-in-toolbar.js';
