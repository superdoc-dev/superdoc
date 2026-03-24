import { twipsToPixels, resolveShadingFillColor } from '@converter/helpers';
import { translator as tcPrTranslator } from '../../tcPr';
import { isInlineNode } from '../../../helpers/is-inline-node.js';

/**
 * @param {Object} options
 * @returns {{type: string, content: (*|*[]), attrs: {}}}
 */
export function handleTableCellNode({
  params,
  node,
  table,
  row,
  tableProperties,
  columnIndex,
  columnWidth = null,
  allColumnWidths = [],
  preferTableGridWidths = false,
  _referencedStyles,
}) {
  const { nodeListHandler } = params;
  const attributes = {};
  const referencedStyles = _referencedStyles ?? { fontSize: null, fonts: {}, cellMargins: {} };

  // Table Cell Properties
  const tcPr = node.elements.find((el) => el.name === 'w:tcPr');
  const tableCellProperties = tcPr ? (tcPrTranslator.encode({ ...params, nodes: [tcPr] }) ?? {}) : {};
  attributes['tableCellProperties'] = tableCellProperties;

  // Colspan
  const colspan = parseInt(tableCellProperties.gridSpan || 1, 10);
  if (colspan > 1) attributes['colspan'] = colspan;

  // Width
  let width = null;
  const widthType = tableCellProperties.cellWidth?.type;
  if (!preferTableGridWidths) {
    // For percentage widths, don't convert to px here; allow table/grid widths to drive layout.
    if (widthType !== 'pct') {
      width = tableCellProperties.cellWidth?.value ? twipsToPixels(tableCellProperties.cellWidth?.value) : null;
    }
  }
  if (widthType) attributes['widthType'] = widthType;

  const cellOwnWidth = width; // tcW-derived width (before grid fallback)
  if (!width && columnWidth) width = columnWidth;
  if (width) {
    attributes['colwidth'] = [width];
    attributes['widthUnit'] = 'px';

    const defaultColWidths = allColumnWidths;
    const hasDefaultColWidths = allColumnWidths && allColumnWidths.length > 0;

    if (colspan > 1 && hasDefaultColWidths) {
      let colwidth = [];
      // When cell has its own tcW width that exceeds the grid span total,
      // distribute tcW proportionally across grid columns to match Word behavior.
      // Only scale UP (tcW > grid), not down — smaller tcW is just a minimum.
      const gridSpanTotal = defaultColWidths
        .slice(columnIndex, columnIndex + colspan)
        .reduce((sum, w) => sum + (w || 0), 0);
      const shouldScale = cellOwnWidth && gridSpanTotal > 0 && cellOwnWidth > gridSpanTotal + 1;

      for (let i = 0; i < colspan; i++) {
        let colwidthValue = defaultColWidths[columnIndex + i];
        let defaultColwidth = 100;

        if (typeof colwidthValue !== 'undefined') {
          colwidth.push(
            shouldScale ? Math.round(colwidthValue * (cellOwnWidth / gridSpanTotal) * 1000) / 1000 : colwidthValue,
          );
        } else {
          colwidth.push(defaultColwidth);
        }
      }

      if (colwidth.length) {
        attributes['colwidth'] = [...colwidth];
      }
    }
  }

  // Background
  const backgroundColor =
    resolveShadingFillColor(tableCellProperties.shading) ?? resolveShadingFillColor(tableProperties?.shading);
  const background = { color: backgroundColor };

  // TODO: Do we need other background attrs?
  if (background.color) attributes['background'] = background;

  // Vertical Align
  const verticalAlign = tableCellProperties.vAlign;
  if (verticalAlign) attributes['verticalAlign'] = verticalAlign;

  // Cell Margins
  attributes.cellMargins = getTableCellMargins(tableCellProperties.cellMargins, referencedStyles);

  // Font size and family
  const { fontSize, fonts = {} } = referencedStyles;
  const fontFamily = fonts['ascii'];
  if (fontSize) attributes['fontSize'] = fontSize;
  if (fontFamily) attributes['fontFamily'] = fontFamily;

  // Rowspan - tables can have vertically merged cells
  if (tableCellProperties.vMerge === 'restart') {
    const rows = table.elements.filter((el) => el.name === 'w:tr');
    const currentRowIndex = rows.findIndex((r) => r === row);
    const remainingRows = rows.slice(currentRowIndex + 1);
    let rowspan = 1;
    const startColumn = Number.isFinite(columnIndex) ? columnIndex : 0;

    // Continue the merge by matching cells on the logical table grid, not by raw tc index.
    // This keeps vertical merges aligned when rows have gridBefore or different preceding spans.
    for (let remainingRow of remainingRows) {
      const cellAtColumn = findTableCellAtColumn(remainingRow, startColumn);

      if (!cellAtColumn) break;

      const vMerge = getTableCellVMerge(cellAtColumn);

      if (!vMerge || vMerge === 'restart') {
        // We have reached the end of the vertically merged cells
        break;
      }

      // This cell is part of a merged cell. Mark it consumed so the row encoder skips it
      // but still advances the column index (grid geometry is preserved).
      rowspan++;
      markTableCellAsVMergeConsumed(cellAtColumn);
    }
    attributes['rowspan'] = rowspan;
  }

  return {
    type: 'tableCell',
    content: normalizeTableCellContent(
      nodeListHandler.handler({
        ...params,
        nodes: node.elements,
        path: [...(params.path || []), node],
      }),
      params.editor,
    ),
    attrs: attributes,
  };
}

function normalizeTableCellContent(content, editor) {
  if (!Array.isArray(content) || content.length === 0) return content;

  const normalized = [];
  const pendingForNextBlock = [];

  const cloneBlock = (node) => {
    if (!node) return node;
    const cloned = { ...node };
    if (Array.isArray(node.content)) {
      cloned.content = [...node.content];
    } else if (!('content' in node)) {
      // Leave undefined; will be set only if needed
    }
    return cloned;
  };

  const ensureArray = (node) => {
    if (!Array.isArray(node.content)) {
      node.content = [];
    }
    return node.content;
  };

  for (const node of content) {
    if (!node || typeof node.type !== 'string') {
      normalized.push(node);
      continue;
    }

    if (!isInlineNode(node, editor?.schema)) {
      const blockNode = cloneBlock(node);
      if (pendingForNextBlock.length) {
        const blockContent = ensureArray(blockNode);
        const leadingInline = pendingForNextBlock.splice(0);
        blockNode.content = [...leadingInline, ...blockContent];
      } else if (Array.isArray(blockNode.content)) {
        blockNode.content = [...blockNode.content];
      }

      normalized.push(blockNode);
      continue;
    }

    const targetIsNextBlock = node.type === 'bookmarkStart' || normalized.length === 0;
    if (targetIsNextBlock) {
      pendingForNextBlock.push(node);
    } else {
      const lastIndex = normalized.length - 1;
      const lastNode = normalized[lastIndex];
      if (!lastNode || typeof lastNode.type !== 'string' || isInlineNode(lastNode, editor?.schema)) {
        pendingForNextBlock.push(node);
        continue;
      }

      const blockContent = ensureArray(lastNode);
      if (pendingForNextBlock.length) {
        blockContent.push(...pendingForNextBlock.splice(0));
      }
      blockContent.push(node);
    }
  }

  if (pendingForNextBlock.length) {
    if (normalized.length) {
      const lastIndex = normalized.length - 1;
      const lastNode = normalized[lastIndex];
      if (lastNode && typeof lastNode.type === 'string' && !isInlineNode(lastNode, editor?.schema)) {
        const blockContent = ensureArray(lastNode);
        blockContent.push(...pendingForNextBlock);
        pendingForNextBlock.length = 0;
      }
    }

    if (pendingForNextBlock.length) {
      normalized.push({
        type: 'paragraph',
        attrs: {},
        content: [...pendingForNextBlock],
      });
      pendingForNextBlock.length = 0;
    }
  }

  return normalized;
}

const getTableCellVMerge = (node) => {
  const tcPr = node.elements.find((el) => el.name === 'w:tcPr');
  const vMerge = tcPr?.elements?.find((el) => el.name === 'w:vMerge');
  if (!vMerge) return null;
  return vMerge.attributes?.['w:val'] || 'continue';
};

const getGridBefore = (row) => {
  const trPr = row.elements?.find((el) => el.name === 'w:trPr');
  const gridBefore = trPr?.elements?.find((el) => el.name === 'w:gridBefore');
  const raw = gridBefore?.attributes?.['w:val'];
  const value = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const getTableCellGridSpan = (node) => {
  if (!node || node.name !== 'w:tc') return 1;
  const tcPr = node.elements?.find((el) => el.name === 'w:tcPr');
  const gridSpan = tcPr?.elements?.find((el) => el.name === 'w:gridSpan');
  const raw = gridSpan?.attributes?.['w:val'];
  const value = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(value) && value > 0 ? value : 1;
};

const findTableCellAtColumn = (row, targetColumn) => {
  const cells = row.elements?.filter((el) => el.name === 'w:tc') ?? [];
  let currentColumn = getGridBefore(row);

  for (const cell of cells) {
    const colSpan = getTableCellGridSpan(cell);
    if (targetColumn >= currentColumn && targetColumn < currentColumn + colSpan) {
      return cell._vMergeConsumed ? null : cell;
    }
    currentColumn += colSpan;
  }

  return null;
};

/** Mark a w:tc as consumed by a vertical merge so the row encoder skips it. */
const markTableCellAsVMergeConsumed = (node) => {
  if (node?.name === 'w:tc') {
    node._vMergeConsumed = true;
  }
};

/**
 * Process the margins for a table cell
 * @param {Object} inlineMargins
 * @param {Object} referencedStyles
 * @returns
 */
const getTableCellMargins = (inlineMargins, referencedStyles) => {
  const { cellMargins = {} } = referencedStyles;
  return ['left', 'right', 'top', 'bottom'].reduce((acc, direction) => {
    const key = `margin${direction.charAt(0).toUpperCase() + direction.slice(1)}`;
    const inlineValue = inlineMargins ? inlineMargins?.[key]?.value : null;
    const styleValue = cellMargins ? cellMargins[key] : null;
    if (inlineValue != null) {
      acc[direction] = twipsToPixels(inlineValue);
    } else if (styleValue == null) {
      acc[direction] = undefined;
    } else if (typeof styleValue === 'object') {
      acc[direction] = twipsToPixels(styleValue.value);
    } else {
      acc[direction] = twipsToPixels(styleValue);
    }
    return acc;
  }, {});
};
