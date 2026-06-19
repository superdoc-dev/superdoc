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
const DEFAULT_TAB_INTERVAL_TWIPS = 720;

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
    if (node.name === 'w:tbl') {
      paragraphs.push(...flattenTextBoxTableToParagraphs(node));
      return;
    }
    if (Array.isArray(node.elements)) {
      collectTextBoxParagraphs(node.elements, paragraphs);
    }
  });
  return paragraphs;
}

function flattenTextBoxTableToParagraphs(table) {
  const rows = table.elements?.filter((node) => node?.name === 'w:tr') || [];
  if (!rows.length) return [];

  const gridWidths = extractTableGridWidths(table);
  const paragraphs = [];

  rows.forEach((row) => {
    const cells = row.elements?.filter((node) => node?.name === 'w:tc') || [];
    if (!cells.length) return;

    const columnStarts = buildColumnStarts(cells, gridWidths);
    const cellLines = cells.map((cell) => collectTextBoxTableCellLines(cell));
    const maxLineCount = cellLines.reduce((max, lines) => Math.max(max, lines.length), 0);

    for (let lineIndex = 0; lineIndex < maxLineCount; lineIndex += 1) {
      const lineParts = cellLines.map((lines) => lines[lineIndex] || null);
      if (!lineParts.some((line) => line && hasRenderableLineContent(line.elements))) continue;
      paragraphs.push(buildTableVisualLineParagraph(lineParts, columnStarts));
    }
  });

  return paragraphs;
}

function extractTableGridWidths(table) {
  const grid = table.elements?.find((node) => node?.name === 'w:tblGrid');
  return (
    grid?.elements
      ?.filter((node) => node?.name === 'w:gridCol')
      .map((node) => toFiniteNumber(node.attributes?.['w:w'] ?? node.attributes?.w))
      .filter((value) => value != null && value > 0) || []
  );
}

function buildColumnStarts(cells, gridWidths) {
  const starts = [];
  let cursor = 0;
  let gridIndex = 0;

  cells.forEach((cell) => {
    starts.push(cursor);
    const gridSpan = resolveCellGridSpan(cell);
    cursor += resolveCellWidth(cell, gridWidths, gridIndex, gridSpan);
    gridIndex += gridSpan;
  });

  return starts;
}

function resolveCellGridSpan(cell) {
  const tcPr = cell.elements?.find((node) => node?.name === 'w:tcPr');
  const gridSpan = tcPr?.elements?.find((node) => node?.name === 'w:gridSpan');
  const value = toFiniteNumber(gridSpan?.attributes?.['w:val'] ?? gridSpan?.attributes?.val);
  return value && value > 0 ? Math.max(1, Math.floor(value)) : 1;
}

function resolveCellWidth(cell, gridWidths, gridIndex, gridSpan) {
  const gridWidth = sumGridWidths(gridWidths, gridIndex, gridSpan);
  if (gridWidth > 0) return gridWidth;

  const tcPr = cell.elements?.find((node) => node?.name === 'w:tcPr');
  const tcW = tcPr?.elements?.find((node) => node?.name === 'w:tcW');
  const width = toFiniteNumber(tcW?.attributes?.['w:w'] ?? tcW?.attributes?.w);
  return width && width > 0 ? width : 0;
}

function sumGridWidths(gridWidths, gridIndex, gridSpan) {
  if (!Array.isArray(gridWidths) || gridWidths.length === 0) return 0;

  let width = 0;
  for (let offset = 0; offset < gridSpan; offset += 1) {
    const gridWidth = gridWidths[gridIndex + offset];
    if (gridWidth != null && gridWidth > 0) {
      width += gridWidth;
    }
  }
  return width;
}

function collectTextBoxTableCellLines(cell) {
  const paragraphNodes = [];
  collectTextBoxParagraphsSkippingTables(cell.elements || [], paragraphNodes);
  return paragraphNodes.flatMap((paragraph) => splitTextBoxParagraphIntoVisualLines(paragraph));
}

function collectTextBoxParagraphsSkippingTables(nodes, paragraphs) {
  if (!Array.isArray(nodes)) return;
  nodes.forEach((node) => {
    if (!node) return;
    if (node.name === 'w:p') {
      paragraphs.push(node);
      return;
    }
    if (node.name === 'w:tbl') return;
    if (Array.isArray(node.elements)) {
      collectTextBoxParagraphsSkippingTables(node.elements, paragraphs);
    }
  });
}

function splitTextBoxParagraphIntoVisualLines(paragraph) {
  const pPr = paragraph.elements?.find((node) => node?.name === 'w:pPr') || null;
  const lines = [{ pPr, elements: [] }];

  const appendToCurrentLine = (element) => {
    lines[lines.length - 1].elements.push(element);
  };

  for (const element of paragraph.elements || []) {
    if (!element || element.name === 'w:pPr') continue;
    if (element.name !== 'w:r' || !Array.isArray(element.elements)) {
      appendToCurrentLine(carbonCopy(element));
      continue;
    }

    splitRunAroundBreaks(element, appendToCurrentLine, () => {
      lines.push({ pPr, elements: [] });
    });
  }

  while (lines.length > 1 && !hasRenderableLineContent(lines[lines.length - 1].elements)) {
    lines.pop();
  }

  return lines;
}

function splitRunAroundBreaks(run, appendRun, startNewLine) {
  let runElements = [];
  const runProperties = run.elements?.filter((node) => node?.name === 'w:rPr').map((node) => carbonCopy(node)) || [];

  const flushRun = () => {
    const meaningfulElements = runElements.filter((node) => node?.name !== 'w:rPr');
    if (!meaningfulElements.length) {
      runElements = runProperties.map((node) => carbonCopy(node));
      return;
    }

    appendRun({
      ...carbonCopy(run),
      elements: runElements,
    });
    runElements = runProperties.map((node) => carbonCopy(node));
  };

  run.elements.forEach((child) => {
    if (child?.name === 'w:br') {
      flushRun();
      startNewLine();
      return;
    }
    runElements.push(carbonCopy(child));
  });

  flushRun();
}

function buildTableVisualLineParagraph(lineParts, columnStarts) {
  const baseLine = lineParts.find((line) => line?.pPr) || lineParts.find(Boolean);
  const pPr = buildVisualLineParagraphProperties(baseLine?.pPr, lineParts, columnStarts);
  const elements = pPr ? [pPr] : [];

  lineParts.forEach((line, index) => {
    if (!line || !hasRenderableLineContent(line.elements)) return;
    if (index > 0) elements.push(createTabRun());
    elements.push(...line.elements.map((element) => carbonCopy(element)));
  });

  return { name: 'w:p', elements };
}

function buildVisualLineParagraphProperties(basePPr, lineParts, columnStarts) {
  const pPr = basePPr ? carbonCopy(basePPr) : { name: 'w:pPr', elements: [] };
  pPr.elements = (pPr.elements || []).filter((node) => node?.name !== 'w:tabs');

  const tabStops = [];
  lineParts.forEach((line, index) => {
    const columnStart = columnStarts[index] || 0;
    if (index > 0 && columnStart > 0 && line && hasRenderableLineContent(line.elements)) {
      tabStops.push(createTabStop(columnStart));
    }

    const sourceTabs = extractTabs(line?.pPr);
    let positionedSourceTabCount = 0;
    sourceTabs.forEach((tab) => {
      const pos = toFiniteNumber(tab.attributes?.['w:pos'] ?? tab.attributes?.pos);
      if (pos == null) return;
      positionedSourceTabCount += 1;
      tabStops.push(createTabStop(columnStart + pos, tab.attributes));
    });

    const tabRunCount = countTabRuns(line?.elements);
    for (let tabIndex = positionedSourceTabCount; tabIndex < tabRunCount; tabIndex += 1) {
      tabStops.push(createTabStop(resolveDefaultInternalTabPos(columnStart, tabIndex)));
    }
  });

  if (tabStops.length > 0) {
    pPr.elements.push({ name: 'w:tabs', elements: dedupeTabStops(tabStops) });
  }

  return pPr.elements.length > 0 ? pPr : null;
}

function extractTabs(pPr) {
  const tabs = pPr?.elements?.find((node) => node?.name === 'w:tabs');
  return tabs?.elements?.filter((node) => node?.name === 'w:tab') || [];
}

function countTabRuns(elements = []) {
  return elements.reduce((count, element) => {
    if (element?.name === 'w:tab') return count + 1;
    if (Array.isArray(element?.elements)) return count + countTabRuns(element.elements);
    return count;
  }, 0);
}

function resolveDefaultInternalTabPos(columnStart, tabIndex) {
  return columnStart + DEFAULT_TAB_INTERVAL_TWIPS * (tabIndex + 1);
}

function createTabRun() {
  return { name: 'w:r', elements: [{ name: 'w:tab' }] };
}

function createTabStop(pos, sourceAttributes = {}) {
  return {
    name: 'w:tab',
    attributes: {
      ...sourceAttributes,
      'w:val': sourceAttributes['w:val'] || sourceAttributes.val || 'left',
      'w:pos': String(pos),
    },
  };
}

function dedupeTabStops(tabStops) {
  const seen = new Set();
  return tabStops
    .filter((tab) => {
      const key = `${tab.attributes?.['w:val'] || ''}:${tab.attributes?.['w:pos'] || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Number(a.attributes?.['w:pos'] || 0) - Number(b.attributes?.['w:pos'] || 0));
}

function hasRenderableLineContent(elements) {
  return elements.some((element) => {
    if (element?.name === 'w:tab') return true;
    if (element?.name === 'w:t') return true;
    return Array.isArray(element?.elements) && hasRenderableLineContent(element.elements);
  });
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
