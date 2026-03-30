// @ts-check
import { NodeTranslator } from '@translator';
import { encodeProperties } from '../../utils.js';
import { translator as gridColTranslator } from '../gridCol';
import { twipsToPixels, pixelsToTwips } from '@converter/helpers.js';
import { normalizeTwipWidth, resolveFallbackColumnWidthTwips } from './tblGrid-helpers.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'w:tblGrid';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_ATTR_KEY = 'grid';

// Minimum cell width in twips
const cellMinWidth = pixelsToTwips(10);

/**
 * Encode the w:tblGrid element.
 * @param {import('@translator').SCEncoderConfig} params
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (params) => {
  const { nodes } = params;
  const node = nodes[0];

  // Process property translators
  const attributes = encodeProperties(
    { ...params, nodes: [node] },
    { [gridColTranslator.xmlName]: gridColTranslator },
    true,
  );

  return {
    xmlName: XML_NODE_NAME,
    sdNodeOrKeyName: SD_ATTR_KEY,
    attributes,
  };
};

/**
 * Decode the tableProperties in the table node back into OOXML <w:tblGrid>.
 * @param {import('@translator').SCDecoderConfig} params
 * @returns {import('@translator').SCDecoderResult}
 */
const decode = (params) => {
  const { grid: rawGrid } = params.node.attrs || {};
  const grid = Array.isArray(rawGrid) ? rawGrid : [];
  const { firstRow = {}, preferTableGrid = false, totalColumns: requestedColumns } = params.extraParams || {};

  const cellNodes = firstRow.content?.filter((n) => n.type === 'tableCell' || n.type === 'tableHeader') ?? [];

  let colWidthsFromCellNodes = cellNodes.flatMap((cell) => {
    const spanCount = Math.max(1, cell?.attrs?.colspan ?? 1);
    const colwidth = cell.attrs?.colwidth;
    return Array.from({ length: spanCount }).map((_, span) => (Array.isArray(colwidth) ? colwidth[span] : undefined));
  });

  const columnCountFromCells = colWidthsFromCellNodes.length;
  const gridColumnCount = grid.length;
  let totalColumns = Math.max(columnCountFromCells, gridColumnCount);

  if (typeof requestedColumns === 'number' && Number.isFinite(requestedColumns) && requestedColumns > 0) {
    totalColumns = requestedColumns;
  } else if (preferTableGrid && gridColumnCount > 0) {
    totalColumns = gridColumnCount;
  }

  if (colWidthsFromCellNodes.length > totalColumns) {
    colWidthsFromCellNodes = colWidthsFromCellNodes.slice(0, totalColumns);
  }
  const fallbackColumnWidthTwips = resolveFallbackColumnWidthTwips(params, totalColumns, cellMinWidth);

  // Build the <w:tblGrid> columns
  const elements = [];

  const pushColumn = (widthTwips, { enforceMinimum = false } = {}) => {
    let numericWidth = typeof widthTwips === 'string' ? parseInt(widthTwips, 10) : widthTwips;
    let shouldEnforceMinimum = enforceMinimum;

    if (numericWidth == null || Number.isNaN(numericWidth) || numericWidth <= 0) {
      numericWidth = fallbackColumnWidthTwips;
      shouldEnforceMinimum = true;
    }

    const roundedWidth = Math.round(numericWidth);
    const minimumWidth = shouldEnforceMinimum ? cellMinWidth : 1;
    const safeWidth = Math.max(roundedWidth, minimumWidth);

    const decoded = gridColTranslator.decode({
      node: { type: /** @type {string} */ (gridColTranslator.sdNodeOrKeyName), attrs: { col: safeWidth } },
    });
    if (decoded) elements.push(decoded);
  };

  for (let columnIndex = 0; columnIndex < totalColumns; ++columnIndex) {
    const rawWidth = colWidthsFromCellNodes[columnIndex];
    const cellWidthPixels = typeof rawWidth === 'number' && Number.isFinite(rawWidth) ? rawWidth : Number(rawWidth);
    const hasCellWidth = Number.isFinite(cellWidthPixels) && cellWidthPixels > 0;

    const colGridAttrs = grid?.[columnIndex] || {};
    const gridWidthTwips = normalizeTwipWidth(colGridAttrs.col);
    const gridWidthPixels = gridWidthTwips != null ? twipsToPixels(gridWidthTwips) : null;

    let cellWidthTwips;
    let enforceMinimum = false;
    if (gridWidthTwips != null) {
      cellWidthTwips = gridWidthTwips;
    } else if (hasCellWidth) {
      const tolerance = 0.5;
      if (
        gridWidthTwips != null &&
        gridWidthPixels != null &&
        Math.abs(gridWidthPixels - cellWidthPixels) <= tolerance
      ) {
        cellWidthTwips = gridWidthTwips;
      } else {
        cellWidthTwips = pixelsToTwips(cellWidthPixels);
      }
    } else {
      cellWidthTwips = fallbackColumnWidthTwips;
      enforceMinimum = true;
    }

    pushColumn(cellWidthTwips, { enforceMinimum });
  }

  const newNode = {
    name: XML_NODE_NAME,
    attributes: {},
    elements,
  };

  return newNode;
};

/** @type {import('@translator').NodeTranslatorConfig} */
const config = {
  xmlName: XML_NODE_NAME,
  sdNodeOrKeyName: SD_ATTR_KEY,
  encode,
  decode,
};

/**
 * The NodeTranslator instance for the w:tblPr element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
