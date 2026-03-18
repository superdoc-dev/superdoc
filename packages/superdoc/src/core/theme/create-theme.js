/**
 * @typedef {Object} ThemeColors
 * @property {string} [action] Action/accent color (buttons, links). Default: #1355ff
 * @property {string} [actionHover] Action hover state. Default: derived from action
 * @property {string} [bg] Default surface/background. Default: #ffffff
 * @property {string} [hoverBg] Hover background. Default: #dbdbdb
 * @property {string} [activeBg] Active/pressed background. Default: #c8d0d8
 * @property {string} [text] Primary text color. Default: #47484a
 * @property {string} [textMuted] Secondary text. Default: #666666
 * @property {string} [border] Default border color. Default: #dbdbdb
 */

/**
 * @typedef {Object} ThemeToolbar
 * @property {string} [bg] Toolbar background. Default: transparent
 * @property {string} [buttonText] Button text/icon color
 * @property {string} [buttonHoverBg] Button hover background
 * @property {string} [buttonActiveBg] Button active background
 * @property {string} [itemPadding] Padding inside each button
 */

/**
 * @typedef {Object} ThemeDropdown
 * @property {string} [bg] Dropdown panel background
 * @property {string} [border] Panel border
 * @property {string} [text] Option text
 * @property {string} [hoverBg] Option hover background
 * @property {string} [activeBg] Option active background
 * @property {string} [shadow] Panel shadow
 */

/**
 * @typedef {Object} ThemeMenu
 * @property {string} [bg] Menu background
 * @property {string} [text] Menu text
 * @property {string} [border] Menu border
 * @property {string} [itemHoverBg] Item hover background
 * @property {string} [itemActiveBg] Active item background
 * @property {string} [itemActiveText] Active item text
 * @property {string} [shadow] Menu shadow
 */

/**
 * @typedef {Object} ThemeComments
 * @property {string} [cardBg] Default card background. Default: #f3f6fd
 * @property {string} [cardHoverBg] Hovered card background
 * @property {string} [cardActiveBg] Selected/active card background
 * @property {string} [cardResolvedBg] Resolved card background
 * @property {string} [cardActiveBorder] Active card border
 * @property {string} [cardRadius] Card border radius
 * @property {string} [cardShadow] Card shadow
 * @property {string} [separator] Divider between comments
 * @property {string} [authorText] Author name color
 * @property {string} [timestampText] Timestamp color
 * @property {string} [bodyText] Comment body text color
 * @property {string} [inputBg] Comment input background
 * @property {string} [inputBorder] Comment input border
 */

/**
 * @typedef {Object} ThemeHighlights
 * @property {string} [external] External comment highlight
 * @property {string} [externalActive] Active external highlight
 * @property {string} [externalFaded] Faded external highlight
 * @property {string} [internal] Internal comment highlight
 * @property {string} [internalActive] Active internal highlight
 * @property {string} [internalFaded] Faded internal highlight
 */

/**
 * @typedef {Object} ThemeTrackedChanges
 * @property {string} [insertBg] Insert highlight background
 * @property {string} [insertBorder] Insert left border
 * @property {string} [deleteBg] Delete highlight background
 * @property {string} [deleteBorder] Delete left border
 * @property {string} [formatBorder] Format change border
 */

/**
 * @typedef {Object} ThemeLayout
 * @property {string} [pageBg] Page background
 * @property {string} [pageShadow] Page shadow
 */

/**
 * @typedef {Object} ThemeConfig
 * @property {string} [name] Optional theme name (used in the generated class name)
 * @property {string} [font] UI font family
 * @property {string} [radius] Default border radius
 * @property {string} [shadow] Default shadow
 * @property {ThemeColors} [colors] Core color palette
 * @property {ThemeToolbar} [toolbar] Toolbar overrides
 * @property {ThemeDropdown} [dropdown] Dropdown overrides
 * @property {ThemeMenu} [menu] Context menu overrides
 * @property {ThemeComments} [comments] Comments panel overrides
 * @property {ThemeHighlights} [highlights] In-document comment highlight overrides
 * @property {ThemeTrackedChanges} [trackedChanges] Tracked change decoration overrides
 * @property {ThemeLayout} [layout] Page layout overrides
 */

/** @type {Map<string, string>} */
const CONFIG_TO_VAR = new Map([
  // Colors (semantic tier)
  ['colors.action', '--sd-ui-action'],
  ['colors.actionHover', '--sd-ui-action-hover'],
  ['colors.bg', '--sd-ui-bg'],
  ['colors.hoverBg', '--sd-ui-hover-bg'],
  ['colors.activeBg', '--sd-ui-active-bg'],
  ['colors.text', '--sd-ui-text'],
  ['colors.textMuted', '--sd-ui-text-muted'],
  ['colors.border', '--sd-ui-border'],

  // Top-level shortcuts
  ['font', '--sd-ui-font-family'],
  ['radius', '--sd-ui-radius'],
  ['shadow', '--sd-ui-shadow'],

  // Toolbar
  ['toolbar.bg', '--sd-ui-toolbar-bg'],
  ['toolbar.buttonText', '--sd-ui-toolbar-button-text'],
  ['toolbar.buttonHoverBg', '--sd-ui-toolbar-button-hover-bg'],
  ['toolbar.buttonActiveBg', '--sd-ui-toolbar-button-active-bg'],
  ['toolbar.itemPadding', '--sd-ui-toolbar-item-padding'],

  // Dropdown
  ['dropdown.bg', '--sd-ui-dropdown-bg'],
  ['dropdown.border', '--sd-ui-dropdown-border'],
  ['dropdown.text', '--sd-ui-dropdown-text'],
  ['dropdown.hoverBg', '--sd-ui-dropdown-hover-bg'],
  ['dropdown.activeBg', '--sd-ui-dropdown-active-bg'],
  ['dropdown.shadow', '--sd-ui-dropdown-shadow'],

  // Menu
  ['menu.bg', '--sd-ui-menu-bg'],
  ['menu.text', '--sd-ui-menu-text'],
  ['menu.border', '--sd-ui-menu-border'],
  ['menu.itemHoverBg', '--sd-ui-menu-item-hover-bg'],
  ['menu.itemActiveBg', '--sd-ui-menu-item-active-bg'],
  ['menu.itemActiveText', '--sd-ui-menu-item-active-text'],
  ['menu.shadow', '--sd-ui-menu-shadow'],

  // Comments
  ['comments.cardBg', '--sd-ui-comments-card-bg'],
  ['comments.cardHoverBg', '--sd-ui-comments-card-hover-bg'],
  ['comments.cardActiveBg', '--sd-ui-comments-card-active-bg'],
  ['comments.cardResolvedBg', '--sd-ui-comments-card-resolved-bg'],
  ['comments.cardActiveBorder', '--sd-ui-comments-card-active-border'],
  ['comments.cardRadius', '--sd-ui-comments-card-radius'],
  ['comments.cardShadow', '--sd-ui-comments-card-shadow'],
  ['comments.separator', '--sd-ui-comments-separator'],
  ['comments.authorText', '--sd-ui-comments-author-text'],
  ['comments.timestampText', '--sd-ui-comments-timestamp-text'],
  ['comments.bodyText', '--sd-ui-comments-body-text'],
  ['comments.inputBg', '--sd-ui-comments-input-bg'],
  ['comments.inputBorder', '--sd-ui-comments-input-border'],

  // Highlights
  ['highlights.external', '--sd-comments-highlight-external'],
  ['highlights.externalActive', '--sd-comments-highlight-external-active'],
  ['highlights.externalFaded', '--sd-comments-highlight-external-faded'],
  ['highlights.internal', '--sd-comments-highlight-internal'],
  ['highlights.internalActive', '--sd-comments-highlight-internal-active'],
  ['highlights.internalFaded', '--sd-comments-highlight-internal-faded'],

  // Tracked changes
  ['trackedChanges.insertBg', '--sd-tracked-changes-insert-background'],
  ['trackedChanges.insertBorder', '--sd-tracked-changes-insert-border'],
  ['trackedChanges.deleteBg', '--sd-tracked-changes-delete-background'],
  ['trackedChanges.deleteBorder', '--sd-tracked-changes-delete-border'],
  ['trackedChanges.formatBorder', '--sd-tracked-changes-format-border'],

  // Layout
  ['layout.pageBg', '--sd-layout-page-bg'],
  ['layout.pageShadow', '--sd-layout-page-shadow'],
]);

let themeCounter = 0;

/**
 * Flatten a nested config object into dot-separated paths.
 * @param {Record<string, any>} obj
 * @param {string} [prefix]
 * @returns {Array<[string, string]>}
 */
function flattenConfig(obj, prefix = '') {
  /** @type {Array<[string, string]>} */
  const entries = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      entries.push(...flattenConfig(value, path));
    } else if (value != null) {
      entries.push([path, String(value)]);
    }
  }
  return entries;
}

/**
 * Create a SuperDoc theme from a config object.
 *
 * Returns a CSS class name. Apply it to `<html>` to activate the theme.
 * The class is injected into the document automatically.
 *
 * @param {ThemeConfig} config
 * @returns {string} The generated CSS class name
 *
 * @example
 * ```js
 * import { createTheme } from 'superdoc';
 *
 * const theme = createTheme({
 *   colors: { action: '#6366f1', bg: '#ffffff', text: '#1e293b' },
 *   font: 'Inter, sans-serif',
 *   toolbar: { bg: '#f8fafc' },
 * });
 *
 * document.documentElement.classList.add(theme);
 * ```
 */
export function createTheme(config) {
  const { name, ...rest } = config;
  const className = `sd-theme-${name || `custom-${++themeCounter}`}`;

  const flat = flattenConfig(rest);
  const declarations = [];

  for (const [path, value] of flat) {
    const varName = CONFIG_TO_VAR.get(path);
    if (varName) {
      declarations.push(`  ${varName}: ${value};`);
    }
  }

  if (declarations.length === 0) return className;

  const css = `.${className} {\n${declarations.join('\n')}\n}`;

  // Inject into document if available (SSR-safe)
  if (typeof document !== 'undefined') {
    let style = document.querySelector(`[data-sd-theme="${className}"]`);
    if (!style) {
      style = document.createElement('style');
      style.setAttribute('data-sd-theme', className);
      document.head.appendChild(style);
    }
    style.textContent = css;
  }

  // Attach the raw CSS for SSR or manual injection
  /** @type {string} */
  createTheme._lastCss = css;

  return className;
}

/**
 * Get the raw CSS string from the last createTheme() call.
 * Useful for SSR where you need to inject styles into the HTML template.
 *
 * @param {ThemeConfig} config
 * @returns {{ className: string, css: string }}
 */
export function buildTheme(config) {
  const className = createTheme(config);
  return { className, css: createTheme._lastCss || '' };
}
