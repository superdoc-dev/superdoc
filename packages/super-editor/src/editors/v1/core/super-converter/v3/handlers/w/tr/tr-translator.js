// @ts-check
import { NodeTranslator } from '@translator';
import { twipsToPixels, pixelsToTwips } from '@core/super-converter/helpers.js';
import { createAttributeHandler } from '@converter/v3/handlers/utils.js';

import { translateChildNodes } from '@core/super-converter/v2/exporter/helpers/index.js';
import { translator as tcTranslator } from '../tc';
import { translator as tblBordersTranslator } from '../tblBorders';
import { translator as trPrTranslator } from '../trPr';
import { advancePastRowSpans, fillPlaceholderColumns, isPlaceholderCell } from './tr-helpers.js';
import { normalizeRowCellChildren } from './row-cell-children.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'w:tr';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'tableRow';

/**
 * The attributes that can be mapped between OOXML and SuperDoc.
 * Note: These are specifically OOXML valid attributes for a given node.
 * @type {import('@translator').AttrConfig[]}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 472
 */
const validXmlAttributes = ['w:rsidDel', 'w:rsidR', 'w:rsidRPr', 'w:rsidTr', 'w14:paraId', 'w14:textId'].map(
  (xmlName) => createAttributeHandler(xmlName),
);

const getColspan = (cell) => {
  const rawColspan = cell?.attrs?.colspan;
  const numericColspan = typeof rawColspan === 'string' ? parseInt(rawColspan, 10) : rawColspan;
  return Number.isFinite(numericColspan) && numericColspan > 0 ? numericColspan : 1;
};

/**
 * Encode a w:tr element as a SuperDoc 'tableRow' node.
 * @param {import('@translator').SCEncoderConfig} [params]
 * @param {import('@translator').EncodedAttributes} [encodedAttrs] - The already encoded attributes
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (params, encodedAttrs) => {
  const { row } = params.extraParams;

  let tableRowProperties = {};
  const tPr = row.elements.find((el) => el.name === 'w:trPr');
  if (tPr) {
    tableRowProperties = trPrTranslator.encode({
      ...params,
      nodes: [tPr],
    });
  }
  const gridBeforeRaw = tableRowProperties?.['gridBefore'];
  const safeGridBefore =
    typeof gridBeforeRaw === 'number' && Number.isFinite(gridBeforeRaw) && gridBeforeRaw > 0 ? gridBeforeRaw : 0;

  // Preserve row-level table property exceptions (w:tblPrEx/w:tblBorders).
  // These are per-row border overrides stored in raw OOXML format for the
  // style-engine to factor into the cascade at resolution time.
  const tblPrEx = row.elements?.find((el) => el.name === 'w:tblPrEx');
  const tblPrExBorders = tblPrEx?.elements?.find((el) => el.name === 'w:tblBorders');
  if (tblPrExBorders) {
    const parsed = tblBordersTranslator.encode({ ...params, nodes: [tblPrExBorders] });
    if (parsed && Object.keys(parsed).length > 0) {
      tableRowProperties = { ...tableRowProperties, tblPrExBorders: parsed };
    }
  }

  encodedAttrs['tableRowProperties'] = Object.freeze(tableRowProperties);

  // Move some properties up a level for easier access
  encodedAttrs['rowHeight'] = twipsToPixels(tableRowProperties['rowHeight']?.value);
  encodedAttrs['cantSplit'] = tableRowProperties['cantSplit'];

  // Handling cells
  const { columnWidths: gridColumnWidths, activeRowSpans = [] } = params.extraParams;
  const totalColumns = Array.isArray(gridColumnWidths) ? gridColumnWidths.length : 0;
  const pendingRowSpans = Array.isArray(activeRowSpans) ? activeRowSpans.slice() : [];
  while (pendingRowSpans.length < totalColumns) pendingRowSpans.push(0);
  const cellEntries = normalizeRowCellChildren(row);
  const content = [];
  let currentColumnIndex = 0;

  const fillUntil = (target, reason) => {
    currentColumnIndex = fillPlaceholderColumns({
      content,
      pendingRowSpans,
      currentIndex: currentColumnIndex,
      targetIndex: target,
      totalColumns,
      gridColumnWidths,
      reason,
    });
  };

  const skipOccupiedColumns = () => {
    currentColumnIndex = advancePastRowSpans(pendingRowSpans, currentColumnIndex, totalColumns);
  };

  fillUntil(safeGridBefore, 'gridBefore');
  skipOccupiedColumns();

  cellEntries.forEach(({ node, cellSdt }) => {
    skipOccupiedColumns();

    const startColumn = currentColumnIndex;

    // Cell was consumed by a vertical merge (rowspan) above.
    // At this point skipOccupiedColumns() has already advanced past the spanned columns
    // using pendingRowSpans, so we just skip encoding without touching currentColumnIndex.
    if (node._vMergeConsumed) return;

    const columnWidth = gridColumnWidths?.[startColumn] || null;

    const result = tcTranslator.encode({
      ...params,
      nodes: [node],
      path: [...(params.path || []), node],
      extraParams: {
        ...params.extraParams,
        node,
        columnIndex: startColumn,
        columnWidth,
      },
    });

    // Attach cell-level SDT metadata after encode. The `NodeTranslator` wrapper
    // ignores any second arg to `encode`, so we cannot piggyback `cellSdt` on
    // the standard `encodedAttrs` channel; the cell loop owns this merge.
    if (result && cellSdt) {
      result.attrs = { ...(result.attrs || {}), cellSdt };
    }

    if (result) {
      content.push(result);
      const colspan = Math.max(1, result.attrs?.colspan || 1);
      const rowspan = Math.max(1, result.attrs?.rowspan || 1);

      if (rowspan > 1) {
        for (let offset = 0; offset < colspan; offset += 1) {
          const target = startColumn + offset;
          if (target < pendingRowSpans.length) {
            pendingRowSpans[target] = Math.max(pendingRowSpans[target], rowspan - 1);
          }
        }
      }

      currentColumnIndex = startColumn + colspan;
    }
  });

  skipOccupiedColumns();
  fillUntil(totalColumns, 'gridAfter');

  const newNode = {
    type: 'tableRow',
    content,
    attrs: encodedAttrs,
  };
  return newNode;
};

/**
 * Decode the tableRow node back into OOXML <w:tr>.
 * @param {import('@translator').SCDecoderConfig} params
 * @param {import('@translator').DecodedAttributes} [decodedAttrs] - The already decoded attributes
 * @returns {import('@translator').SCDecoderResult}
 */
const decode = (params, decodedAttrs) => {
  const { node } = params;

  const cells = node.content || [];

  let leadingPlaceholders = 0;
  while (leadingPlaceholders < cells.length && isPlaceholderCell(cells[leadingPlaceholders])) {
    leadingPlaceholders += 1;
  }

  let trailingPlaceholders = 0;
  while (
    trailingPlaceholders < cells.length - leadingPlaceholders &&
    isPlaceholderCell(cells[cells.length - 1 - trailingPlaceholders])
  ) {
    trailingPlaceholders += 1;
  }

  const trimmedSlice = cells.slice(leadingPlaceholders, cells.length - trailingPlaceholders);
  const sanitizedCells = trimmedSlice.map((cell) => {
    if (cell?.attrs && '__placeholder' in cell.attrs) {
      const { __placeholder, ...rest } = cell.attrs;
      void __placeholder; // Explicitly mark as intentionally unused
      return { ...cell, attrs: rest };
    }
    return cell;
  });
  let trimmedContent = sanitizedCells.filter((_, index) => !isPlaceholderCell(trimmedSlice[index]));

  const preferTableGrid = params.extraParams?.preferTableGrid === true;
  const totalColumns = params.extraParams?.totalColumns;
  if (preferTableGrid && typeof totalColumns === 'number' && Number.isFinite(totalColumns) && totalColumns > 0) {
    const rawGridBefore = node.attrs?.tableRowProperties?.gridBefore;
    const numericGridBefore = typeof rawGridBefore === 'string' ? parseInt(rawGridBefore, 10) : rawGridBefore;
    const safeGridBefore = Number.isFinite(numericGridBefore) && numericGridBefore > 0 ? numericGridBefore : 0;
    const effectiveGridBefore = leadingPlaceholders > 0 ? leadingPlaceholders : safeGridBefore;
    const availableColumns = Math.max(totalColumns - effectiveGridBefore, 0);
    let usedColumns = 0;
    const constrainedCells = [];
    for (const cell of trimmedContent) {
      const colspan = getColspan(cell);
      if (usedColumns + colspan > availableColumns) {
        break;
      }
      constrainedCells.push(cell);
      usedColumns += colspan;
    }
    trimmedContent = constrainedCells;
  }

  const translateParams = {
    ...params,
    node: { ...node, content: trimmedContent },
  };

  const elements = translateChildNodes(translateParams);

  // Re-wrap cells that were originally imported as cell-level SDT
  // (ECMA-376 §17.5.2.32, CT_SdtCell). The decoder above emits a plain `<w:tc>`
  // for each cell; we wrap it back in `<w:sdt><w:sdtContent><w:tc/></w:sdtContent></w:sdt>`
  // using the preserved `sdtPr` (and `sdtEndPr` if present) on the source cell.
  // Done here (not inside `tc-translator.decode`) so callers checking
  // `el.name === 'w:tc'` on the decoder result remain correct.
  let cellCursor = 0;
  for (let i = 0; i < elements.length; i += 1) {
    const exportedEl = elements[i];
    if (!exportedEl || exportedEl.name !== 'w:tc') continue;
    const sourceCell = trimmedContent[cellCursor];
    cellCursor += 1;
    const cellSdt = sourceCell?.attrs?.cellSdt;
    if (!cellSdt || cellSdt.scope !== 'cell' || !cellSdt.sdtPr) continue;
    const sdtChildren = [cellSdt.sdtPr];
    if (cellSdt.sdtEndPr) sdtChildren.push(cellSdt.sdtEndPr);
    sdtChildren.push({ name: 'w:sdtContent', elements: [exportedEl] });
    elements[i] = { name: 'w:sdt', elements: sdtChildren };
  }

  if (node.attrs?.tableRowProperties) {
    const tableRowProperties = { ...node.attrs.tableRowProperties };
    if (leadingPlaceholders > 0) {
      tableRowProperties.gridBefore = leadingPlaceholders;
    }
    if (trailingPlaceholders > 0) {
      tableRowProperties.gridAfter = trailingPlaceholders;
    }
    // Update rowHeight and cantSplit in tableRowProperties if they exist
    if (node.attrs.rowHeight != null) {
      const rowHeightPixels = twipsToPixels(node.attrs.tableRowProperties['rowHeight']?.value);
      if (rowHeightPixels !== node.attrs.rowHeight) {
        // If the value has changed, update it
        tableRowProperties['rowHeight'] = { value: String(pixelsToTwips(node.attrs['rowHeight'])) };
      }
    }
    tableRowProperties['cantSplit'] = node.attrs['cantSplit'];
    // Export tblPrEx borders back as w:tblPrEx before passing to trPr
    // (tblPrEx is a sibling of trPr inside w:tr, not a child of trPr)
    const { tblPrExBorders, ...trPrProperties } = tableRowProperties;
    if (tblPrExBorders && typeof tblPrExBorders === 'object' && Object.keys(tblPrExBorders).length > 0) {
      const bordersXml = tblBordersTranslator.decode({
        ...params,
        node: { type: 'tableRow', attrs: { borders: tblPrExBorders } },
      });
      if (bordersXml) {
        elements.unshift({ name: 'w:tblPrEx', elements: [bordersXml] });
      }
    }

    const trPr = trPrTranslator.decode({
      ...params,
      node: { ...node, attrs: { ...node.attrs, tableRowProperties: trPrProperties } },
    });
    if (trPr) elements.unshift(trPr);
  }

  return {
    name: 'w:tr',
    attributes: decodedAttrs || {},
    elements,
  };
};

/** @type {import('@translator').NodeTranslatorConfig} */
export const config = {
  xmlName: XML_NODE_NAME,
  sdNodeOrKeyName: SD_NODE_NAME,
  type: NodeTranslator.translatorTypes.NODE,
  encode,
  decode,
  attributes: validXmlAttributes,
};

/**
 * The NodeTranslator instance for the passthrough element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
