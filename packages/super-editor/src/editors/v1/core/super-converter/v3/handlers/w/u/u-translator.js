// @ts-check
import { NodeTranslator } from '@translator';
import { ST_UNDERLINE_VALUE_SET } from '@superdoc/document-api';
import { normalizeHexColor } from '../../../../helpers.js';
import { pushDiagnostic } from '../../../handlers/import-diagnostics.js';
import validXmlAttributes from './attributes/index.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'w:u';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_ATTR_KEY = 'underline';

/**
 * Encode the w:u element (underline) with strict ST_Underline token validation.
 *
 * - Valid ON tokens → mark with underlineType and preserved rich attrs.
 * - `none` → mark with underlineType: 'none' (OFF).
 * - Bare element (no w:val) → ON with default 'single'.
 * - Invalid w:val → treated as absent (CLEAR) + diagnostic pushed if collector provided.
 *
 * @param {import('@translator').SCEncoderConfig} params
 * @param {Record<string, unknown>} [encodedAttrs]
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (params, encodedAttrs = {}) => {
  const { nodes } = params;
  const node = nodes?.[0];
  const sourceAttrs = node?.attributes || {};
  const importDiagnosticsCollectionId = params?.extraParams?.importDiagnosticsCollectionId;

  const rawVal = encodedAttrs.underline ?? sourceAttrs['w:val'];

  // Validate w:val against ST_Underline (shared token set)
  let underlineType;
  if (rawVal === undefined || rawVal === null) {
    // Bare element (absent w:val) → ON with default style
    underlineType = null;
  } else if (typeof rawVal === 'string' && ST_UNDERLINE_VALUE_SET.has(rawVal)) {
    underlineType = rawVal;
  } else {
    // Invalid token → push structured diagnostic, then treat as absent (CLEAR)
    pushDiagnostic(
      {
        code: 'INVALID_INLINE_TOKEN',
        property: 'underline',
        attribute: 'val',
        token: String(rawVal),
        xpath: 'w:u/@w:val',
      },
      importDiagnosticsCollectionId,
    );
    return undefined;
  }

  const color = encodedAttrs.color ?? sourceAttrs['w:color'];
  const themeColor = encodedAttrs.themeColor ?? sourceAttrs['w:themeColor'];
  const themeTint = encodedAttrs.themeTint ?? sourceAttrs['w:themeTint'];
  const themeShade = encodedAttrs.themeShade ?? sourceAttrs['w:themeShade'];

  const attributes = { 'w:val': underlineType };

  // Only include rich attrs for ON states (not OFF/none)
  if (underlineType !== 'none') {
    if (color !== undefined && color !== null) attributes['w:color'] = color;
    if (themeColor !== undefined && themeColor !== null) attributes['w:themeColor'] = themeColor;
    if (themeTint !== undefined && themeTint !== null) attributes['w:themeTint'] = themeTint;
    if (themeShade !== undefined && themeShade !== null) attributes['w:themeShade'] = themeShade;
  }

  return {
    type: 'attr',
    xmlName: XML_NODE_NAME,
    sdNodeOrKeyName: SD_ATTR_KEY,
    attributes,
  };
};

/**
 * Decode underline PM attrs to canonical OOXML export form.
 *
 * - ON → `<w:u w:val="single"/>` (or rich type + color attrs).
 * - OFF → `<w:u w:val="none"/>` (no color/theme attrs).
 * - CLEAR → no element.
 *
 * Canonical attribute ordering: w:val, w:color, w:themeColor, w:themeTint, w:themeShade.
 */
const decode = (params) => {
  const attrs = params?.node?.attrs?.underline || params?.node?.attrs || {};
  const underlineType = attrs.underlineType ?? attrs.underline ?? attrs['w:val'] ?? null;
  const color = attrs.underlineColor ?? attrs.color ?? attrs['w:color'] ?? null;
  const themeColor = attrs.underlineThemeColor ?? attrs.themeColor ?? attrs['w:themeColor'] ?? null;
  const themeTint = attrs.underlineThemeTint ?? attrs.themeTint ?? attrs['w:themeTint'] ?? null;
  const themeShade = attrs.underlineThemeShade ?? attrs.themeShade ?? attrs['w:themeShade'] ?? null;

  // CLEAR — no element
  if (!underlineType && !color && !themeColor) return undefined;

  // Build attributes in canonical spec order: w:val, w:color, w:themeColor, w:themeTint, w:themeShade
  const attributes = {};
  if (underlineType) attributes['w:val'] = underlineType;

  // OFF state — no color/theme attrs emitted
  if (underlineType === 'none') {
    return { name: XML_NODE_NAME, attributes };
  }

  // ON state — include rich attrs in canonical order
  if (color) {
    const normalized = normalizeHexColor(color);
    if (normalized) attributes['w:color'] = normalized;
  }
  if (themeColor) attributes['w:themeColor'] = themeColor;
  if (themeTint) attributes['w:themeTint'] = themeTint;
  if (themeShade) attributes['w:themeShade'] = themeShade;

  return { name: XML_NODE_NAME, attributes };
};

/** @type {import('@translator').NodeTranslatorConfig} */
export const config = {
  xmlName: XML_NODE_NAME,
  sdNodeOrKeyName: SD_ATTR_KEY,
  type: NodeTranslator.translatorTypes.ATTRIBUTE,
  encode,
  decode,
  attributes: validXmlAttributes,
};

/**
 * The NodeTranslator instance for the w:u element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
