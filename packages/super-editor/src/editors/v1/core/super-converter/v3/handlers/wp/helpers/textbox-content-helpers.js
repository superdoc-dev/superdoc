import { carbonCopy } from '@core/utilities/carbonCopy.js';
import { preProcessNodesForFldChar } from '@converter/field-references/preProcessNodesForFldChar.js';
import { preProcessPageFieldsOnly } from '@converter/field-references/preProcessPageFieldsOnly.js';
import { resolveParagraphProperties, resolveRunProperties } from '@converter/styles';
import { twipsToPixels } from '@converter/helpers.js';
import { translator as w_pPrTranslator } from '@converter/v3/handlers/w/pPr';
import { translator as w_rPrTranslator } from '@converter/v3/handlers/w/rpr';
import { resolveDocxFontFamily } from '@superdoc/style-engine/ooxml';
import { SuperConverter } from '@converter/SuperConverter.js';

/**
 * Regex pattern to match header or footer XML filenames.
 * Matches: header.xml, header1.xml, footer.xml, footer2.xml, etc.
 */
const HEADER_FOOTER_FILENAME_PATTERN = /^(header|footer)\d*\.xml$/i;

/**
 * Recursively collects all paragraph nodes (w:p) from a text box content structure.
 * This handles nested structures like w:sdt/w:sdtContent that wrap paragraphs.
 *
 * @param {Array<Object>} nodes - Array of XML element nodes to search
 * @param {Array<Object>} [paragraphs=[]] - Accumulator array for found paragraphs
 * @returns {Array<Object>} Array of w:p paragraph nodes found in the structure
 *
 * @example
 * // Handles nested w:sdt structures:
 * // <w:txbxContent>
 * //   <w:sdt>
 * //     <w:sdtContent>
 * //       <w:p>...</w:p>
 * //     </w:sdtContent>
 * //   </w:sdt>
 * // </w:txbxContent>
 * const paragraphs = collectTextBoxParagraphs(textboxContent.elements);
 */
export function collectTextBoxParagraphs(nodes, paragraphs = []) {
  if (!Array.isArray(nodes)) return paragraphs;
  nodes.forEach((node) => {
    if (!node) return;
    if (node.name === 'w:p') {
      paragraphs.push(node);
      return;
    }
    if (Array.isArray(node.elements)) {
      collectTextBoxParagraphs(node.elements, paragraphs);
    }
  });
  return paragraphs;
}

/**
 * Pre-processes text box content to handle field codes (PAGE, NUMPAGES, etc.).
 * Creates a deep copy to avoid mutating the original content.
 *
 * For header/footer files, uses simplified page field processing.
 * For body content, uses full field character processing.
 *
 * @param {Object} textBoxContent - The w:txbxContent element containing paragraphs
 * @param {Object} [params={}] - Translator params
 * @param {Object} [params.docx] - The parsed docx object
 * @param {string} [params.filename] - The source filename (e.g., 'header1.xml', 'document.xml')
 * @returns {Object} Processed text box content with field codes converted to sd:* nodes
 */
export function preProcessTextBoxContent(textBoxContent, params = {}) {
  if (!textBoxContent?.elements) return textBoxContent;
  const clone = carbonCopy(textBoxContent);
  const filename = typeof params.filename === 'string' ? params.filename : '';
  const isHeaderFooter = HEADER_FOOTER_FILENAME_PATTERN.test(filename);

  if (isHeaderFooter) {
    const { processedNodes } = preProcessPageFieldsOnly(clone.elements);
    clone.elements = processedNodes;
    return clone;
  }

  const { processedNodes } = preProcessNodesForFldChar(clone.elements, params.docx);
  clone.elements = processedNodes;
  return clone;
}

/**
 * Converts half-points to pixels.
 * OOXML font sizes are specified in half-points (1/144 inch).
 * Formula: pixels = (halfPoints / 2) * (96 dpi / 72 points per inch)
 *
 * @param {number|string|null|undefined} halfPoints - Font size in half-points
 * @returns {number|undefined} Font size in pixels, or undefined if invalid input
 */
export function halfPointsToPixels(halfPoints) {
  if (halfPoints == null) return undefined;
  const numeric = Number(halfPoints);
  if (!Number.isFinite(numeric)) return undefined;
  const points = numeric / 2;
  // Convert points to pixels: (points * 96 dpi) / 72 points per inch
  // Round to 3 decimal places to avoid floating point artifacts
  return Math.round(((points * 96) / 72) * 1000) / 1000;
}

/**
 * Resolves a font family value to a CSS-compatible font family string.
 *
 * @param {string|Object|null|undefined} fontFamily - Font family from run properties
 * @param {Object} [docx] - The parsed docx object for theme font resolution
 * @returns {string|undefined} CSS font family string, or undefined if not resolvable
 */
export function resolveFontFamilyForTextBox(fontFamily, docx) {
  if (!fontFamily) return undefined;
  if (typeof fontFamily === 'string') {
    return SuperConverter.toCssFontFamily(fontFamily, docx);
  }
  return resolveDocxFontFamily(fontFamily, docx, SuperConverter.toCssFontFamily);
}

/**
 * Resolves paragraph properties for a text box paragraph.
 *
 * @param {Object} paragraph - The w:p paragraph element
 * @param {Object} params - Translator params containing docx and other context
 * @returns {Object} Resolved paragraph properties
 */
export function resolveParagraphPropertiesForTextBox(paragraph, params) {
  const pPr = paragraph.elements?.find((el) => el.name === 'w:pPr');
  const inlineParagraphProperties = pPr ? w_pPrTranslator.encode({ ...params, nodes: [pPr] }) || {} : {};
  return resolveParagraphProperties(params, inlineParagraphProperties, false, false, null);
}

/**
 * Extracts formatting properties from a run's w:rPr element.
 *
 * @param {Object|null|undefined} rPr - The w:rPr element containing run properties
 * @param {Object} paragraphProperties - Resolved paragraph properties for inheritance
 * @param {Object} params - Translator params containing docx and other context
 * @returns {Object} Formatting object with bold, italic, color, fontSize, fontFamily
 */
export function extractRunFormatting(rPr, paragraphProperties, params) {
  const inlineRunProperties = rPr ? w_rPrTranslator.encode({ ...params, nodes: [rPr] }) || {} : {};
  const resolvedRunProperties = resolveRunProperties(params, inlineRunProperties, paragraphProperties || {});
  const formatting = {};

  if (resolvedRunProperties.bold) formatting.bold = true;
  if (resolvedRunProperties.italic) formatting.italic = true;

  const colorValue =
    resolvedRunProperties.color?.val ?? resolvedRunProperties.color?.['w:val'] ?? resolvedRunProperties.color?.['val'];
  if (colorValue && String(colorValue).toLowerCase() !== 'auto') {
    formatting.color = String(colorValue).replace('#', '');
  }

  const fontSizePx = halfPointsToPixels(resolvedRunProperties.fontSize);
  if (fontSizePx) formatting.fontSize = fontSizePx;

  const fontFamily = resolveFontFamilyForTextBox(resolvedRunProperties.fontFamily, params.docx);
  if (fontFamily) formatting.fontFamily = fontFamily;

  if (resolvedRunProperties.letterSpacing != null) {
    const letterSpacingPx = Number(twipsToPixels(resolvedRunProperties.letterSpacing));
    if (Number.isFinite(letterSpacingPx) && letterSpacingPx !== 0) {
      formatting.letterSpacing = letterSpacingPx;
    }
  }

  return formatting;
}

/**
 * Extracts horizontal alignment from paragraph properties.
 *
 * @param {Object} paragraph - The w:p paragraph element
 * @returns {string|null} Alignment value ('left', 'center', 'right') or null if not found
 */
export function extractParagraphAlignment(paragraph) {
  const pPr = paragraph.elements?.find((el) => el.name === 'w:pPr');
  const jc = pPr?.elements?.find((el) => el.name === 'w:jc');
  if (!jc) return null;

  const jcVal = jc.attributes?.['val'] || jc.attributes?.['w:val'];
  if (jcVal === 'left' || jcVal === 'start') return 'left';
  if (jcVal === 'right' || jcVal === 'end') return 'right';
  if (jcVal === 'center') return 'center';
  return null;
}

/**
 * Extracts text box body properties from wps:bodyPr element.
 *
 * @param {Object|null|undefined} bodyPr - The wps:bodyPr element
 * @returns {Object} Object containing verticalAlign, insets, and wrap properties
 */
export function extractBodyPrProperties(bodyPr) {
  const bodyPrAttrs = bodyPr?.attributes || {};

  // Extract vertical alignment from anchor attribute (t=top, ctr=center, b=bottom)
  // Per OOXML spec, when anchor is not specified, text box defaults to top alignment
  // (confirmed by Word's VML fallback which shows v-text-anchor:top)
  let verticalAlign = 'top'; // Default to top (OOXML spec default)
  const anchorAttr = bodyPrAttrs['anchor'];
  if (anchorAttr === 't') verticalAlign = 'top';
  else if (anchorAttr === 'ctr') verticalAlign = 'center';
  else if (anchorAttr === 'b') verticalAlign = 'bottom';

  // Extract text insets from bodyPr (in EMUs, need to convert to pixels)
  // Default insets in OOXML: left/right = 91440 EMU (~9.6px), top/bottom = 45720 EMU (~4.8px)
  // Conversion formula: pixels = emu * 96 / 914400
  const EMU_TO_PX = 96 / 914400;
  const DEFAULT_HORIZONTAL_INSET_EMU = 91440;
  const DEFAULT_VERTICAL_INSET_EMU = 45720;

  const lIns = bodyPrAttrs['lIns'] != null ? parseFloat(bodyPrAttrs['lIns']) : DEFAULT_HORIZONTAL_INSET_EMU;
  const tIns = bodyPrAttrs['tIns'] != null ? parseFloat(bodyPrAttrs['tIns']) : DEFAULT_VERTICAL_INSET_EMU;
  const rIns = bodyPrAttrs['rIns'] != null ? parseFloat(bodyPrAttrs['rIns']) : DEFAULT_HORIZONTAL_INSET_EMU;
  const bIns = bodyPrAttrs['bIns'] != null ? parseFloat(bodyPrAttrs['bIns']) : DEFAULT_VERTICAL_INSET_EMU;

  const insets = {
    top: tIns * EMU_TO_PX,
    right: rIns * EMU_TO_PX,
    bottom: bIns * EMU_TO_PX,
    left: lIns * EMU_TO_PX,
  };

  // Extract wrap mode (default to 'square' if not specified)
  const wrap = bodyPrAttrs['wrap'] || 'square';

  return { verticalAlign, insets, wrap };
}
