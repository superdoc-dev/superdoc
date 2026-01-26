// @ts-check
import { NodeTranslator } from '@translator';
import { twipsToPixels, eighthPointsToPixels, halfPointToPoints } from '@core/super-converter/helpers.js';
import { preProcessVerticalMergeCells } from '@core/super-converter/export-helpers/pre-process-vertical-merge-cells.js';
import { translateChildNodes } from '@core/super-converter/v2/exporter/helpers/index.js';
import { translator as trTranslator } from '../tr';
import { translator as tblPrTranslator } from '../tblPr';
import { translator as tblGridTranslator } from '../tblGrid';
import { translator as tblStylePrTranslator } from '@converter/v3/handlers/w/tblStylePr';
import { buildFallbackGridForTable } from '@core/super-converter/helpers/tableFallbackHelpers.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'w:tbl';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'table';

/** Tolerance in twips for matching cell width sum to grid + indent. Accounts for rounding in Word. */
const INDENT_TWIPS_TOLERANCE = 5;

/**
 * Sum all column widths from a tblGrid encoded grid array.
 * @param {Array<{col: number | string}>} columns - Grid columns with col width in twips
 * @returns {number} Total width in twips
 */
const sumColumnTwips = (columns = []) =>
  columns.reduce((sum, col) => {
    const raw = col?.col;
    const value = typeof raw === 'number' ? raw : Number.parseInt(raw, 10);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);

/**
 * Sum tcW widths from all cells in the first table row containing cells.
 * Returns null if any cell lacks a valid width (indicates unreliable data).
 * @param {Array<Object>} rows - XML row elements (w:tr)
 * @returns {number | null} Total cell width in twips, or null if incomplete
 */
const getFirstRowCellWidthSumTwips = (rows = []) => {
  const firstRow = rows.find((row) => row?.elements?.some((el) => el.name === 'w:tc'));
  if (!firstRow?.elements) return null;

  const cells = firstRow.elements.filter((el) => el.name === 'w:tc');
  if (!cells.length) return null;

  let sum = 0;
  for (const cell of cells) {
    const tcPr = cell.elements?.find((el) => el.name === 'w:tcPr');
    const tcW = tcPr?.elements?.find((el) => el.name === 'w:tcW');
    const rawWidth = tcW?.attributes?.['w:w'];
    const width = typeof rawWidth === 'number' ? rawWidth : Number.parseInt(rawWidth, 10);
    if (!Number.isFinite(width)) return null;
    sum += width;
  }

  return sum;
};

/**
 * Encode a w:tbl element as a SuperDoc 'table' node.
 * @param {import('@translator').SCEncoderConfig} [params]
 * @param {import('@translator').EncodedAttributes} [encodedAttrs] - The already encoded attributes
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (params, encodedAttrs) => {
  const { nodes } = params;
  const node = nodes[0];

  // Table properties
  const tblPr = node.elements.find((el) => el.name === 'w:tblPr');
  if (tblPr) {
    const encodedProperties = tblPrTranslator.encode({ ...params, nodes: [tblPr] });
    encodedAttrs['tableProperties'] = encodedProperties || {};
  } else {
    encodedAttrs['tableProperties'] ||= {};
  }

  // Table grid
  const tblGrid = node.elements.find((el) => el.name === 'w:tblGrid');
  if (tblGrid) {
    encodedAttrs['grid'] = tblGridTranslator.encode({ ...params, nodes: [tblGrid] }).attributes;
  }

  // Pull out a few table properties for easier access
  [
    'tableStyleId',
    'justification',
    'tableLayout',
    ['tableIndent', ({ value, type }) => ({ width: twipsToPixels(value), type })],
    ['tableCellSpacing', ({ value, type }) => ({ w: String(value), type })],
  ].forEach((prop) => {
    /** @type {string} */
    let key;
    /** @type {(v: any) => any | null} */
    let transform;
    if (Array.isArray(prop)) {
      // @ts-expect-error - Array destructuring with mixed tuple types (string and transform function)
      [key, transform] = prop;
    } else {
      key = prop;
      transform = (v) => v;
    }

    if (encodedAttrs.tableProperties[key]) {
      encodedAttrs[key] = transform(encodedAttrs.tableProperties[key]);
    }
  });

  if (encodedAttrs.tableCellSpacing) {
    encodedAttrs['borderCollapse'] = 'separate';
  }

  if (encodedAttrs.tableProperties.tableWidth) {
    const tableWidthMeasurement = encodedAttrs.tableProperties.tableWidth;
    const widthPx = twipsToPixels(tableWidthMeasurement.value);
    if (widthPx != null) {
      encodedAttrs.tableWidth = {
        width: widthPx,
        type: tableWidthMeasurement.type,
      };
    } else if (tableWidthMeasurement.type === 'auto') {
      encodedAttrs.tableWidth = {
        width: 0,
        type: tableWidthMeasurement.type,
      };
    }
  }

  const tableLook = encodedAttrs.tableProperties.tblLook;
  // Table borders can be specified in tblPr or inside a referenced style tag
  const borderProps = _processTableBorders(encodedAttrs.tableProperties.borders || {});
  const referencedStyles = _getReferencedTableStyles(encodedAttrs.tableStyleId, params) || {};

  encodedAttrs.borders = { ...referencedStyles.borders, ...borderProps };
  encodedAttrs.tableProperties.cellMargins = referencedStyles.cellMargins = {
    ...referencedStyles.cellMargins,
    ...encodedAttrs.tableProperties.cellMargins,
  };

  // Process each row
  const rows = node.elements.filter((el) => el.name === 'w:tr');
  let columnWidths = Array.isArray(encodedAttrs['grid'])
    ? encodedAttrs['grid'].map((item) => twipsToPixels(item.col))
    : [];

  const tableIndentTwips = encodedAttrs.tableProperties?.tableIndent?.value;
  const hasIndent = Number.isFinite(tableIndentTwips) && tableIndentTwips !== 0;
  const hasExplicitGrid = Boolean(tblGrid);
  const gridTwipsTotal = hasExplicitGrid ? sumColumnTwips(encodedAttrs['grid']) : null;
  const rowTcWTwipsTotal = hasExplicitGrid && hasIndent ? getFirstRowCellWidthSumTwips(rows) : null;
  const indentDiff = rowTcWTwipsTotal != null && gridTwipsTotal != null ? rowTcWTwipsTotal - gridTwipsTotal : null;
  const preferTableGridWidths =
    hasExplicitGrid &&
    hasIndent &&
    gridTwipsTotal != null &&
    rowTcWTwipsTotal != null &&
    Math.sign(indentDiff) === Math.sign(tableIndentTwips) &&
    Math.abs(indentDiff - tableIndentTwips) <= INDENT_TWIPS_TOLERANCE;

  if (!columnWidths.length) {
    const fallback = buildFallbackGridForTable({
      params,
      rows,
      tableWidth: encodedAttrs.tableWidth,
      tableWidthMeasurement: encodedAttrs.tableProperties.tableWidth,
    });
    if (fallback) {
      encodedAttrs.grid = fallback.grid;
      columnWidths = fallback.columnWidths;
    }
  }

  const content = [];
  const totalColumns = columnWidths.length;
  const totalRows = rows.length;
  const activeRowSpans = totalColumns > 0 ? new Array(totalColumns).fill(0) : [];
  rows.forEach((row, rowIndex) => {
    const result = trTranslator.encode({
      ...params,
      path: [...(params.path || []), node],
      nodes: [row],
      extraParams: {
        row,
        table: node,
        tableProperties: encodedAttrs.tableProperties,
        tableBorders: encodedAttrs.borders,
        tableLook,
        columnWidths,
        activeRowSpans: activeRowSpans.slice(),
        rowIndex,
        totalRows,
        totalColumns,
        preferTableGridWidths,
        _referencedStyles: referencedStyles,
      },
    });
    if (result) {
      content.push(result);

      if (totalColumns > 0) {
        // Preserve the current-row occupancy so column advancement still skips cells covered by active rowspans.
        const activeRowSpansForCurrentRow = activeRowSpans.slice();

        // Consume one row of coverage for any column that was spanning into this row.
        for (let col = 0; col < totalColumns; col++) {
          if (activeRowSpans[col] > 0) {
            activeRowSpans[col] -= 1;
          }
        }

        // Start at the zeroth column; trTranslator already emitted placeholders for any gridBefore spacing.
        let columnIndex = 0;

        const advanceColumnIndex = () => {
          // Skip over columns that are still occupied in the current row (pre-decrement state).
          while (columnIndex < totalColumns && activeRowSpansForCurrentRow[columnIndex] > 0) {
            columnIndex += 1;
          }
        };

        advanceColumnIndex();

        result.content?.forEach((cell) => {
          advanceColumnIndex();
          const colspan = Math.max(1, cell.attrs?.colspan || 1);
          const rowspan = Math.max(1, cell.attrs?.rowspan || 1);

          if (rowspan > 1) {
            for (let offset = 0; offset < colspan && columnIndex + offset < totalColumns; offset++) {
              const targetIndex = columnIndex + offset;
              const remainingRows = rowspan - 1;
              // Track the maximum remaining rowspan so future rows know this column is blocked.
              if (remainingRows > 0 && remainingRows > activeRowSpans[targetIndex]) {
                activeRowSpans[targetIndex] = remainingRows;
              }
            }
          }

          columnIndex += colspan;
          advanceColumnIndex();
        });
      }
    }
  });

  return {
    type: 'table',
    content,
    attrs: encodedAttrs,
  };
};

/**
 * Decode the table node back into OOXML <w:tbl>.
 * @param {import('@translator').SCDecoderConfig} params
 * @param {import('@translator').DecodedAttributes} [decodedAttrs] - The already decoded attributes
 * @returns {import('@translator').SCDecoderResult}
 */
const decode = (params, decodedAttrs) => {
  // @ts-expect-error - preProcessVerticalMergeCells expects ProseMirror table shape, but receives SuperDoc node
  params.node = preProcessVerticalMergeCells(params.node, params);
  const { node } = params;
  const rawGrid = node.attrs?.grid;
  const grid = Array.isArray(rawGrid) ? rawGrid : [];
  const preferTableGrid = node.attrs?.userEdited !== true && grid.length > 0;
  const totalColumns = preferTableGrid ? grid.length : undefined;
  const extraParams = {
    ...(params.extraParams || {}),
    preferTableGrid,
    totalColumns,
  };

  const elements = translateChildNodes({ ...params, extraParams });

  // Table grid - generate if not present
  const firstRow = node.content?.find((n) => n.type === 'tableRow');
  const element = tblGridTranslator.decode({
    ...params,
    node: { ...node, attrs: { ...node.attrs, grid } },
    extraParams: {
      ...extraParams,
      firstRow,
    },
  });
  if (element) elements.unshift(element);

  // Table properties
  if (node.attrs?.tableProperties) {
    const properties = { ...node.attrs.tableProperties };
    const element = tblPrTranslator.decode({
      ...params,
      node: { ...node, attrs: { ...node.attrs, tableProperties: properties } },
    });
    if (element) elements.unshift(element);
  }

  return {
    name: 'w:tbl',
    attributes: decodedAttrs || {},
    elements,
  };
};

/**
 * Process the table borders
 * @param {Object[]} [rawBorders] The raw border properties from the `tableProperties` attribute
 * @returns {Record<string,unknown>}
 */
export function _processTableBorders(rawBorders) {
  const /** @type {Record<string,unknown>} */ borders = {};
  Object.entries(rawBorders).forEach(([name, attributes]) => {
    const attrs = {};
    const color = attributes.color;
    const size = attributes.size;
    const val = attributes.val;
    if (color && color !== 'auto') attrs['color'] = color.startsWith('#') ? color : `#${color}`;
    if (size && size !== 'auto') attrs['size'] = eighthPointsToPixels(size);
    if (val) attrs['val'] = val;

    borders[name] = attrs;
  });

  return borders;
}

/**
 * @typedef {{borders?: {}, name?: *, justification?: *, fonts?: {}, fontSize?: *, rowBorders?: {}, cellMargins?: {}}} TableStyles
 */

/**
 *
 * @param {string|null} tableStyleReference
 * @param {import('@translator').SCEncoderConfig} [params]
 * @returns {TableStyles|null}
 */
export function _getReferencedTableStyles(tableStyleReference, params) {
  if (!tableStyleReference) return null;

  const stylesToReturn = {};

  // Find the style tag in styles.xml
  const { docx } = params;
  const styles = docx['word/styles.xml'];
  const { elements } = styles.elements[0];
  const styleElements = elements.filter((el) => el.name === 'w:style');
  const styleTag = styleElements.find((el) => el.attributes['w:styleId'] === tableStyleReference);
  if (!styleTag) return null;

  stylesToReturn.name = styleTag.elements.find((el) => el.name === 'w:name');

  // Find style it is based on, if any, to inherit table properties from
  const basedOn = styleTag.elements.find((el) => el.name === 'w:basedOn');
  let baseTblPr;
  if (basedOn?.attributes) {
    const baseStyles = styleElements.find((el) => el.attributes['w:styleId'] === basedOn.attributes['w:val']);
    baseTblPr = baseStyles ? baseStyles.elements.find((el) => el.name === 'w:tblPr') : {};
  }

  // Find paragraph properties to get justification
  const pPr = styleTag.elements.find((el) => el.name === 'w:pPr');
  if (pPr) {
    const justification = pPr.elements.find((el) => el.name === 'w:jc');
    if (justification?.attributes) stylesToReturn.justification = justification.attributes['w:val'];
  }

  // Find run properties to get fonts and font size
  const rPr = styleTag?.elements.find((el) => el.name === 'w:rPr');
  if (rPr) {
    const fonts = rPr.elements.find((el) => el.name === 'w:rFonts');
    if (fonts) {
      const { 'w:ascii': ascii, 'w:hAnsi': hAnsi, 'w:cs': cs } = fonts.attributes;
      stylesToReturn.fonts = { ascii, hAnsi, cs };
    }

    const fontSize = rPr.elements.find((el) => el.name === 'w:sz');
    if (fontSize?.attributes) stylesToReturn.fontSize = halfPointToPoints(fontSize.attributes['w:val']) + 'pt';
  }

  // Find table properties to get borders and cell margins
  const tblPr = styleTag.elements.find((el) => el.name === 'w:tblPr');
  if (tblPr && tblPr.elements) {
    if (baseTblPr && baseTblPr.elements) {
      tblPr.elements = [...baseTblPr.elements, ...tblPr.elements];
    }
    const tableProperties = tblPrTranslator.encode({ ...params, nodes: [tblPr] });
    if (tableProperties) {
      const borders = _processTableBorders(tableProperties.borders || {});

      if (borders || Object.keys(borders).length) stylesToReturn.borders = borders;

      const cellMargins = {};
      Object.entries(tableProperties.cellMargins || {}).forEach(([key, attrs]) => {
        if (attrs?.value != null) {
          cellMargins[key] = {
            value: attrs.value,
            type: attrs.type || 'dxa',
          };
        }
      });
      if (Object.keys(cellMargins).length) stylesToReturn.cellMargins = cellMargins;
    }
  }

  const tblStylePr = styleTag.elements.filter((el) => el.name === 'w:tblStylePr');
  let styleProps = {};
  if (tblStylePr) {
    styleProps = tblStylePr.reduce((acc, el) => {
      acc[el.attributes['w:type']] = tblStylePrTranslator.encode({ ...params, nodes: [el] });
      return acc;
    }, {});
  }

  return {
    ...stylesToReturn,
    ...styleProps,
  };
}

/**
 * Restore vertically merged cells from a table
 * @param {Object} table The table node
 * @param {Object} editorSchema The editor schema
 * @returns {Object} The table node with merged cells restored
 */
/** @type {import('@translator').NodeTranslatorConfig} */
export const config = {
  xmlName: XML_NODE_NAME,
  sdNodeOrKeyName: SD_NODE_NAME,
  type: NodeTranslator.translatorTypes.NODE,
  encode,
  decode,
  attributes: [],
};

/**
 * The NodeTranslator instance for the passthrough element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
