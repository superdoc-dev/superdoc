/**
 * Theme Color Resolution
 *
 * Resolves OOXML theme color references (e.g., "accent1") to hex color strings,
 * applying optional tint and shade modifiers via RGB channel blending.
 */

import type { ThemeColorPalette } from '../types.js';

/**
 * Parses a two-character hex string (0x00–0xFF) to a 0–1 ratio.
 * OOXML encodes tint/shade as hex byte strings where 0xFF = full effect.
 */
export const parseThemePercentage = (value: unknown): number | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 16);
  if (Number.isNaN(parsed)) return undefined;
  return Math.max(0, Math.min(parsed / 255, 1));
};

const expandHex = (hex: string): string => {
  const normalized = hex.replace('#', '');
  if (normalized.length === 3) {
    return normalized
      .split('')
      .map((char) => char + char)
      .join('');
  }
  return normalized;
};

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const cleaned = expandHex(hex);
  if (cleaned.length !== 6) return null;
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  if ([r, g, b].some((channel) => Number.isNaN(channel))) return null;
  return { r, g, b };
};

const rgbToHex = (value: { r: number; g: number; b: number }): string => {
  const toHex = (channel: number) => {
    const normalized = Math.max(0, Math.min(255, channel));
    return normalized.toString(16).padStart(2, '0').toUpperCase();
  };
  return `#${toHex(value.r)}${toHex(value.g)}${toHex(value.b)}`;
};

/** Blend each RGB channel toward white by `ratio` (0 = no change, 1 = pure white). */
export const applyThemeTint = (baseHex: string, ratio: number): string => {
  const rgb = hexToRgb(baseHex);
  if (!rgb) return baseHex;
  const tinted = {
    r: Math.round(rgb.r + (255 - rgb.r) * ratio),
    g: Math.round(rgb.g + (255 - rgb.g) * ratio),
    b: Math.round(rgb.b + (255 - rgb.b) * ratio),
  };
  return rgbToHex(tinted);
};

/** Blend each RGB channel toward black by `ratio` (0 = pure black, 1 = no change). */
export const applyThemeShade = (baseHex: string, ratio: number): string => {
  const rgb = hexToRgb(baseHex);
  if (!rgb) return baseHex;
  const shaded = {
    r: Math.round(rgb.r * ratio),
    g: Math.round(rgb.g * ratio),
    b: Math.round(rgb.b * ratio),
  };
  return rgbToHex(shaded);
};

/**
 * Resolve a theme color key to a hex color string, applying tint/shade modifiers.
 *
 * @param themeKey - Theme color key (e.g., "accent1", "dk1", "hyperlink")
 * @param tint - Optional tint hex string (e.g., "99")
 * @param shade - Optional shade hex string (e.g., "BF")
 * @param themeColors - Palette mapping theme keys to base hex colors
 * @returns Resolved hex color with `#` prefix, or undefined if the key is not found
 */
export const resolveThemeColorValue = (
  themeKey: string,
  tint: string | undefined,
  shade: string | undefined,
  themeColors: ThemeColorPalette,
): string | undefined => {
  const key = themeKey.trim();
  if (!key) return undefined;
  const base = themeColors[key];
  if (!base) return undefined;
  let computed = base;
  const tintRatio = parseThemePercentage(tint);
  const shadeRatio = parseThemePercentage(shade);
  if (tintRatio != null) {
    computed = applyThemeTint(computed, tintRatio);
  }
  if (shadeRatio != null) {
    computed = applyThemeShade(computed, shadeRatio);
  }
  return computed;
};
