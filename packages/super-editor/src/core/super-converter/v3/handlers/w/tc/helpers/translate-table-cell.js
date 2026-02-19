import {
  pixelsToTwips,
  inchesToTwips,
  pixelsToEightPoints,
  twipsToPixels,
  eighthPointsToPixels,
} from '@converter/helpers';
import { translateChildNodes } from '@converter/v2/exporter/helpers/index';
import { translator as tcPrTranslator } from '../../tcPr';

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
  const tableCellProperties = { ...(node.attrs?.tableCellProperties || {}) };

  const { attrs } = node;

  // Width
  const { colwidth = [], cellWidthType = 'dxa', widthUnit } = attrs;
  const colwidthSum = colwidth.reduce((acc, curr) => acc + curr, 0);
  const propertiesWidthPixels = twipsToPixels(tableCellProperties.cellWidth?.value);
  if (propertiesWidthPixels !== colwidthSum) {
    // If the value has changed, update it
    tableCellProperties['cellWidth'] = {
      value: widthUnit === 'px' ? pixelsToTwips(colwidthSum) : inchesToTwips(colwidthSum),
      type: cellWidthType,
    };
  }

  // Colspan
  const { colspan } = attrs;
  if (colspan > 1 && tableCellProperties.gridSpan !== colspan) {
    tableCellProperties['gridSpan'] = colspan;
  } else if (!colspan || tableCellProperties?.gridSpan === 1) {
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
  const hasExistingVMerge = tableCellProperties.vMerge != null;
  if (rowspan && rowspan > 1) {
    tableCellProperties['vMerge'] = 'restart';
  } else if (attrs.continueMerge) {
    tableCellProperties['vMerge'] = 'continue';
  } else if (!hasExistingVMerge) {
    delete tableCellProperties.vMerge;
  }

  const { borders = {} } = attrs;
  if (!!borders && Object.keys(borders).length) {
    ['top', 'bottom', 'left', 'right'].forEach((side) => {
      if (borders[side]) {
        let currentPropertyValue = tableCellProperties.borders?.[side];
        let currentPropertySizePixels = eighthPointsToPixels(currentPropertyValue?.size);
        let color = borders[side].color;
        if (borders[side].color && color === '#000000') {
          color = 'auto';
        }
        if (
          currentPropertySizePixels !== borders[side].size ||
          currentPropertyValue?.color !== color ||
          borders[side].val !== currentPropertyValue?.val
        ) {
          if (!tableCellProperties.borders) tableCellProperties['borders'] = {};
          tableCellProperties.borders[side] = {
            size: pixelsToEightPoints(borders[side].size || 0),
            color: color,
            space: borders[side].space || 0,
            val: borders[side].val || 'single',
          };
        }
      } else if (tableCellProperties.borders?.[side]) {
        delete tableCellProperties.borders[side];
      }
    });
  } else if (tableCellProperties?.borders) {
    delete tableCellProperties.borders;
  }

  const result = tcPrTranslator.decode({ node: { ...node, attrs: { ...node.attrs, tableCellProperties } } });
  return result;
}
