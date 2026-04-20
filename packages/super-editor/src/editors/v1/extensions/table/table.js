// @ts-nocheck

/**
 * Theme color options
 * @typedef { "dark1" | "light1" | "dark2" | "light2" | "accent1" | "accent2" | "accent3" | "accent4" | "accent5" | "accent6" | "hyperlink" | "followedHyperlink" | "none" | "background1" | "text1" | "background2" | "text2" } ThemeColor
 */

/**
 * Shading pattern options
 * @typedef { "nil" | "clear" | "solid" | "horzStripe" | "vertStripe" | "reverseDiagStripe" | "diagStripe" | "horzCross" | "diagCross" | "thinHorzStripe" | "thinVertStripe" | "thinReverseDiagStripe" | "thinDiagStripe" | "thinHorzCross" | "thinDiagCross" } ShadingPattern
 */

/**
 * Shading properties
 * @typedef {Object} ShadingProperties
 * @property {string|"auto"} [color] - Shading color (hex without # or "auto" for automatic)
 * @property {string|"auto"} [fill] - Shading fill color (hex without # or "auto" for automatic)
 * @property {ThemeColor} [themeColor] - Theme color name
 * @property {ThemeColor} [themeFill] - Theme fill name
 * @property {string} [themeFillShade] - Theme fill shade (0-255 in hex format without #)
 * @property {string} [themeFillTint] - Theme fill tint (0-255 in hex format without #)
 * @property {string} [themeShade] - Theme shade (0-255 in hex format without #)
 * @property {string} [themeTint] - Theme tint (0-255 in hex format without #)
 * @property {ShadingPattern} [val] - Shading pattern
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 365
 */

/**
 * Table width options
 * @typedef {Object} TableMeasurement
 * @property {number} value - Width value in twips
 * @property {"dxa" | "pct" | "auto"} [type='auto'] - Table width type (dxa=twips, pct=percentage, auto=automatic)
 */

/**
 * Table look options
 * @typedef {Object} TableLook
 * @property {boolean} [firstColumn] - Specifies that the first column conditional formatting should be applied
 * @property {boolean} [firstRow] - Specifies that the first row conditional formatting should be applied
 * @property {boolean} [lastColumn] - Specifies that the last column conditional formatting should be applied
 * @property {boolean} [lastRow] - Specifies that the last row conditional formatting should be applied
 * @property {boolean} [noHBand] - Specifies that no horizontal banding conditional formatting should be applied
 * @property {boolean} [noVBand] - Specifies that no vertical banding conditional formatting should be applied
 */

/**
 * Floating table properties
 * @typedef {Object} FloatingTableProperties
 * @property {number} [leftFromText] - Specifies the minimum distance in twips which shall be maintained between the current floating table and the edge of text in the paragraph which is to the left of this floating table.
 * @property {number} [rightFromText] - Specifies the minimum distance in twips which shall be maintained between the current floating table and the edge of text in the paragraph which is to the right of this floating table.
 * @property {number} [topFromText] - Specifies the minimum distance in twips which shall be maintained between the current floating table and the bottom edge of text in the paragraph which is above this floating table.
 * @property {number} [bottomFromText] - Specifies the minimum distance in twips which shall be maintained between the current floating table and the top edge of text in the paragraph which is below this floating table.
 * @property {number} [tblpX] - Specifies and absolute horizontal position for the floating table. The position is measured from the horizontal anchor point (horzAnchor) in twips.
 * @property {number} [tblpY] - Specifies and absolute vertical position for the floating table. The position is measured from the vertical anchor point (vertAnchor) in twips.
 * @property {"margin" | "page" | "text"} [horzAnchor] - Horizontal anchor point for tblpX
 * @property {"margin" | "page" | "text"} [vertAnchor] - Vertical anchor point for tblpY
 * @property {"left" | "center" | "right" | "inside" | "outside"} [tblpXSpec] - Specifies a relative horizontal position for the floating table. Supercedes tblpX if both are specified.
 * @property {"inline" | "top" | "center" | "bottom" | "inside" | "outside"} [tblpYSpec] - Specifies a relative vertical position for the floating table. Supercedes tblpY if both are specified.
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 450-451
 */

/**
 * Table border specification
 * @typedef {Object} TableBorderSpec
 * @property {string} [val] - Border style (e.g., 'single', 'double', 'dashed', etc.)
 * @property {string} [color] - Border color (hex without #, e.g., 'FF0000' for red)
 * @property {ThemeColor} [themeColor] - Theme color name
 * @property {string} [themeTint] - Theme tint (0-255 in hex format without #)
 * @property {string} [themeShade] - Theme shade (0-255 in hex format without #)
 * @property {number} [size] - Border size in eighths of a point (e.g., 8 = 1pt, 16 = 2pt)
 * @property {number} [space] - Space in points between border and text
 * @property {boolean} [shadow] - Whether the border has a shadow
 * @property {boolean} [frame] - Whether the border is a frame
 */

/**
 * Table borders properties
 * @typedef {Object} TableBorders
 * @property {TableBorderSpec} [bottom] - Bottom border specification
 * @property {TableBorderSpec} [end] - End (right in LTR, left in RTL) border specification
 * @property {TableBorderSpec} [insideH] - Inside horizontal border specification
 * @property {TableBorderSpec} [insideV] - Inside vertical border specification
 * @property {TableBorderSpec} [left] - Left border specification
 * @property {TableBorderSpec} [right] - Right border specification
 * @property {TableBorderSpec} [start] - Start (left in LTR, right in RTL) border specification
 * @property {TableBorderSpec} [top] - Top border specification
 */

/**
 * Table cell margin properties
 * @typedef {Object} TableCellMargins
 * @property {TableMeasurement} [top] - Top cell margin
 * @property {TableMeasurement} [left] - Left cell margin
 * @property {TableMeasurement} [bottom] - Bottom cell margin
 * @property {TableMeasurement} [start] - Start cell margin (left in LTR, right in RTL)
 * @property {TableMeasurement} [end] - End cell margin (right in LTR, left in RTL)
 * @property {TableMeasurement} [right] - Right cell margin
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 425
 */

/**
 * Table properties
 * @typedef {Object} TableProperties
 * @property {boolean} [rightToLeft] - Specifies that the cells with this table shall be visually represented in a right to left direction
 * @property {"center" | "end" | "left" | "right" | "start"} [justification] - The alignment of the set of rows which are part of the current table.
 * @property {ShadingProperties} [shading] - Shading properties for the table
 * @property {string} [caption] - Caption text for the table
 * @property {string} [description] - Description text for the table
 * @property {TableMeasurement} [tableCellSpacing] - Cell spacing
 * @property {TableMeasurement} [tableIndent] - Table indentation
 * @property {"fixed" | "autofit"} [tableLayout] - Table layout algorithm
 * @property {TableLook} [tblLook] - Various boolean flags that affect the rendering of the table
 * @property {"never" | "overlap"} [overlap] - Specifies whether the current table should allow other floating tables to overlap its extents when the tables are displayed in a document
 * @property {string} [tableStyleId] - Reference to table style ID
 * @property {number} [tableStyleColBandSize] - Number of columns for which the table style is applied
 * @property {number} [tableStyleRowBandSize] - Number of rows for which the table style is applied
 * @property {TableMeasurement} [tableWidth] - Table width
 * @property {FloatingTableProperties} [floatingTableProperties] - Floating table properties
 * @property {TableBorders} [borders] - Table border configuration
 * @property {TableCellMargins} [cellMargins] - Cell margin configuration
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 371-483
 */

/**
 * Column width definition
 * @typedef {Object} ColWidth
 * @property {number} col - Column width in twips
 */

/**
 * Table grid definition
 * @typedef {Object} TableGrid
 * @property {ColWidth[]} [colWidths] - Array of column widths in twips
 */

/**
 * Row template formatting
 * @typedef {Object} RowTemplateFormatting
 * @property {import('prosemirror-model').NodeType} blockType - Node type used when building cell content
 * @property {Object|null} blockAttrs - Attributes to apply to the created block node
 * @property {Array<import('prosemirror-model').Mark>} textMarks - Marks copied from the template text node
 */

/**
 * Build row from template row parameters
 * @typedef {Object} BuildRowFromTemplateRowParams
 * @property {import('prosemirror-model').Schema} schema - Editor schema
 * @property {import('prosemirror-model').Node} tableNode - Table node used for column map lookup
 * @property {import('prosemirror-model').Node} templateRow - Row providing structure and formatting
 * @property {Array} values - Values to populate each table cell
 * @property {boolean} [copyRowStyle=false] - Clone template marks and block attrs when true
 */

/**
 * Append rows to the end of a table in a single transaction.
 * @typedef {Object} appendRowsWithContentOptions
 * @property {number} [tablePos] - Absolute position of the target table; required when `tableNode` is not provided
 * @property {import('prosemirror-model').Node} [tableNode] - Table node reference; required when `tablePos` is not provided
 * @property {string[][]} valueRows - Cell values for each appended row
 * @property {boolean} [copyRowStyle=false] - Clone template styling when true
 */

/**
 * Insert rows at table end parameters
 * @typedef {Object} InsertRowsAtTableEndParams
 * @property {import('prosemirror-state').Transaction} tr - Transaction to mutate
 * @property {number} tablePos - Absolute position of the target table
 * @property {import('prosemirror-model').Node} tableNode - Table node receiving new rows
 * @property {import('prosemirror-model').Node[]} rows - Row nodes to append
 */

import { v4 as uuidv4 } from 'uuid';
import { generateDocxHexId } from '../../utils/generateDocxHexId.js';
import { Fragment } from 'prosemirror-model';
import { Node } from '@core/Node.js';
import { Attribute } from '@core/Attribute.js';
import { callOrGet } from '@core/utilities/callOrGet.js';
import { getExtensionConfigField } from '@core/helpers/getExtensionConfigField.js';
import { /* TableView */ createTableView } from './TableView.js';
import { createTable } from './tableHelpers/createTable.js';
import { createColGroup } from './tableHelpers/createColGroup.js';
import { deleteTableWhenSelected } from './tableHelpers/deleteTableWhenSelected.js';
import { normalizeNewTableAttrs } from './tableHelpers/normalizeNewTableAttrs.js';
import { computeColumnWidths } from './tableHelpers/computeColumnWidths.js';
import { createTableBorders } from './tableHelpers/createTableBorders.js';
import {
  isLegacySchemaDefaultBorders,
  convertBordersToOoxmlFormat,
} from '../table-cell/helpers/legacyBorderMigration.js';
import { isInTable } from '@helpers/isInTable.js';
import { findParentNode } from '@helpers/findParentNode.js';
import { TextSelection, NodeSelection, Plugin, PluginKey } from 'prosemirror-state';
import { isCellSelection } from './tableHelpers/isCellSelection.js';
import {
  addColumnBefore as originalAddColumnBefore,
  addColumnAfter as originalAddColumnAfter,
  addRowBefore as originalAddRowBefore,
  addRowAfter as originalAddRowAfter,
  CellSelection,
  columnResizing,
  deleteColumn,
  deleteRow,
  deleteTable,
  fixTables,
  goToNextCell,
  mergeCells as originalMergeCells,
  setCellAttr,
  splitCell as originalSplitCell,
  tableEditing,
  toggleHeader,
  toggleHeaderCell,
  // TableView,
  tableNodeTypes,
  selectedRect,
  TableMap,
} from 'prosemirror-tables';
import { cellAround } from './tableHelpers/cellAround.js';
import { cellWrapping } from './tableHelpers/cellWrapping.js';
import { createTableBoundaryNavigationPlugin } from './tableHelpers/tableBoundaryNavigation.js';
import { toggleHeaderRow as toggleHeaderRowCommand } from './tableHelpers/toggleHeaderRow.js';
import {
  resolveTable,
  pickTemplateRowForAppend,
  buildRowFromTemplateRow,
  insertRowsAtTableEnd,
  insertRowAtIndex,
} from './tableHelpers/appendRows.js';

/**
 * Determines which sides of a table inserted at `pos` need a separator
 * paragraph to prevent adjacency with an existing table.
 *
 * @param {import('prosemirror-model').Node} doc
 * @param {number} pos - Absolute insertion position (between top-level blocks)
 * @param {{ from?: number, to?: number }} [replaceRange]
 * @returns {{ before: boolean, after: boolean }}
 */
function tableSeparatorNeeds(doc, pos, replaceRange = {}) {
  const boundaryBefore = replaceRange.from ?? pos;
  const boundaryAfter = replaceRange.to ?? pos;

  const $before = doc.resolve(boundaryBefore);
  const $after = doc.resolve(boundaryAfter);
  if ($before.depth !== 0 || $after.depth !== 0) return { before: false, after: false };

  const beforeIndex = $before.index(0);
  const afterIndex = $after.index(0);
  const nodeBefore = beforeIndex > 0 ? doc.child(beforeIndex - 1) : null;
  const nodeAfter = afterIndex < doc.childCount ? doc.child(afterIndex) : null;

  return {
    before: nodeBefore?.type.name === 'table',
    after: !nodeAfter || nodeAfter.type.name === 'table',
  };
}

/**
 * Creates the separator paragraph used to keep top-level tables from being
 * adjacent to another table or the document boundary.
 *
 * @param {import('prosemirror-model').Schema} schema
 * @returns {import('prosemirror-model').Node | null}
 */
function createTableSeparatorParagraph(schema) {
  const attrs = { sdBlockId: uuidv4(), paraId: generateDocxHexId() };
  return schema.nodes.paragraph.createAndFill(attrs);
}

/**
 * Inserts a top-level table, adding separator paragraphs before/after when
 * required by the surrounding document structure.
 *
 * @param {import('prosemirror-state').Transaction} tr
 * @param {import('prosemirror-model').Node} doc
 * @param {number} pos
 * @param {import('prosemirror-model').Node} tableNode
 * @param {{ from?: number, to?: number }} [replaceRange]
 * @returns {{ inserted: boolean }}
 */
function insertTopLevelTableWithSeparators(tr, doc, pos, tableNode, replaceRange = {}) {
  const replaceFrom = replaceRange.from ?? pos;
  const replaceTo = replaceRange.to ?? pos;
  const sep = tableSeparatorNeeds(doc, pos, replaceRange);
  if (!sep.before && !sep.after) {
    tr.replaceWith(replaceFrom, replaceTo, tableNode);
    return { inserted: true };
  }

  const nodes = [];

  if (sep.before) {
    const before = createTableSeparatorParagraph(doc.type.schema);
    if (!before) return { inserted: false };
    nodes.push(before);
  }

  nodes.push(tableNode);

  if (sep.after) {
    const after = createTableSeparatorParagraph(doc.type.schema);
    if (!after) return { inserted: false };
    nodes.push(after);
  }

  tr.replaceWith(replaceFrom, replaceTo, Fragment.from(nodes));
  return { inserted: true };
}

/**
 * Returns a text position inside the first table cell.
 *
 * @param {number} tablePos
 * @param {import('prosemirror-model').Node} tableNode
 * @returns {number}
 */
function getFirstTableCellTextPos(tablePos, tableNode) {
  const map = TableMap.get(tableNode);
  return tablePos + 1 + map.map[0] + 2;
}

/**
 * Resolves the table targeted by a command.
 *
 * When a block SDT that wraps a single table is selected, table commands should
 * still operate on that inner table rather than an ancestor wrapper table.
 *
 * @param {import('prosemirror-state').Selection} selection
 * @returns {{ node: import('prosemirror-model').Node, pos: number } | null}
 */
function resolveCommandTargetTable(selection) {
  if (selection?.node?.type?.name === 'structuredContentBlock') {
    let found = null;
    let count = 0;
    selection.node.descendants((node, pos) => {
      if (node.type?.name !== 'table') return true;
      count += 1;
      found = {
        node,
        pos: selection.from + 1 + pos,
      };
      return false;
    });

    if (count === 1 && found) {
      return found;
    }
  }

  return findParentNode((node) => node.type.name === 'table')(selection);
}

/**
 * Resolves insertion coordinates when a table is inserted inside a block SDT.
 *
 * Block structured content allows block children (`content: 'block*'`), so
 * table insertion should operate on its inner block list rather than using the
 * top-level document insertion path.
 *
 * @param {import('prosemirror-state').Selection} selection
 * @returns {{ from: number, to: number, tablePos: number } | null}
 */
function resolveStructuredContentBlockTableInsertion(selection) {
  if (selection instanceof NodeSelection && selection.node?.type?.name === 'structuredContentBlock') {
    const contentStart = selection.from + 1;
    const firstChild = selection.node.firstChild;
    const shouldReplaceOnlyEmptyParagraph =
      selection.node.childCount === 1 && firstChild?.type?.name === 'paragraph' && firstChild.textContent === '';

    if (shouldReplaceOnlyEmptyParagraph) {
      return {
        from: contentStart,
        to: contentStart + firstChild.nodeSize,
        tablePos: contentStart,
      };
    }

    const contentEnd = contentStart + selection.node.content.size;
    return {
      from: contentEnd,
      to: contentEnd,
      tablePos: contentEnd,
    };
  }

  const $from = selection.$from;
  let structuredContentDepth = -1;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type?.name === 'structuredContentBlock') {
      structuredContentDepth = depth;
      break;
    }
  }

  if (structuredContentDepth === -1) {
    return null;
  }

  const paragraphDepth = $from.parent?.type?.name === 'run' ? $from.depth - 1 : $from.depth;
  if (paragraphDepth <= structuredContentDepth) {
    const contentEnd = $from.end(structuredContentDepth);
    return {
      from: contentEnd,
      to: contentEnd,
      tablePos: contentEnd,
    };
  }

  const paragraph = $from.node(paragraphDepth);
  const isEmptyParagraph = paragraph.type.name === 'paragraph' && paragraph.textContent === '';

  if (isEmptyParagraph) {
    const from = $from.before(paragraphDepth);
    return {
      from,
      to: $from.after(paragraphDepth),
      tablePos: from,
    };
  }

  const from = $from.after(paragraphDepth);
  return {
    from,
    to: from,
    tablePos: from,
  };
}

const IMPORT_CONTEXT_SELECTOR = '[data-superdoc-import="true"]';
const IMPORT_DEFAULT_TABLE_WIDTH_PCT = 5000; // OOXML percent units where 5000 == 100%

/**
 * Detects whether a table element is being parsed from imported content
 * (e.g. insertContent with contentType "html"/"markdown").
 *
 * @param {Element} element
 * @returns {boolean}
 */
const isImportedTableElement = (element) => Boolean(element?.closest?.(IMPORT_CONTEXT_SELECTOR));

/**
 * Table configuration options
 * @typedef {Object} TableConfig
 * @property {number} [rows=3] - Number of rows to create
 * @property {number} [cols=3] - Number of columns to create
 * @property {boolean} [withHeaderRow=false] - Create first row as header row
 * @property {number[]} [columnWidths] - Explicit column widths in pixels
 */

/**
 * Table indentation configuration
 * @typedef {Object} TableIndent
 * @property {number} width - Indent width in pixels
 * @property {string} [type='dxa'] - Indent type
 */

/**
 * Cell selection position
 * @typedef {Object} CellSelectionPosition
 * @property {number} anchorCell - Starting cell position
 * @property {number} headCell - Ending cell position
 */

/**
 * Configuration options for Table
 * @typedef {Object} TableOptions
 * @category Options
 * @property {Object} [htmlAttributes={'aria-label': 'Table node'}] - Default HTML attributes for all tables
 * @property {boolean} [resizable=true] - Enable column resizing functionality
 * @property {number} [handleWidth=5] - Width of resize handles in pixels
 * @property {number} [cellMinWidth=10] - Minimum cell width constraint in pixels
 * @property {boolean} [lastColumnResizable=true] - Allow resizing of the last column
 * @property {boolean} [allowTableNodeSelection=false] - Enable selecting the entire table node
 */

/**
 * Attributes for table nodes
 * @typedef {Object} TableAttributes
 * @category Attributes
 * @property {TableIndent} [tableIndent] - Table indentation configuration
 * @property {import("./tableHelpers/createTableBorders.js").TableBorders} [borders] - Border styling for this table
 * @property {string} [borderCollapse='collapse'] - CSS border-collapse property
 * @property {string} [justification] - Table alignment ('left', 'center', 'right')
 * @property {TableMeasurement} [tableCellSpacing] - Cell spacing for this table
 * @property {string} [sdBlockId] @internal - Internal block tracking ID
 * @property {string} [tableStyleId] @internal - Internal reference to table style
 * @property {string} [tableLayout] @internal - CSS table-layout property (advanced usage)
 */

/**
 * Current cell information
 * @typedef {Object} CurrentCellInfo
 * @property {Object} rect - Selected rectangle information
 * @property {import('prosemirror-model').Node} cell - The cell node
 * @property {Object} attrs - Cell attributes
 */

/**
 * @typedef {Object} TableNodeAttributes
 * @property {TableProperties} tableProperties
 * @property {TableGrid} grid
 */

/**
 * @typedef {Node} TableNode
 * @property {TableNodeAttributes} attrs
 */

/**
 * @module Table
 * @sidebarTitle Table
 * @snippetPath /snippets/extensions/table.mdx
 * @shortcut Tab | goToNextCell/addRowAfter | Navigate to next cell or add row
 * @shortcut Shift-Tab | goToPreviousCell | Navigate to previous cell
 * @shortcut Backspace | deleteTableWhenSelected | Delete table when all cells selected
 * @shortcut Delete | deleteTableWhenSelected | Delete table when all cells selected
 */
export const Table = Node.create({
  name: 'table',

  content: 'tableRow+',

  group: 'block',

  isolating: true,

  tableRole: 'table',

  addOptions() {
    return {
      htmlAttributes: {
        'aria-label': 'Table node',
      },
      resizable: true,
      handleWidth: 5,
      cellMinWidth: 10,
      lastColumnResizable: true,
      allowTableNodeSelection: false,
    };
  },

  addAttributes() {
    return {
      /**
       * @private
       * @category Attribute
       * @param {string} [sdBlockId] - Internal block tracking ID (not user-configurable)
       */
      sdBlockId: {
        default: null,
        keepOnSplit: false,
        parseDOM: (elem) => elem.getAttribute('data-sd-block-id'),
        renderDOM: (attrs) => {
          return attrs.sdBlockId ? { 'data-sd-block-id': attrs.sdBlockId } : {};
        },
      },

      /**
       * @private
       * @category Attribute
       * @param {string} [paraId] - Legacy imported identity preserved for backwards compatibility
       */
      paraId: {
        default: null,
        keepOnSplit: false,
        parseDOM: () => null,
        renderDOM: () => ({}),
      },

      /**
       * @private
       * @category Attribute
       * @param {string} [textId] - Legacy imported text identifier preserved for backwards compatibility
       */
      textId: {
        default: null,
        keepOnSplit: false,
        parseDOM: () => null,
        renderDOM: () => ({}),
      },

      /**
       * @category Attribute
       * @param {TableIndent} [tableIndent] - Table indentation configuration
       */
      tableIndent: {
        renderDOM: ({ tableIndent }) => {
          if (!tableIndent) return {};
          // @ts-expect-error - tableIndent is known to be an object at runtime
          const { width } = tableIndent;
          let style = '';
          if (width) style += `margin-left: ${width}px`;
          return {
            style,
          };
        },
      },

      /**
       * @category Attribute
       * @param {import("./tableHelpers/createTableBorders.js").TableBorders} [borders] - Border styling for this table
       */
      borders: {
        default: {},
        renderDOM({ borders, borderCollapse, tableCellSpacing }) {
          if (!Object.keys(borders).length && borderCollapse !== 'separate' && !tableCellSpacing) return {};

          const style = Object.entries(borders).reduce((acc, [key, { size, color }]) => {
            return `${acc}border-${key}: ${Math.ceil(size)}px solid ${color || 'black'};`;
          }, '');

          return {
            style,
          };
        },
      },

      /**
       * @category Attribute
       * @param {string} [borderCollapse='collapse'] - CSS border-collapse property
       */
      borderCollapse: {
        default: null,
        renderDOM({ borderCollapse }) {
          return {
            style: `border-collapse: ${borderCollapse || 'collapse'}`,
          };
        },
      },

      /**
       * @category Attribute
       * @param {string} [justification] - Table alignment ('left', 'center', 'right')
       */
      justification: {
        default: null,
        renderDOM: (attrs) => {
          if (!attrs.justification) return {};

          if (attrs.justification === 'center') {
            return { style: `margin: 0 auto` };
          }
          if (attrs.justification === 'right') {
            return { style: `margin-left: auto` };
          }

          return {};
        },
      },

      /**
       * @private
       * @category Attribute
       * @param {string} [tableLayout] - CSS table-layout property (advanced usage)
       */
      tableLayout: {
        rendered: false,
      },

      /**
       * @category Attribute
       * @param {TableMeasurement} [tableCellSpacing] - Cell spacing for this table
       */
      tableCellSpacing: {
        default: null,
        renderDOM({ tableCellSpacing }) {
          if (!tableCellSpacing?.value) return {};
          return {
            style: `border-spacing: ${tableCellSpacing.value}px`,
          };
        },
      },

      /**
       * @category Attribute
       * @param {TableProperties} [tableProperties] - Properties for the table.
       * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 371-483
       */
      tableProperties: {
        default: {
          tableWidth: {
            value: null,
            type: 'auto',
          },
        },
        rendered: false,
        parseDOM: (element) => {
          if (!isImportedTableElement(element)) return undefined;

          // Imported HTML tables usually have no structural width metadata.
          // Default them to 100% so visual rendering matches DOCX export behavior.
          return {
            tableWidth: {
              value: IMPORT_DEFAULT_TABLE_WIDTH_PCT,
              type: 'pct',
            },
          };
        },
      },

      /**
       * Table style reference. HTML-parsed tables get null here; the actual
       * style is resolved via normalizeNewTableAttrs only when
       * needsTableStyleNormalization=true.
       */
      tableStyleId: {
        parseDOM: (element) => {
          if (!isImportedTableElement(element)) return undefined;
          return null;
        },
        rendered: false,
      },

      /**
       * Marker for imported/non-DOCX tables that still need style normalization.
       * Existing DOCX tables may legitimately have tableStyleId=null.
       */
      needsTableStyleNormalization: {
        default: false,
        parseDOM: (element) => {
          if (!isImportedTableElement(element)) return undefined;
          return true;
        },
        rendered: false,
      },

      /**
       * @category Attribute
       * @param {TableGrid} [grid] - Grid definition for the table
       * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 432
       */
      grid: {
        default: null,
        rendered: false,
      },

      /**
       * @category Attribute
       * @param {boolean} [userEdited] - Flag indicating user has manually resized columns
       * Used by pm-adapter to prioritize user edits over original OOXML grid
       */
      userEdited: {
        default: false,
        rendered: false,
      },
    };
  },

  parseDOM() {
    return [{ tag: 'table' }];
  },

  renderDOM({ node, htmlAttributes }) {
    const { colgroup, tableWidth, tableMinWidth } = createColGroup(node, this.options.cellMinWidth);

    const attrs = Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes, {
      style: tableWidth ? `width: ${tableWidth}` : `min-width: ${tableMinWidth}`,
    });

    return ['table', attrs, colgroup, ['tbody', 0]];
  },

  // @ts-expect-error - Command signatures will be fixed in TS migration
  addCommands() {
    return {
      /**
       * Append multiple rows to the end of a table in a single transaction.
       * @category Command
       * @param {appendRowsWithContentOptions} options - Append configuration
       * @example
       * editor.commands.appendRowsWithContent({ tablePos, valueRows: [['A','B'], ['C','D']], copyRowStyle: true })
       */
      appendRowsWithContent:
        ({ tablePos, tableNode, valueRows = [], copyRowStyle = false }) =>
        ({ editor, chain }) => {
          if ((typeof tablePos !== 'number' && !tableNode) || !Array.isArray(valueRows) || !valueRows.length) {
            return false;
          }

          return chain()
            .command(({ tr, dispatch }) => {
              const workingTable = resolveTable(tr, tablePos, tableNode);
              if (!workingTable) return false;

              const templateRow = pickTemplateRowForAppend(workingTable, editor.schema);
              if (!templateRow) return false;

              const newRows = valueRows
                .map((vals) =>
                  buildRowFromTemplateRow({
                    schema: editor.schema,
                    tableNode: workingTable,
                    templateRow,
                    values: vals,
                    copyRowStyle,
                  }),
                )
                .filter(Boolean);
              if (!newRows.length) return false;

              let resolvedTablePos = tablePos;
              if (typeof resolvedTablePos !== 'number' && workingTable) {
                // Try to find the position of the table node in the document
                const tables = editor.getNodesOfType('table');
                const match = workingTable ? tables.find((t) => t.node.eq(workingTable)) : tables[0];
                resolvedTablePos = match?.pos ?? null;
              }
              if (typeof resolvedTablePos !== 'number') {
                return false;
              }

              if (dispatch) {
                insertRowsAtTableEnd({ tr, tablePos, tableNode: workingTable, rows: newRows });
              }
              return true;
            })
            .run();
        },
      /**
       * Insert a new table into the document
       * @category Command
       * @param {TableConfig} [config] - Table configuration options
       * @example
       * editor.commands.insertTable()
       * editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true })
       * editor.commands.insertTable({ rows: 3, cols: 3, columnWidths: [200, 100, 200] })
       */
      insertTable:
        ({ rows = 3, cols = 3, withHeaderRow = false, columnWidths = null } = {}) =>
        ({ tr, dispatch, editor, state }) => {
          const widths = columnWidths ?? computeColumnWidths(editor, cols);

          const resolved = normalizeNewTableAttrs(editor);
          const tableAttrs = {
            ...(resolved.tableStyleId ? { tableStyleId: resolved.tableStyleId } : {}),
            ...(resolved.borders ? { borders: resolved.borders } : {}),
            ...(resolved.tableProperties ? { tableProperties: resolved.tableProperties } : {}),
          };

          const node = createTable(editor.schema, rows, cols, withHeaderRow, null, widths, tableAttrs);

          if (dispatch) {
            const structuredContentInsertion = resolveStructuredContentBlockTableInsertion(tr.selection);
            if (structuredContentInsertion) {
              const { from, to, tablePos } = structuredContentInsertion;
              tr.replaceWith(from, to, node);
              const selectionPos = getFirstTableCellTextPos(tablePos, node);
              tr.scrollIntoView().setSelection(TextSelection.near(tr.doc.resolve(selectionPos)));
              return true;
            }

            let offset;
            let replaceRange = undefined;

            if (tr.selection.$from.depth === 0) {
              // Selection is at the document root (e.g. AllSelection via Ctrl+A,
              // or NodeSelection on a top-level block). Replace the selected
              // range with the new table.
              offset = tr.selection.from;
              replaceRange = { from: tr.selection.from, to: tr.selection.to };
            } else {
              offset = tr.selection.$from.end() + 1;
              const paragraphDepth =
                tr.selection.$from.parent?.type?.name === 'run'
                  ? tr.selection.$from.depth - 1
                  : tr.selection.$from.depth;
              const paragraph = tr.selection.$from.node(paragraphDepth);
              const isTopLevelParagraph = paragraphDepth === 1;
              const isEmptyParagraph = paragraph.type.name === 'paragraph' && paragraph.textContent === '';

              if (isTopLevelParagraph && isEmptyParagraph) {
                offset = tr.selection.$from.before(paragraphDepth);
                replaceRange = {
                  from: tr.selection.$from.before(paragraphDepth),
                  to: tr.selection.$from.after(paragraphDepth),
                };
              } else if (tr.selection.$from.parent?.type?.name === 'run') {
                // If in a run, insert after the parent paragraph.
                offset = tr.selection.$from.after(paragraphDepth);
              }
            }

            const { inserted } = insertTopLevelTableWithSeparators(tr, state.doc, offset, node, replaceRange);
            if (!inserted) return false;

            const selectionPos = getFirstTableCellTextPos(offset, node);
            tr.scrollIntoView().setSelection(TextSelection.near(tr.doc.resolve(selectionPos)));
          }

          return true;
        },

      /**
       * Insert a table at a specific document position.
       * Used by the document API's create.table operation.
       *
       * Mirrors the logic of `core/commands/insertTableAt.js` but adapted
       * for the extension command interface (shared `tr`, `dispatch` as gate).
       *
       * @category Command
       * @param {Object} options
       * @param {number} options.pos - Absolute document position to insert at
       * @param {number} options.rows - Number of rows
       * @param {number} options.columns - Number of columns
       * @param {string} [options.sdBlockId] - Stable block ID for the created table
       * @param {boolean} [options.tracked] - When true, sets forceTrackChanges meta; when false, sets skipTrackChanges meta
       */
      insertTableAt:
        ({ pos, rows, columns, sdBlockId, tracked } = {}) =>
        ({ tr, state, dispatch, editor }) => {
          const tableType = state.schema.nodes.table;
          const tableRowType = state.schema.nodes.tableRow;
          const tableCellType = state.schema.nodes.tableCell;
          if (!tableType || !tableRowType || !tableCellType) return false;
          if (!Number.isInteger(pos) || pos < 0 || pos > state.doc.content.size) return false;
          if (!Number.isInteger(rows) || rows < 1) return false;
          if (!Number.isInteger(columns) || columns < 1) return false;

          try {
            const widths = computeColumnWidths(editor, columns);
            const rowNodes = [];
            for (let r = 0; r < rows; r++) {
              const cellNodes = [];
              for (let c = 0; c < columns; c++) {
                const cellAttrs = widths ? { colwidth: [widths[c]] } : {};
                const cell = tableCellType.createAndFill(cellAttrs);
                if (!cell) return false;
                cellNodes.push(cell);
              }
              const row = tableRowType.createChecked({ paraId: generateDocxHexId() }, cellNodes);
              rowNodes.push(row);
            }
            const resolved = normalizeNewTableAttrs(editor);
            const tableAttrs = {
              ...(resolved.tableStyleId ? { tableStyleId: resolved.tableStyleId } : {}),
              ...(resolved.borders ? { borders: resolved.borders } : {}),
              ...(resolved.tableProperties ? { tableProperties: resolved.tableProperties } : {}),
              ...(sdBlockId ? { sdBlockId } : {}),
            };
            const tableNode = tableType.createChecked(tableAttrs, rowNodes);

            if (dispatch) {
              const { inserted } = insertTopLevelTableWithSeparators(tr, state.doc, pos, tableNode);
              if (!inserted) return false;
              tr.setMeta('inputType', 'programmatic');
              if (tracked === true) tr.setMeta('forceTrackChanges', true);
              else if (tracked === false) tr.setMeta('skipTrackChanges', true);
            }
            return true;
          } catch {
            return false;
          }
        },

      /**
       * Delete the entire table containing the cursor
       * @category Command
       * @example
       * editor.commands.deleteTable()
       */
      deleteTable:
        () =>
        ({ state, dispatch }) => {
          return deleteTable(state, dispatch);
        },

      /**
       * Add a column before the current column
       * @category Command
       * @example
       * editor.commands.addColumnBefore()
       * @note Preserves cell attributes from current column
       */
      addColumnBefore:
        () =>
        ({ state, dispatch, chain }) => {
          if (!originalAddColumnBefore(state)) return false;

          let { rect, attrs: currentCellAttrs } = getCurrentCellAttrs(state);

          return chain()
            .command(() => originalAddColumnBefore(state, dispatch))
            .command(({ tr }) => {
              let table = tr.doc.nodeAt(rect.tableStart - 1);
              if (!table) return false;
              let updatedMap = TableMap.get(table);
              let newColumnIndex = rect.left;

              if (newColumnIndex < 0 || newColumnIndex >= updatedMap.width) {
                return false;
              }

              for (let row = 0; row < updatedMap.height; row++) {
                let cellIndex = row * updatedMap.width + newColumnIndex;
                let cellPos = updatedMap.map[cellIndex];
                let cellAbsolutePos = rect.tableStart + cellPos;
                let cell = tr.doc.nodeAt(cellAbsolutePos);
                if (cell) {
                  let attrs = {
                    ...currentCellAttrs,
                    colspan: cell.attrs.colspan,
                    rowspan: cell.attrs.rowspan,
                    colwidth: cell.attrs.colwidth,
                  };
                  tr.setNodeMarkup(cellAbsolutePos, null, attrs);
                }
              }

              return true;
            })
            .run();
        },

      /**
       * Add a column after the current column
       * @category Command
       * @returns {Function} Command
       * @example
       * addColumnAfter()
       * @note Preserves cell attributes from current column
       */
      addColumnAfter:
        () =>
        ({ state, dispatch, chain }) => {
          if (!originalAddColumnAfter(state)) return false;

          let { rect, attrs: currentCellAttrs } = getCurrentCellAttrs(state);

          return chain()
            .command(() => originalAddColumnAfter(state, dispatch))
            .command(({ tr }) => {
              let table = tr.doc.nodeAt(rect.tableStart - 1);
              if (!table) return false;
              let updatedMap = TableMap.get(table);
              let newColumnIndex = rect.left + 1;

              if (newColumnIndex < 0 || newColumnIndex >= updatedMap.width) {
                return false;
              }

              for (let row = 0; row < updatedMap.height; row++) {
                let cellIndex = row * updatedMap.width + newColumnIndex;
                let cellPos = updatedMap.map[cellIndex];
                let cellAbsolutePos = rect.tableStart + cellPos;
                let cell = tr.doc.nodeAt(cellAbsolutePos);
                if (cell) {
                  let attrs = {
                    ...currentCellAttrs,
                    colspan: cell.attrs.colspan,
                    rowspan: cell.attrs.rowspan,
                    colwidth: cell.attrs.colwidth,
                  };
                  tr.setNodeMarkup(cellAbsolutePos, null, attrs);
                }
              }

              return true;
            })
            .run();
        },

      /**
       * Delete the column containing the cursor
       * @category Command
       * @returns {Function} Command
       * @example
       * deleteColumn()
       */
      deleteColumn:
        () =>
        ({ state, dispatch }) => {
          return deleteColumn(state, dispatch);
        },

      /**
       * Add a row before the current row
       * @category Command
       * @returns {Function} Command
       * @example
       * addRowBefore()
       * @note Preserves cell attributes from current row
       */
      addRowBefore:
        () =>
        ({ state, dispatch, editor }) => {
          if (!isInTable(state)) return false;

          const { rect } = getCurrentCellAttrs(state);
          const tablePos = rect.tableStart - 1;
          const tableNode = state.doc.nodeAt(tablePos);
          if (!tableNode) return false;

          const tr = state.tr;
          const result = insertRowAtIndex({
            tr,
            tablePos,
            tableNode,
            sourceRowIndex: rect.top,
            insertIndex: rect.top,
            schema: editor.schema,
          });

          if (result && dispatch) dispatch(tr);
          return result;
        },

      /**
       * Add a row after the current row
       * @category Command
       * @returns {Function} Command
       * @example
       * addRowAfter()
       * @note Preserves cell attributes from current row
       */
      addRowAfter:
        () =>
        ({ state, dispatch, editor }) => {
          if (!isInTable(state)) return false;

          const { rect } = getCurrentCellAttrs(state);
          const tablePos = rect.tableStart - 1;
          const tableNode = state.doc.nodeAt(tablePos);
          if (!tableNode) return false;

          const tr = state.tr;
          const result = insertRowAtIndex({
            tr,
            tablePos,
            tableNode,
            sourceRowIndex: rect.top,
            insertIndex: rect.top + 1,
            schema: editor.schema,
          });

          if (result && dispatch) dispatch(tr);
          return result;
        },

      /**
       * Delete the row containing the cursor
       * @category Command
       * @returns {Function} Command
       * @example
       * deleteRow()
       */
      deleteRow:
        () =>
        ({ state, dispatch }) => {
          return deleteRow(state, dispatch);
        },

      /**
       * Merge selected cells into one
       * @category Command
       * @returns {Function} Command
       * @example
       * mergeCells()
       * @note Content from all cells is preserved
       */
      mergeCells:
        () =>
        ({ state, dispatch }) => {
          return originalMergeCells(state, dispatch);
        },

      /**
       * Split a merged cell back into individual cells
       * @category Command
       * @returns {Function} Command - true if split, false if position invalid
       * @example
       * splitCell()
       */
      splitCell:
        () =>
        ({ state, dispatch, commands }) => {
          if (originalSplitCell(state, dispatch)) {
            return true;
          }

          return commands.splitSingleCell();
        },

      /**
       * Split a single unmerged cell into two cells horizontally
       * @category Command
       * @returns {Function} Command - true if split, false if position invalid
       * @example
       * splitSingleCell()
       * @note This command splits a single cell (not merged) into two cells by:
       * - Dividing the cell width in half
       * - Inserting a new cell to the right
       * - Adjusting colspan for cells in other rows that span this column
       * - Only works on cells with colspan=1 and rowspan=1
       * @note Different from splitCell which splits merged cells back to original cells
       */
      splitSingleCell:
        () =>
        ({ state, dispatch, tr }) => {
          // For reference.
          // https://github.com/ProseMirror/prosemirror-tables/blob/a99f70855f2b3e2433bc77451fedd884305fda5b/src/commands.ts#L497
          const sel = state.selection;
          let cellNode;
          let cellPos;
          if (!(sel instanceof CellSelection)) {
            cellNode = cellWrapping(sel.$from);
            if (!cellNode) return false;
            cellPos = cellAround(sel.$from)?.pos;
          } else {
            if (sel.$anchorCell.pos != sel.$headCell.pos) return false;
            cellNode = sel.$anchorCell.nodeAfter;
            cellPos = sel.$anchorCell.pos;
          }
          if (cellNode == null || cellPos == null) {
            return false;
          }
          if (cellNode.attrs.colspan != 1 || cellNode.attrs.rowspan != 1) {
            return false;
          }
          //

          if (dispatch) {
            let rect = selectedRect(state);
            let currentRow = rect.top;
            let currentCol = rect.left;
            let baseAttrs = { ...cellNode.attrs };
            let currentColWidth = baseAttrs.colwidth;
            let newCellWidth = null;

            // Get new width for the current and new cells.
            if (currentColWidth && currentColWidth[0]) {
              newCellWidth = Math.ceil(currentColWidth[0] / 2);
            }

            // Update width of the current cell.
            if (newCellWidth) {
              tr.setNodeMarkup(tr.mapping.map(cellPos, 1), null, { ...baseAttrs, colwidth: [newCellWidth] });
            }

            // Insert new cell after the current one.
            const newCellAttrs = { ...baseAttrs, colwidth: newCellWidth ? [newCellWidth] : null };
            const newCell = getCellType({ node: cellNode, state }).createAndFill(newCellAttrs);
            tr.insert(tr.mapping.map(cellPos + cellNode.nodeSize, 1), newCell);

            // Update colspan and colwidth for cells in other rows.
            for (let row = 0; row < rect.map.height; row++) {
              if (row === currentRow) continue;

              let rowCells = new Set();
              for (let col = 0; col < rect.map.width; col++) {
                let cellIndex = rect.map.map[row * rect.map.width + col];
                if (cellIndex != null) rowCells.add(cellIndex);
              }

              [...rowCells].forEach((cellIndex) => {
                let cellRect = rect.map.findCell(cellIndex);

                // If cell covers the column where we added new cell.
                if (cellRect.left <= currentCol && cellRect.right > currentCol) {
                  let cellPos = tr.mapping.map(rect.tableStart + cellIndex, 1);
                  let cell = tr.doc.nodeAt(cellPos);

                  if (cell) {
                    let newColspan = (cell.attrs.colspan || 1) + 1;
                    let updatedColwidth = cell.attrs.colwidth;
                    if (updatedColwidth && newCellWidth) {
                      let originalColIndex = currentCol - cellRect.left;
                      updatedColwidth = [
                        ...updatedColwidth.slice(0, originalColIndex),
                        newCellWidth, // current cell width
                        newCellWidth, // new cell width
                        ...updatedColwidth.slice(originalColIndex + 1),
                      ];
                    }
                    let cellAttrs = { ...cell.attrs, colspan: newColspan, colwidth: updatedColwidth };
                    tr.setNodeMarkup(cellPos, null, cellAttrs);
                  }
                }
              });
            }
          }

          return true;
        },

      /**
       * Toggle between merge and split cells based on selection
       * @category Command
       * @returns {Function} Command
       * @example
       * mergeOrSplit()
       * @note Merges if multiple cells selected, splits if merged cell selected
       */
      mergeOrSplit:
        () =>
        ({ state, dispatch, commands }) => {
          if (originalMergeCells(state, dispatch)) {
            return true;
          }

          return commands.splitCell();
        },

      /**
       * Toggle the first column as header column
       * @category Command
       * @returns {Function} Command
       * @example
       * toggleHeaderColumn()
       */
      toggleHeaderColumn:
        () =>
        ({ state, dispatch }) => {
          return toggleHeader('column')(state, dispatch);
        },

      /**
       * Toggle header-row status on the row(s) under the cursor or CellSelection.
       *
       * Sets both the cell node type (`tableHeader` ↔ `tableCell`) **and** the
       * OOXML repeat-header flag (`tableRowProperties.repeatHeader`) in a single
       * transaction so that undo reverts both changes atomically.
       *
       * Does NOT modify `tblLook.firstRow` (first-row style option).
       *
       * @category Command
       * @returns {Function} Command
       * @example
       * toggleHeaderRow()
       */
      toggleHeaderRow:
        () =>
        ({ state, dispatch }) => {
          return toggleHeaderRowCommand(state, dispatch);
        },

      /**
       * Toggle current cell as header cell
       * @category Command
       * @returns {Function} Command
       * @example
       * toggleHeaderCell()
       */
      toggleHeaderCell:
        () =>
        ({ state, dispatch }) => {
          return toggleHeaderCell(state, dispatch);
        },

      /**
       * Set an attribute on selected cells
       * @category Command
       * @param {string} name - Attribute name
       * @param {*} value - Attribute value
       * @returns {Function} Command
       * @example
       * setCellAttr('background', { color: 'ff0000' })
       * setCellAttr('verticalAlign', 'middle')
       */
      setCellAttr:
        (name, value) =>
        ({ state, dispatch }) => {
          return setCellAttr(name, value)(state, dispatch);
        },

      /**
       * Navigate to the next cell (Tab behavior)
       * @category Command
       * @returns {Function} Command
       * @example
       * goToNextCell()
       */
      goToNextCell:
        () =>
        ({ state, dispatch }) => {
          return goToNextCell(1)(state, dispatch);
        },

      /**
       * Navigate to the previous cell (Shift+Tab behavior)
       * @category Command
       * @returns {Function} Command
       * @example
       * goToPreviousCell()
       */
      goToPreviousCell:
        () =>
        ({ state, dispatch }) => {
          return goToNextCell(-1)(state, dispatch);
        },

      /**
       * Fix table structure inconsistencies
       * @category Command
       * @returns {Function} Command
       * @example
       * fixTables()
       * @note Repairs malformed tables and normalizes structure
       */
      fixTables:
        () =>
        ({ state, dispatch }) => {
          if (dispatch) {
            fixTables(state);
          }

          return true;
        },

      /**
       * Set cell selection programmatically
       * @category Command
       * @param {CellSelectionPosition} pos - Cell selection coordinates
       * @returns {Function} Command
       * @example
       * setCellSelection({ anchorCell: 10, headCell: 15 })
       */
      setCellSelection:
        (pos) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setSelection(CellSelection.create(tr.doc, pos.anchorCell, pos.headCell));
          }

          return true;
        },

      /**
       * Set background color for selected cells
       * @category Command
       * @param {string} value - Color value (hex with or without #)
       * @example
       * editor.commands.setCellBackground('#ff0000')
       * editor.commands.setCellBackground('ff0000')
       */
      setCellBackground:
        (value) =>
        ({ editor, commands, dispatch }) => {
          const { selection } = editor.state;

          if (!isCellSelection(selection)) {
            return false;
          }

          const color = value?.startsWith('#') ? value.slice(1) : value;

          if (dispatch) {
            return commands.setCellAttr('background', { color });
          }

          return true;
        },

      /**
       * Remove all borders from table and its cells
       * @category Command
       * @returns {Function} Command
       * @example
       * deleteCellAndTableBorders()
       * @note Sets all border sizes to 0
       */
      deleteCellAndTableBorders:
        () =>
        ({ state, tr }) => {
          if (!isInTable(state)) {
            return false;
          }

          const table = resolveCommandTargetTable(state.selection);

          if (!table) {
            return false;
          }

          // remove from cells — write nil borders to tableCellProperties.borders (canonical source)
          const nilBorder = { val: 'nil', size: 0, space: 0, color: 'auto' };
          table.node.descendants((node, pos) => {
            if (['tableCell', 'tableHeader'].includes(node.type.name)) {
              const nextTableCellProperties = {
                ...(node.attrs.tableCellProperties ?? {}),
                borders: {
                  top: { ...nilBorder },
                  bottom: { ...nilBorder },
                  left: { ...nilBorder },
                  right: { ...nilBorder },
                },
              };
              const nextInlineKeys = [...new Set([...(node.attrs.tableCellPropertiesInlineKeys || []), 'borders'])];
              tr.setNodeMarkup(table.pos + 1 + pos, undefined, {
                ...node.attrs,
                borders: null,
                tableCellProperties: nextTableCellProperties,
                tableCellPropertiesInlineKeys: nextInlineKeys,
              });
            }
            return true;
          });

          // remove from table
          tr.setNodeMarkup(table.pos, undefined, {
            ...table.node.attrs,
            borders: createTableBorders({ size: 0 }),
            // TODO: This works around the issue that table borders are duplicated between
            // the attributes of the table and the tableProperties attribute.
            // This can be removed when the redundancy is eliminated.
            tableProperties: {
              ...table.node.attrs.tableProperties,
              borders: createTableBorders({ size: 0, space: 0, val: 'none', color: 'auto' }),
            },
          });

          return true;
        },
    };
  },

  addShortcuts() {
    return {
      Tab: () => {
        if (this.editor.commands.goToNextCell()) {
          return true;
        }
        if (!this.editor.can().addRowAfter()) {
          return false;
        }
        return this.editor.chain().addRowAfter().goToNextCell().run();
      },
      'Shift-Tab': () => this.editor.commands.goToPreviousCell(),
      Backspace: deleteTableWhenSelected,
      'Mod-Backspace': deleteTableWhenSelected,
      Delete: deleteTableWhenSelected,
      'Mod-Delete': deleteTableWhenSelected,
    };
  },

  addPmPlugins() {
    const resizable = this.options.resizable && this.editor.isEditable;
    const editor = this.editor;

    return [
      ...(resizable
        ? [
            columnResizing({
              // Disable PM's visual handles (custom overlay handles resizing)
              // Set to 0 to prevent PM from rendering its own resize handles
              // while keeping transaction helpers and constraint logic
              // @ts-expect-error - Options types will be fixed in TS migration
              handleWidth: 0,
              // @ts-expect-error - Options types will be fixed in TS migration
              cellMinWidth: this.options.cellMinWidth,
              // @ts-expect-error - Options types will be fixed in TS migration
              defaultCellMinWidth: this.options.cellMinWidth,
              // @ts-expect-error - Options types will be fixed in TS migration
              lastColumnResizable: this.options.lastColumnResizable,
              View: createTableView({
                editor: this.editor,
              }),
            }),
          ]
        : []),

      tableEditing({
        // @ts-expect-error - Options types will be fixed in TS migration
        allowTableNodeSelection: this.options.allowTableNodeSelection,
      }),

      createTableBoundaryNavigationPlugin(),

      // Normalize table style on paste / setContent / insertContent.
      // Only tables explicitly marked with needsTableStyleNormalization
      // are normalized, so DOCX-imported tables with tableStyleId=null keep
      // their original semantics.
      //
      // The plugin applies the resolved style via
      // normalizeNewTableAttrs, so every creation path is covered.
      //
      // On the first call, scans the entire document to catch tables
      // present in the initial content (which don't come through a
      // docChanged transaction). Subsequent calls only scan changed ranges.
      (() => {
        let initialScanDone = false;
        return new Plugin({
          key: new PluginKey('tableStyleNormalization'),
          appendTransaction(transactions, _oldState, newState) {
            const needsInitialScan = !initialScanDone;
            initialScanDone = true;

            const hasDocChange = transactions.some((t) => t.docChanged);
            if (!hasDocChange && !needsInitialScan) return null;

            // Build scan ranges: full document on first call, changed ranges thereafter.
            const ranges = [];
            if (needsInitialScan) {
              ranges.push(0, newState.doc.content.size);
            } else {
              const allMaps = [];
              for (const t of transactions) {
                for (let i = 0; i < t.mapping.maps.length; i++) {
                  allMaps.push(t.mapping.maps[i]);
                }
              }
              for (let i = 0; i < allMaps.length; i++) {
                allMaps[i].forEach((_oldFrom, _oldTo, newFrom, newTo) => {
                  for (let j = i + 1; j < allMaps.length; j++) {
                    newFrom = allMaps[j].map(newFrom, 1);
                    newTo = allMaps[j].map(newTo, -1);
                  }
                  ranges.push(newFrom, Math.max(newFrom, newTo));
                });
              }
            }
            if (ranges.length === 0) return null;

            let tr = null;
            for (let r = 0; r < ranges.length; r += 2) {
              const from = ranges[r];
              const to = Math.min(ranges[r + 1], newState.doc.content.size);
              if (from >= to) continue;
              newState.doc.nodesBetween(from, to, (node, pos) => {
                if (node.type.name === 'table' && node.attrs.needsTableStyleNormalization === true) {
                  const attrs = {
                    ...node.attrs,
                    needsTableStyleNormalization: false,
                  };

                  // Respect explicit table borders from imported content.
                  if (!Object.keys(node.attrs.borders ?? {}).length) {
                    const resolved = normalizeNewTableAttrs(editor);
                    // Use undefined as sentinel for "normalized, no style found"
                    attrs.tableStyleId = resolved.tableStyleId ?? undefined;
                    if (resolved.borders) {
                      attrs.borders = resolved.borders;
                    }
                    if (resolved.tableProperties) {
                      attrs.tableProperties = { ...(node.attrs.tableProperties ?? {}), ...resolved.tableProperties };
                    }
                  }

                  if (!tr) tr = newState.tr;
                  tr.setNodeMarkup(pos, undefined, attrs);
                }

                // Migrate legacy attrs.borders on cells to tableCellProperties.borders
                if (
                  (node.type.name === 'tableCell' || node.type.name === 'tableHeader') &&
                  node.attrs.borders != null
                ) {
                  const tcpBorders = node.attrs.tableCellProperties?.borders;
                  const cellAttrs = { ...node.attrs };

                  if (tcpBorders && typeof tcpBorders === 'object' && Object.keys(tcpBorders).length > 0) {
                    // Cell already has canonical inline borders — clear legacy attrs.borders
                    cellAttrs.borders = null;
                  } else if (isLegacySchemaDefaultBorders(node.attrs.borders)) {
                    // Matches old schema-default shape — drop; style cascade owns borders
                    cellAttrs.borders = null;
                  } else {
                    // Non-default borders from a prior session — migrate to tableCellProperties.borders
                    cellAttrs.tableCellProperties = {
                      ...(node.attrs.tableCellProperties ?? {}),
                      borders: convertBordersToOoxmlFormat(node.attrs.borders),
                    };
                    cellAttrs.borders = null;
                  }

                  if (cellAttrs.borders !== node.attrs.borders) {
                    if (!tr) tr = newState.tr;
                    tr.setNodeMarkup(pos, undefined, cellAttrs);
                  }
                }
              });
            }

            return tr;
          },
        });
      })(),
    ];
  },

  extendNodeSchema(extension) {
    return {
      tableRole: callOrGet(
        getExtensionConfigField(extension, 'tableRole', {
          name: extension.name,
          options: extension.options,
          storage: extension.storage,
        }),
      ),
    };
  },
});

/**
 * Get the cell type based on table role
 * @private
 * @param {Object} params - Parameters
 * @param {Object} params.node - Cell node
 * @param {Object} params.state - Editor state
 * @returns {Object} Cell node type
 */
function getCellType({ node, state }) {
  const nodeTypes = tableNodeTypes(state.schema);
  return nodeTypes[node.type.spec.tableRole];
}

/**
 * Copy cell attributes excluding span properties
 * @private
 * @param {Object} node - Cell node
 * @returns {Object} Filtered attributes without colspan, rowspan, colwidth
 * @note Used when creating new cells to preserve styling but not structure
 */
function copyCellAttrs(node) {
  // Exclude colspan, rowspan and colwidth attrs.
  const { colspan: _colspan, rowspan: _rowspan, colwidth: _colwidth, ...attrs } = node.attrs;
  return attrs;
}

/**
 * Get current cell attributes from selection
 * @private
 * @param {Object} state - Editor state
 * @returns {CurrentCellInfo} Current cell information
 */
function getCurrentCellAttrs(state) {
  let rect = selectedRect(state);
  let index = rect.top * rect.map.width + rect.left;
  let pos = rect.map.map[index];
  let cell = rect.table.nodeAt(pos);
  let attrs = copyCellAttrs(cell);
  return { rect, cell, attrs };
}
