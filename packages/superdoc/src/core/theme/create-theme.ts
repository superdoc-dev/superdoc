export interface ThemeColors {
  /** Action/accent color (buttons, links, active states). Default: #1355ff */
  action?: string;
  /** Action hover state. Default: #0f44cc */
  actionHover?: string;
  /** Text color on action-colored buttons. Default: #ffffff */
  actionText?: string;
  /** Default background for panels, cards, dropdowns. Default: #ffffff */
  bg?: string;
  /** Hover background. Default: #dbdbdb */
  hoverBg?: string;
  /** Active/pressed background. Default: #c8d0d8 */
  activeBg?: string;
  /** Disabled background. Default: #f5f5f5 */
  disabledBg?: string;
  /** Primary text color. Default: #47484a */
  text?: string;
  /** Secondary/muted text. Default: #666666 */
  textMuted?: string;
  /** Disabled text. Default: #ababab */
  textDisabled?: string;
  /** Default border color. Default: #dbdbdb */
  border?: string;
}

export interface ThemeConfig {
  /** Theme name — used in the generated class name (e.g., "dark" → "sd-theme-dark") */
  name?: string;
  /** UI font family */
  font?: string;
  /** Default border radius (e.g., "8px") */
  radius?: string;
  /** Default box shadow */
  shadow?: string;
  /** Core color palette — cascades to every component */
  colors?: ThemeColors;
  /** Escape hatch — raw CSS variable overrides (e.g., { '--sd-ui-toolbar-bg': '#f8fafc' }) */
  vars?: Record<string, string | null | undefined>;
}

export interface ThemeResult {
  className: string;
  css: string;
}

/*
 * These map to the --sd-ui-* variable names introduced in the SD-2083
 * theming system. Components consume them once that PR lands. Until then,
 * createTheme() generates the correct variables ahead of time.
 */
const COLORS_TO_VARS: Record<string, string> = {
  action: '--sd-ui-action',
  actionHover: '--sd-ui-action-hover',
  actionText: '--sd-ui-action-text',
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
 */
function generateTheme(config: ThemeConfig): ThemeResult {
  const { name, font, radius, shadow, colors, vars } = config;
  const safeName = name ? name.replace(/[^a-zA-Z0-9-_]/g, '-') : null;
  const className = `sd-theme-${safeName || `custom-${++themeCounter}`}`;

  const declarations: string[] = [];

  if (colors) {
    for (const [key, value] of Object.entries(colors)) {
      if (value == null) continue;
      const varName = COLORS_TO_VARS[key];
      if (varName) {
        declarations.push(`  ${varName}: ${value};`);
      }
    }
  }

  if (font != null) declarations.push(`  --sd-ui-font-family: ${font};`);
  if (radius != null) declarations.push(`  --sd-ui-radius: ${radius};`);
  if (shadow != null) declarations.push(`  --sd-ui-shadow: ${shadow};`);

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
 */
function injectThemeStyle(className: string, css: string): void {
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
 * For strict CSP environments that require a nonce, use {@link buildTheme} instead
 * and inject the CSS yourself with the appropriate nonce attribute.
 *
 * @example
 * ```ts
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
export function createTheme(config: ThemeConfig): string {
  const { className, css } = generateTheme(config);
  injectThemeStyle(className, css);
  return className;
}

/**
 * Build a SuperDoc theme and return both the class name and raw CSS.
 * Pure function — does NOT inject styles into the DOM. Use this for SSR
 * or when you need to control style injection yourself (e.g., CSP nonce).
 *
 * @example
 * ```ts
 * import { buildTheme } from 'superdoc';
 *
 * const { className, css } = buildTheme({
 *   colors: { action: '#6366f1', bg: '#ffffff', text: '#1e293b' },
 * });
 *
 * const html = `<html class="${className}"><head><style>${css}</style></head>...</html>`;
 * ```
 */
export function buildTheme(config: ThemeConfig): ThemeResult {
  return generateTheme(config);
}
