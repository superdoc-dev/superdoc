/**
 * Strict OOXML token parsers for inline properties.
 *
 * Each parser produces a typed result: either a canonical value or a structured
 * `InvalidInlineTokenError` record. The same parser is used by both runtime and
 * import paths — the caller decides fatality (runtime: throw; import: collect).
 */

import type { CoreTogglePropertyId } from './property-ids.js';
import type { InvalidInlineTokenError, InvalidInlineTokenToggle, InvalidInlineTokenUnderline } from './error-types.js';
import type { DirectState } from './directives.js';
import {
  ST_ON_OFF_VALUE_SET,
  ST_ON_OFF_ON_VALUES,
  ST_ON_OFF_OFF_VALUES,
  ST_UNDERLINE_VALUE_SET,
  ST_THEME_COLOR_VALUE_SET,
} from './token-sets.js';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type TokenParseOk<T> = { ok: true; value: T };
export type TokenParseError = { ok: false; error: InvalidInlineTokenError };
export type TokenParseResult<T> = TokenParseOk<T> | TokenParseError;

// ---------------------------------------------------------------------------
// ST_OnOff parser (bold, italic, strike)
// ---------------------------------------------------------------------------

/**
 * Parsed result for an ST_OnOff property.
 * `direct` is the canonical tri-state directive; `canonical` is the
 * normalized OOXML value for export (`null` = ON bare element, `'0'` = OFF).
 */
export interface StOnOffParsed {
  direct: DirectState;
}

/**
 * Parses a `w:val` attribute value for an ST_OnOff property.
 *
 * @param property - The property being parsed (bold/italic/strike).
 * @param val - The `w:val` attribute value, or `null` for bare element (e.g., `<w:b/>`).
 * @param xpath - Attribute-level xpath for error reporting.
 */
export function parseStOnOff(
  property: CoreTogglePropertyId,
  val: string | null,
  xpath: string,
): TokenParseResult<StOnOffParsed> {
  // Bare element (absent w:val) normalizes to ON
  if (val === null) {
    return { ok: true, value: { direct: 'on' } };
  }

  if (ST_ON_OFF_ON_VALUES.has(val)) {
    return { ok: true, value: { direct: 'on' } };
  }

  if (ST_ON_OFF_OFF_VALUES.has(val)) {
    return { ok: true, value: { direct: 'off' } };
  }

  // If we reach here, the value is not in ON or OFF sets → invalid token.
  const error: InvalidInlineTokenToggle = {
    code: 'INVALID_INLINE_TOKEN',
    property,
    attribute: 'val',
    token: val,
    xpath,
  };
  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// ST_Underline parser (underline w:val)
// ---------------------------------------------------------------------------

export interface StUnderlineParsed {
  direct: DirectState;
  /** Underline type for ON states; `'none'` for OFF; `undefined` for absent. */
  underlineType?: string;
}

/**
 * Parses a `w:val` attribute for ST_Underline.
 *
 * @param val - The `w:val` attribute value, or `null` for bare `<w:u/>`.
 * @param xpath - Attribute-level xpath for error reporting.
 */
export function parseStUnderline(val: string | null, xpath: string): TokenParseResult<StUnderlineParsed> {
  // Bare element (absent w:val) normalizes to ON with default style
  if (val === null) {
    return { ok: true, value: { direct: 'on', underlineType: 'single' } };
  }

  if (val === 'none') {
    return { ok: true, value: { direct: 'off', underlineType: 'none' } };
  }

  if (ST_UNDERLINE_VALUE_SET.has(val)) {
    return { ok: true, value: { direct: 'on', underlineType: val } };
  }

  // Invalid token
  const error: InvalidInlineTokenUnderline = {
    code: 'INVALID_INLINE_TOKEN',
    property: 'underline',
    attribute: 'val',
    token: val,
    xpath,
  };
  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// Underline rich attribute parsers
// ---------------------------------------------------------------------------

/**
 * Parses and normalizes a `w:color` attribute on `<w:u>`.
 *
 * Accepts: 6-digit hex (with or without `#`), `auto`.
 * - Valid hex → lowercase 6-digit with `#` prefix.
 * - `auto` → `undefined` (theme-resolved, not stored as direct).
 * - Invalid → error.
 */
export function parseUnderlineColor(val: string | null, xpath: string): TokenParseResult<string | undefined> {
  if (val === null) {
    return { ok: true, value: undefined };
  }

  if (val === 'auto') {
    return { ok: true, value: undefined };
  }

  // Strip optional # prefix for validation
  const hex = val.startsWith('#') ? val.slice(1) : val;

  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return { ok: true, value: `#${hex.toLowerCase()}` };
  }

  const error: InvalidInlineTokenUnderline = {
    code: 'INVALID_INLINE_TOKEN',
    property: 'underline',
    attribute: 'color',
    token: val,
    xpath,
  };
  return { ok: false, error };
}

/**
 * Parses a `w:themeColor` attribute on `<w:u>`.
 * Must be an exact match from ST_ThemeColor (case-sensitive).
 */
export function parseUnderlineThemeColor(val: string | null, xpath: string): TokenParseResult<string | undefined> {
  if (val === null) {
    return { ok: true, value: undefined };
  }

  if (ST_THEME_COLOR_VALUE_SET.has(val)) {
    return { ok: true, value: val };
  }

  const error: InvalidInlineTokenUnderline = {
    code: 'INVALID_INLINE_TOKEN',
    property: 'underline',
    attribute: 'themeColor',
    token: val,
    xpath,
  };
  return { ok: false, error };
}

/**
 * Parses a `w:themeTint` or `w:themeShade` attribute on `<w:u>`.
 * Must be a 2-digit hex string (00–FF). Normalizes to uppercase.
 */
export function parseUnderlineThemeModifier(
  val: string | null,
  attribute: 'themeTint' | 'themeShade',
  xpath: string,
): TokenParseResult<string | undefined> {
  if (val === null) {
    return { ok: true, value: undefined };
  }

  if (/^[0-9a-fA-F]{2}$/.test(val)) {
    return { ok: true, value: val.toUpperCase() };
  }

  const error: InvalidInlineTokenUnderline = {
    code: 'INVALID_INLINE_TOKEN',
    property: 'underline',
    attribute,
    token: val,
    xpath,
  };
  return { ok: false, error };
}
