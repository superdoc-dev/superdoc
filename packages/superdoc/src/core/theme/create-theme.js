/**
 * @typedef {Object} ThemeColors
 * @property {string} [action] Action/accent color (buttons, links, active states). Default: #1355ff
 * @property {string} [actionHover] Action hover state. Default: #0f44cc
 * @property {string} [bg] Default background for panels, cards, dropdowns. Default: #ffffff
 * @property {string} [hoverBg] Hover background. Default: #dbdbdb
 * @property {string} [activeBg] Active/pressed background. Default: #c8d0d8
 * @property {string} [disabledBg] Disabled background. Default: #f5f5f5
 * @property {string} [text] Primary text color. Default: #47484a
 * @property {string} [textMuted] Secondary/muted text. Default: #666666
 * @property {string} [textDisabled] Disabled text. Default: #ababab
 * @property {string} [border] Default border color. Default: #dbdbdb
 */

/**
 * @typedef {Object} ThemeConfig
 * @property {string} [name] Theme name — used in the generated class name (e.g., "dark" → "sd-theme-dark")
 * @property {string} [font] UI font family
 * @property {string} [radius] Default border radius (e.g., "8px")
 * @property {string} [shadow] Default box shadow
 * @property {ThemeColors} [colors] Core color palette — cascades to every component
 * @property {Record<string, string>} [vars] Escape hatch — raw CSS variable overrides (e.g., { '--sd-ui-toolbar-bg': '#f8fafc' })
 */

/*
 * These map to the --sd-ui-* variable names introduced in the SD-2083
 * theming system. Components consume them once that PR lands. Until then,
 * createTheme() generates the correct variables ahead of time.
 */
/** @type {Record<string, string>} */
const COLORS_TO_VARS = {
  action: '--sd-ui-action',
  actionHover: '--sd-ui-action-hover',
  bg: '--sd-ui-bg',
  hoverBg: '--sd-ui-hover-bg',
  activeBg: '--sd-ui-active-bg',
  disabledBg: '--sd-ui-disabled-bg',
  text: '--sd-ui-text',
  textMuted: '--sd-ui-text-muted',
  textDisabled: '--sd-ui-text-disabled',
  border: '--sd-ui-border',
};

let themeCounter = 0;

/**
 * Generate the className and CSS string from a theme config.
 * Shared core used by both createTheme and buildTheme.
 *
 * @param {ThemeConfig} config
 * @returns {{ className: string, css: string }}
 */
function generateTheme(config) {
  const { name, font, radius, shadow, colors, vars } = config;
  const className = `sd-theme-${name || `custom-${++themeCounter}`}`;

  /** @type {string[]} */
  const declarations = [];

  // Map semantic colors
  if (colors) {
    for (const [key, value] of Object.entries(colors)) {
      if (value == null) continue;
      const varName = COLORS_TO_VARS[key];
      if (varName) {
        declarations.push(`  ${varName}: ${value};`);
      }
    }
  }

  // Map top-level shortcuts
  if (font != null) declarations.push(`  --sd-ui-font-family: ${font};`);
  if (radius != null) declarations.push(`  --sd-ui-radius: ${radius};`);
  if (shadow != null) declarations.push(`  --sd-ui-shadow: ${shadow};`);

  // Spread raw CSS variable overrides
  if (vars) {
    for (const [varName, value] of Object.entries(vars)) {
      if (value == null) continue;
      declarations.push(`  ${varName}: ${value};`);
    }
  }

  const css = declarations.length > 0 ? `.${className} {\n${declarations.join('\n')}\n}` : '';

  return { className, css };
}

/**
 * Inject a theme's CSS into the document as a `<style>` element.
 * Idempotent — re-calling with the same className updates the existing element.
 * No-op when `document` is not available (SSR).
 *
 * @param {string} className
 * @param {string} css
 */
function injectThemeStyle(className, css) {
  if (typeof document === 'undefined' || !css) return;
  let style = document.querySelector(`[data-sd-theme="${className}"]`);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('data-sd-theme', className);
    document.head.appendChild(style);
  }
  style.textContent = css;
}

/**
 * Create a SuperDoc theme from a config object.
 *
 * Returns a CSS class name. Apply it to `<html>` to activate the theme.
 * The style element is injected into the document automatically.
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
 *   vars: { '--sd-ui-toolbar-bg': '#f8fafc' },
 * });
 *
 * document.documentElement.classList.add(theme);
 * ```
 */
export function createTheme(config) {
  const { className, css } = generateTheme(config);
  injectThemeStyle(className, css);
  return className;
}

/**
 * Build a SuperDoc theme and return both the class name and raw CSS.
 * Use this for SSR where you need to inject styles into the HTML template.
 *
 * @param {ThemeConfig} config
 * @returns {{ className: string, css: string }}
 *
 * @example
 * ```js
 * import { buildTheme } from 'superdoc';
 *
 * const { className, css } = buildTheme({
 *   colors: { action: '#6366f1', bg: '#ffffff', text: '#1e293b' },
 * });
 *
 * const html = `<html class="${className}"><head><style>${css}</style></head>...</html>`;
 * ```
 */
export function buildTheme(config) {
  const { className, css } = generateTheme(config);
  injectThemeStyle(className, css);
  return { className, css };
}
