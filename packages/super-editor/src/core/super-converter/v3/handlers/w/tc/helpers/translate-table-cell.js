import { pixelsToTwips, inchesToTwips, twipsToPixels } from '@converter/helpers';
import { translateChildNodes } from '@converter/v2/exporter/helpers/index';
import { translator as tcPrTranslator } from '../../tcPr';
import {
  isLegacySchemaDefaultBorders,
  convertBordersToOoxmlFormat,
} from '../../../../../../../extensions/table-cell/helpers/legacyBorderMigration.js';

/**
 * Main translation function for a table cell.
 * @param {import('@converter/exporter').ExportParams} params
 * @returns {import('@converter/exporter').XmlReadyNode}
 */
export function translateTableCell(params) {
  const elements = translateChildNodes({
    ...params,
    tableCell: params.node,
  });

  const cellProps = generateTableCellProperties(params.node);
  elements.unshift(cellProps);

  return {
    name: 'w:tc',
    elements,
  };
}

/**
 * Generate w:tcPr properties node for a table cell
 * @param {import('@converter/exporter').SchemaNode} node
 * @returns {import('@converter/exporter').XmlReadyNode}
 */
export function generateTableCellProperties(node) {
  let tableCellProperties = { ...(node.attrs?.tableCellProperties || {}) };

  const { attrs } = node;

  // Width
  const { colwidth: rawColwidth, widthUnit = 'px' } = attrs;
  const resolvedWidthType =
    attrs.cellWidthType ??
    (attrs.widthType !== 'auto' ? attrs.widthType : undefined) ??
    tableCellProperties.cellWidth?.type ??
    'dxa';

  // Filter to finite numbers to guard against NaN/Infinity/non-numeric entries
  const colwidth = Array.isArray(rawColwidth) ? rawColwidth.filter((v) => Number.isFinite(v)) : [];

  // Skip rewrite when:
  // - colwidth is empty (no data to compute from — preserve original cellWidth)
  // - resolvedWidthType is 'pct' (colwidth is in pixels but type expects fiftieths-of-percent)
  if (colwidth.length > 0 && resolvedWidthType !== 'pct') {
    const colwidthSum = colwidth.reduce((acc, curr) => acc + curr, 0);
    const propertiesWidthPixels = twipsToPixels(tableCellProperties.cellWidth?.value);
    if (propertiesWidthPixels !== colwidthSum) {
      tableCellProperties['cellWidth'] = {
        value: widthUnit === 'px' ? pixelsToTwips(colwidthSum) : inchesToTwips(colwidthSum),
        type: resolvedWidthType,
      };
    }
  }

  // Colspan
  const { colspan } = attrs;
  if (colspan > 1 && tableCellProperties.gridSpan !== colspan) {
    tableCellProperties['gridSpan'] = colspan;
  } else if (!colspan || colspan <= 1) {
    delete tableCellProperties.gridSpan;
  }

  // Background
  const { background = {} } = attrs;
  if (background?.color && tableCellProperties.shading?.fill !== background?.color) {
    tableCellProperties['shading'] = { fill: background.color };
  } else if (!background?.color && tableCellProperties?.shading?.fill) {
    delete tableCellProperties.shading;
  }

  // Margins
  const { cellMargins } = attrs;
  if (cellMargins) {
    ['left', 'right', 'top', 'bottom'].forEach((side) => {
      const key = `margin${side.charAt(0).toUpperCase() + side.slice(1)}`;
      if (cellMargins[side] != null) {
        if (!tableCellProperties.cellMargins) tableCellProperties['cellMargins'] = {};
        let currentPropertyValuePixels = twipsToPixels(tableCellProperties.cellMargins?.[key]?.value);
        if (currentPropertyValuePixels !== cellMargins[side]) {
          tableCellProperties.cellMargins[key] = { value: pixelsToTwips(cellMargins[side]), type: 'dxa' };
        }
      } else if (tableCellProperties?.cellMargins?.[key]) {
        delete tableCellProperties.cellMargins[key];
      }
    });
  }

  const { verticalAlign } = attrs;
  if (verticalAlign && verticalAlign !== tableCellProperties.vAlign) {
    tableCellProperties['vAlign'] = verticalAlign;
  } else if (!verticalAlign && tableCellProperties?.vAlign) {
    delete tableCellProperties.vAlign;
  }

  const { rowspan } = attrs;
  if (rowspan && rowspan > 1) {
    tableCellProperties['vMerge'] = 'restart';
  } else if (attrs.continueMerge) {
    tableCellProperties['vMerge'] = 'continue';
  } else {
    delete tableCellProperties.vMerge;
  }

  // Legacy fallback: if tableCellProperties.borders is absent but attrs.borders
  // has non-default values, migrate them on the fly for export (read-only, no node mutation).
  if (!tableCellProperties?.borders && attrs.borders != null) {
    if (!isLegacySchemaDefaultBorders(attrs.borders)) {
      tableCellProperties = {
        ...(tableCellProperties ?? {}),
        borders: convertBordersToOoxmlFormat(attrs.borders),
      };
    }
  }

  const result = tcPrTranslator.decode({ node: { ...node, attrs: { ...node.attrs, tableCellProperties } } });
  return result;
}
