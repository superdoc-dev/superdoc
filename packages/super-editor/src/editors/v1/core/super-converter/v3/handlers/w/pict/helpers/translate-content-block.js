import { translator as alternateChoiceTranslator } from '@converter/v3/handlers/mc/altermateContent';
import { generateRandomSigned32BitIntStrId } from '@helpers/generateDocxRandomId';
import { wrapTextInRun } from '@converter/exporter';

/**
 * @param {Object} params - The parameters for translation.
 * @returns {Object} The XML representation.
 */
export function translateContentBlock(params) {
  const { node } = params;
  const { vmlAttributes, horizontalRule } = node.attrs;

  // Handle VML v:rect elements (like horizontal rules)
  if (vmlAttributes || horizontalRule) {
    return translateVRectContentBlock(params);
  }

  const alternateContent = alternateChoiceTranslator.decode(params);
  return wrapTextInRun(alternateContent);
}

// Nominal full-width value for VML style. Word ignores this when o:hr="t"
// is present and renders the rect at full page width instead.
const FULL_WIDTH_PT = '468pt';
const FULL_WIDTH_PT_VALUE = 468;

// Conversion factor matching the importer (1pt ~= 1.33px).
const PX_PER_PT = 1.33;

/**
 * Convert a pixel value to a VML point string (e.g. 2 -> "1.5pt").
 * Rounds to one decimal place to match typical OOXML precision.
 * @param {number} px
 * @returns {string}
 */
function pxToPt(px) {
  const pt = Math.round((px / PX_PER_PT) * 10) / 10;
  return `${pt}pt`;
}

/**
 * Convert supported size values to VML point strings.
 * Supports:
 * - numbers (treated as px)
 * - pixel strings (e.g. "200px")
 * - numeric strings (e.g. "200")
 * - percentages for width (e.g. "50%", "100%")
 * @param {unknown} value
 * @param {{ allowPercent?: boolean }} [options]
 * @returns {string|null}
 */
function sizeToPt(value, options = {}) {
  const { allowPercent = false } = options;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? pxToPt(value) : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (allowPercent && trimmed.endsWith('%')) {
    const percent = Number.parseFloat(trimmed.slice(0, -1));
    if (!Number.isFinite(percent) || percent <= 0) return null;

    if (percent >= 100) return FULL_WIDTH_PT;

    const pt = Math.round(((FULL_WIDTH_PT_VALUE * percent) / 100) * 10) / 10;
    return `${pt}pt`;
  }

  const normalized = trimmed.endsWith('px') ? trimmed.slice(0, -2) : trimmed;
  const px = Number.parseFloat(normalized);
  if (!Number.isFinite(px)) return null;

  return pxToPt(px);
}

/**
 * Build a VML style string from the node's `size` attribute.
 * Used as a fallback when no raw `style` was preserved from import.
 * @param {{ width?: unknown, height?: unknown }} size
 * @returns {string}
 */
function synthesizeVmlStyle(size) {
  const parts = [];

  if (size.width != null) {
    const widthPt = sizeToPt(size.width, { allowPercent: true });
    if (widthPt) {
      parts.push(`width:${widthPt}`);
    }
  }

  if (size.height != null) {
    const heightPt = sizeToPt(size.height);
    if (heightPt) {
      parts.push(`height:${heightPt}`);
    }
  }

  return parts.join(';');
}

/**
 * @param {Object} params - The parameters for translation.
 * @returns {Object} The XML representation.
 */
export function translateVRectContentBlock(params) {
  const { node } = params;
  const { horizontalRule, vmlAttributes, background, attributes, style, size } = node.attrs;

  const rectAttrs = {
    id: attributes?.id || `_x0000_i${Math.floor(Math.random() * 10000)}`,
  };

  // --- Style (VML CSS dimensions) ---
  if (style) {
    rectAttrs.style = style;
  }

  if (background) {
    rectAttrs.fillcolor = background;
  }

  // --- VML HR flags ---
  if (vmlAttributes) {
    if (vmlAttributes.hralign) rectAttrs['o:hralign'] = vmlAttributes.hralign;
    if (vmlAttributes.hrstd) rectAttrs['o:hrstd'] = vmlAttributes.hrstd;
    if (vmlAttributes.hr) rectAttrs['o:hr'] = vmlAttributes.hr;
    if (vmlAttributes.stroked) rectAttrs.stroked = vmlAttributes.stroked;
  }

  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      if (!rectAttrs[key] && value !== undefined) {
        rectAttrs[key] = value;
      }
    });
  }

  // Synthesize style only when not already provided by style/attributes.
  if (!rectAttrs.style && horizontalRule && size) {
    const synthesized = synthesizeVmlStyle(size);
    if (synthesized) {
      rectAttrs.style = synthesized;
    }
  }

  // Ensure horizontal-rule VML flags are complete even if metadata is partial.
  if (horizontalRule) {
    if (rectAttrs['o:hr'] == null) rectAttrs['o:hr'] = 't';
    if (rectAttrs['o:hrstd'] == null) rectAttrs['o:hrstd'] = 't';
    if (rectAttrs['o:hralign'] == null) rectAttrs['o:hralign'] = 'center';
    if (rectAttrs.stroked == null) rectAttrs.stroked = 'f';
  }

  // Create the v:rect element
  const rect = {
    name: 'v:rect',
    attributes: rectAttrs,
  };

  // Wrap in w:pict
  const pict = {
    name: 'w:pict',
    attributes: {
      'w14:anchorId': generateRandomSigned32BitIntStrId(),
    },
    elements: [rect],
  };

  return wrapTextInRun(pict);
}
