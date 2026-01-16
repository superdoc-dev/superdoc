/**
 * Attributes Module
 *
 * Centralized exports for paragraph attribute normalization, computation, and conversion.
 */

// Border and shading
export {
  convertBorderSpec,
  convertTableBorderValue,
  extractTableBorders,
  extractCellBorders,
  extractCellPadding,
  normalizeParagraphBorders,
  normalizeParagraphShading,
  normalizeShadingColor,
  mapBorderStyle,
  normalizeBorderSide,
} from './borders.js';

// Spacing and indent
export { normalizeAlignment, normalizeParagraphSpacing, normalizeLineRule } from './spacing-indent.js';

// Tab stops
export { normalizeOoxmlTabs, normalizeTabVal, normalizeTabLeader } from './tabs.js';

// BiDi text
export { mirrorIndentForRtl, ensureBidiIndentPx, DEFAULT_BIDI_INDENT_PX } from './bidi.js';

// Paragraph attributes
export { computeParagraphAttrs, deepClone } from './paragraph.js';
