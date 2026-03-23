// @ts-nocheck
import { Node } from '@core/Node.js';
import { Attribute } from '@core/Attribute.js';

/**
 * @typedef {Object} CnfStyle
 * @property {boolean} [evenHBand] Specifies that the object has inherited the conditional properties applied to the even numbered horizontal bands of the parent object.
 * @property {boolean} [evenVBand] Specifies that the object has inherited the conditional properties applied to the even numbered vertical bands of the parent object.
 * @property {boolean} [firstColumn] Specifies that the object has inherited the conditional properties applied to the first column of the parent object.
 * @property {boolean} [firstRow] Specifies that the object has inherited the conditional properties applied to the first row of the parent object.
 * @property {boolean} [firstRowFirstColumn] Specifies that the object has inherited the conditional properties applied to the cell that is in the first row and first column of the parent object.
 * @property {boolean} [firstRowLastColumn] Specifies that the object has inherited the conditional properties applied to the cell that is in the first row and last column of the parent object.
 * @property {boolean} [lastColumn] Specifies that the object has inherited the conditional properties
 * applied to the last column of the parent object.
 * @property {boolean} [lastRow] Specifies that the object has inherited the conditional properties
 * applied to the last row of the parent object.
 * @property {boolean} [lastRowFirstColumn] Specifies that the object has inherited the conditional properties applied to the cell that is in the last row and first column of the parent object.
 * @property {boolean} [lastRowLastColumn] Specifies that the object has inherited the conditional properties applied to the cell that is in the last row and last column of the parent object.
 * @property {boolean} [oddHBand] Specifies that the object has inherited the conditional properties applied to the odd numbered horizontal bands of the parent object.
 * @property {boolean} [oddVBand] Specifies that the object has inherited the conditional properties applied to the odd numbered vertical bands of the parent object.
 */

/**
 * @typedef {Object} TableRowProperties
 * @property {boolean} [cantSplit] Indicates that this row should not be split across pages when paginating/exporting.
 * @property {CnfStyle} [cnfStyle] - Specifies the set of conditional table style formatting properties which have been applied to this row
 * @property {string} [divId] - Specifies the HTML div information which is associated with this row.
 * @property {number} [gridAfter] - Specifies the number of grid columns to be that should be left empty after the last cell in this row.
 * @property {number} [gridBefore] - Specifies the number of grid columns that should be skipped before the first cell in this row.
 * @property {boolean} [hidden] - Specifies that the glyph representing the end character of current table row shall not be displayed in the current document.
 * @property {"center" | "end" | "left" | "right" | "start"} [jc] - Specifies the overall justification of the contents of this row.
 * @property {Object} [tblCellSpacing] - Specifies the amount of spacing that shall be applied between the cells in this row.
 * @property {number} [tblCellSpacing.value] - The size of the spacing in twenieths of a point (1/1440 of an inch).
 * @property {"auto" | "dxa" | "nil" | "pct"} [tblCellSpacing.type] - The type of spacing.
 * @property {boolean} [repeatHeader] - Specifies that this row is to be repeated as a header row at the top of each page on which the table is displayed.
 * @property {"atLeast" | "exact" | "auto"} [rowHeight.rule] - The rule for the row height.
 * @property {Object} [wAfter] - Specifies the preferred width for the total number of grid columns after this table row.
 * @property {number} [wAfter.value] - The width in twenieths of a point (1/1440 of an inch).
 * @property {"auto" | "dxa" | "nil" | "pct"} [wAfter.type] - The type of width.
 * @property {Object} [wBefore] - Specifies the preferred width for the total number of grid columns before this table row.
 * @property {number} [wBefore.value] - The width in twenieths of a point (1/1440 of an inch).
 * @property {"auto" | "dxa" | "nil" | "pct"} [wBefore.type] - The type of width.
 */

/**
 * Configuration options for TableRow
 * @typedef {Object} TableRowOptions
 * @category Options
 * @property {Object} [htmlAttributes={'aria-label': 'Table row node'}] - HTML attributes for table rows
 */

/**
 * Attributes for table row nodes
 * @typedef {Object} TableRowAttributes
 * @category Attributes
 * @property {number} [rowHeight] - Fixed row height in pixels
 * @property {boolean} [cantSplit=false] - Indicates row should not split across pages
 * @property {TableRowProperties} [tableRowProperties] @internal - Internal row properties
 * @property {string} [rsidDel] @internal - Editing session ID for deletion
 * @property {string} [rsidR] @internal - Editing session ID for addition
 * @property {string} [rsidRPr] @internal - Editing session ID for row mark modification
 * @property {string} [rsidTr] @internal - Editing session ID for properties modification
 * @property {string} [paraId] @internal - Unique identifier for the row
 * @property {string} [textId] @internal - Unique identifier for row text
 */

/**
 * @module TableRow
 * @sidebarTitle Table Row
 * @snippetPath /snippets/extensions/table-row.mdx
 */
export const TableRow = Node.create({
  name: 'tableRow',

  content: '(tableCell | tableHeader)*',

  tableRole: 'row',

  addOptions() {
    return {
      htmlAttributes: {
        'aria-label': 'Table row node',
      },
    };
  },

  addAttributes() {
    return {
      /** @private */
      sdBlockId: {
        default: null,
        keepOnSplit: false,
        parseDOM: (elem) => elem.getAttribute('data-sd-block-id'),
        renderDOM: (attrs) => {
          return attrs.sdBlockId ? { 'data-sd-block-id': attrs.sdBlockId } : {};
        },
      },

      rowHeight: {
        renderDOM({ rowHeight }) {
          if (!rowHeight) return {};
          const style = `height: ${rowHeight}px`;
          return { style };
        },
      },

      cantSplit: {
        default: false,
        parseDOM() {
          return {};
        },
        renderDOM({ cantSplit }) {
          // Render as a data attribute so it can be inspected in the DOM, but it's optional.
          if (!cantSplit) return {};
          return { 'data-cant-split': 'true' };
        },
      },
      /**
       * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 377-482
       */
      tableRowProperties: { rendered: false },
      /**
       * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 472
       */
      rsidDel: { rendered: false },
      /**
       * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 472
       */
      rsidR: { rendered: false },
      /**
       * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 473
       */
      rsidRPr: { rendered: false },
      /**
       * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 473
       */
      rsidTr: { rendered: false },
      /**
       * @see {@link https://learn.microsoft.com/en-us/openspecs/office_standards/ms-docx/a0e7d2e2-2246-44c6-96e8-1cf009823615}
       */
      paraId: { rendered: false },
      /**
       * @see {@link https://learn.microsoft.com/en-us/openspecs/office_standards/ms-docx/b7eeddec-7c50-47fb-88b6-1feec3ed832c}
       */
      textId: { rendered: false },
    };
  },

  parseDOM() {
    return [{ tag: 'tr' }];
  },

  renderDOM({ htmlAttributes }) {
    return ['tr', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), 0];
  },
});
