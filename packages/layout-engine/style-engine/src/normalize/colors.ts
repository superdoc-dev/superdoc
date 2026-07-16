/**
 * Color helpers for the editor-neutral normalize layer.
 *
 * The normalize layer only needs:
 * - hex normalization (`AA00FF` -> `#AA00FF`)
 * - theme color resolution via the compiled theme palette
 * - tint/shade application per OOXML §17.2.9 (hex space, approximate)
 *
 * `auto` is intentionally returned as `undefined` so downstream layers
 * fall back to the document-safe default in the painter. Inheriting the
 * app-shell color onto white pages is a red flag for the v2 render path.
 */

import type { WordThemeColorPalette } from '../ooxml/word-style-model/parse-theme.js';

export function normalizeHexColor(value: string | undefined | null): string | undefined {
  if (value == null) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  if (/^auto$/i.test(trimmed)) return undefined;
  const stripped = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (!/^[0-9A-Fa-f]{6}$/.test(stripped)) {
    // Pass through named colors / unparsed values as-is — caller decides.
    return trimmed;
  }
  return `#${stripped.toUpperCase()}`;
}

/**
 * OOXML themeColor name → palette key. Word maps the rendered themeColor
 * values to the underlying clrScheme keys. We use the same mapping the v1
 * importer uses today (see `parse-theme.ts` for the palette keys).
 *
 * Names not listed here pass through; missing palette entries cause the
 * caller to fall back gracefully without throwing.
 */
const THEME_COLOR_ALIASES: Readonly<Record<string, string>> = {
  background1: 'lt1',
  text1: 'dk1',
  background2: 'lt2',
  text2: 'dk2',
  light1: 'lt1',
  dark1: 'dk1',
  light2: 'lt2',
  dark2: 'dk2',
};

export function resolveThemeColor(
  themeColor: string | undefined,
  palette: WordThemeColorPalette | undefined,
): string | undefined {
  if (!themeColor || !palette) return undefined;
  const aliased = THEME_COLOR_ALIASES[themeColor] ?? themeColor;
  const value = palette[aliased] ?? palette[themeColor];
  if (!value) return undefined;
  return normalizeHexColor(value);
}

/**
 * Apply OOXML theme tint / shade to a base hex color.
 *
 * Both attributes are encoded as a hex byte (00..FF). tint blends the color
 * toward white; shade blends it toward black. This is an approximation of
 * the HSL-based Word behavior good enough for first-paint visual parity
 * and proven elsewhere in the v1 pipeline. The painter / pm-adapter parity
 * gate will harden corner cases if needed.
 */
export function applyThemeTintShade(hexInput: string, themeTint?: string, themeShade?: string): string {
  const base = hexInput.startsWith('#') ? hexInput.slice(1) : hexInput;
  if (!/^[0-9A-Fa-f]{6}$/.test(base)) return hexInput;
  const tint = parseTintShadeByte(themeTint);
  const shade = parseTintShadeByte(themeShade);
  if (tint == null && shade == null) return `#${base.toUpperCase()}`;
  const r = parseInt(base.slice(0, 2), 16);
  const g = parseInt(base.slice(2, 4), 16);
  const b = parseInt(base.slice(4, 6), 16);
  let [rr, gg, bb] = [r, g, b];
  if (tint != null) {
    // Word tint: tint = (1 - tint) component + tint * 255 (toward white).
    const ratio = tint / 255;
    rr = Math.round(rr + (255 - rr) * (1 - ratio));
    gg = Math.round(gg + (255 - gg) * (1 - ratio));
    bb = Math.round(bb + (255 - bb) * (1 - ratio));
  }
  if (shade != null) {
    // Word shade: shade = component * (shade / 255) (toward black).
    const ratio = shade / 255;
    rr = Math.round(rr * ratio);
    gg = Math.round(gg * ratio);
    bb = Math.round(bb * ratio);
  }
  const toHex = (n: number): string => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`;
}

function parseTintShadeByte(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!/^[0-9A-Fa-f]{2}$/.test(trimmed)) return undefined;
  return parseInt(trimmed, 16);
}
