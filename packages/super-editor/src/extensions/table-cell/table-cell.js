// @ts-nocheck

/**
 * Conditional formatting properties
 * @typedef {Object} CnfStyle
 * @property {boolean} [firstRow] - Specifies that the first row conditional formatting should be applied
 * @property {boolean} [lastRow] - Specifies that the last row conditional formatting should be applied
 * @property {boolean} [firstColumn] - Specifies that the first column conditional formatting should be applied
 * @property {boolean} [lastColumn] - Specifies that the last column conditional formatting should be applied
 * @property {boolean} [oddVBand] - Specifies that odd vertical banding conditional formatting should be applied
 * @property {boolean} [evenVBand] - Specifies that even vertical banding conditional formatting should be applied
 * @property {boolean} [oddHBand] - Specifies that odd horizontal banding conditional formatting should be applied
 * @property {boolean} [evenHBand] - Specifies that even horizontal banding conditional formatting should be applied
 * @property {boolean} [firstRowFirstColumn] - Specifies that the top-left corner cell conditional formatting should be applied
 * @property {boolean} [firstRowLastColumn] - Specifies that the top-right corner cell conditional formatting should be applied
 * @property {boolean} [lastRowFirstColumn] - Specifies that the bottom-left corner cell conditional formatting should be applied
 * @property {boolean} [lastRowLastColumn] - Specifies that the bottom-right corner cell conditional formatting should be applied
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 379
 */

/**
 * Table Cell Properties
 * @typedef {Object} TableCellProperties
 * @property {CnfStyle} [cnfStyle] - Conditional formatting properties
 * @property {import('../table/table.js').TableMeasurement} [cellWidth] - Cell width
 * @property {number} [gridSpan] - Number of grid columns spanned by the cell
 * @property {'restart' | 'continue'} [vMerge] - Vertical merge setting
 * @property {import('../table/table.js').TableBorders} [borders] - Cell border properties
 * @property {import('../table/table.js').ShadingProperties} [shading] - Cell shading properties
 * @property {boolean} [noWrap] - Specifies that the cell content should not wrap
 * @property {import('../table/table.js').TableCellMargins} [cellMargins] - Cell margin properties
 * @property {'btLr' | 'tbRl'} [textDirection] - Text direction
 * @property {boolean} [tcFitText] - Specifies that the cell content should be fit to the cell
 * @property {'top' | 'center' | 'bottom'} [vAlign] - Vertical alignment
 * @property {boolean} [hideMark] - Specifies that the cell mark should be hidden
 * @property {{header: string}[]} [headers] - This element specifies a list of references, using a unique identifier, to a table header cell that is associated with the current table cell
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 463
 */

import { Node, Attribute } from '@core/index.js';
import { createCellBorders } from './helpers/createCellBorders.js';
import { renderCellBorderStyle } from './helpers/renderCellBorderStyle.js';

/**
 * Cell margins configuration
 * @typedef {Object} CellMargins
 * @property {number} [top] - Top margin in pixels
 * @property {number} [right] - Right margin in pixels
 * @property {number} [bottom] - Bottom margin in pixels
 * @property {number} [left] - Left margin in pixels
 */

/**
 * Cell background configuration
 * @typedef {Object} CellBackground
 * @property {string} color - Background color (hex without #)
 */

/**
 * Configuration options for TableCell
 * @typedef {Object} TableCellOptions
 * @category Options
 * @property {Object} [htmlAttributes={'aria-label': 'Table cell node'}] - HTML attributes for table cells
 */

/**
 * Attributes for table cell nodes
 * @typedef {Object} TableCellAttributes
 * @category Attributes
 * @property {number} [colspan=1] - Number of columns this cell spans
 * @property {number} [rowspan=1] - Number of rows this cell spans
 * @property {number[]} [colwidth=[100]] - Column widths array in pixels
 * @property {CellBackground} [background] - Cell background color configuration
 * @property {string} [verticalAlign] - Vertical content alignment (top, middle, bottom)
 * @property {CellMargins} [cellMargins] - Internal cell padding
 * @property {import('./helpers/createCellBorders.js').CellBorders} [borders] - Cell border configuration
 * @property {string} [widthType='auto'] @internal - Internal width type
 * @property {string} [widthUnit='px'] @internal - Internal width unit
 */

/**
 * @module TableCell
 * @sidebarTitle Table Cell
 * @snippetPath /snippets/extensions/table-cell.mdx
 */
export const TableCell = Node.create({
  name: 'tableCell',

  content: 'block+',

  tableRole: 'cell',

  isolating: true,

  addOptions() {
    return {
      htmlAttributes: {
        'aria-label': 'Table cell node',
      },
    };
  },

  addAttributes() {
    return {
      colspan: {
        default: 1,
      },

      rowspan: {
        default: 1,
      },

      colwidth: {
        default: [100],
        parseDOM: (elem) => {
          const colwidth = elem.getAttribute('data-colwidth');
          const value = colwidth ? colwidth.split(',').map((width) => parseInt(width, 10)) : null;
          return value;
        },
        renderDOM: (attrs) => {
          if (!attrs.colwidth) return {};
          return {
            // @ts-expect-error - colwidth is known to be an array at runtime
            'data-colwidth': attrs.colwidth.join(','),
          };
        },
      },

      background: {
        renderDOM({ background }) {
          if (!background) return {};
          // @ts-expect-error - background is known to be an object at runtime
          const { color } = background || {};
          const style = `background-color: ${color ? `#${color}` : 'transparent'}`;
          return { style };
        },
      },

      verticalAlign: {
        renderDOM({ verticalAlign }) {
          if (!verticalAlign) return {};
          const style = `vertical-align: ${verticalAlign}`;
          return { style };
        },
      },

      cellMargins: {
        renderDOM({ cellMargins, borders }) {
          if (!cellMargins) return {};
          const sides = ['top', 'right', 'bottom', 'left'];
          const style = sides
            .map((side) => {
              const margin = cellMargins?.[side] ?? 0;
              const border = borders?.[side];
              // TODO: this should include table-level borders as well for the first/last cell in the row
              const borderSize = border && border.val !== 'none' ? Math.ceil(border.size) : 0;

              if (margin) return `padding-${side}: ${Math.max(0, margin - borderSize)}px;`;
              return '';
            })
            .join(' ');
          return { style };
        },
      },

      borders: {
        default: () => createCellBorders(),
        renderDOM: ({ borders }) => renderCellBorderStyle(borders),
      },

      widthType: {
        default: 'auto',
        rendered: false,
      },

      widthUnit: {
        default: 'px',
        rendered: false,
      },

      __placeholder: {
        default: null,
        parseDOM: (element) => {
          const value = element.getAttribute('data-placeholder');
          return value || null;
        },
        renderDOM({ __placeholder }) {
          if (!__placeholder) return {};
          return {
            'data-placeholder': __placeholder,
          };
        },
      },

      /**
       * @category Attribute
       * @param {TableCellProperties} tableCellProperties - Properties for the table cell.
       * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 463
       */
      tableCellProperties: {
        default: null,
        rendered: false,
      },
    };
  },

  parseDOM() {
    return [{ tag: 'td' }];
  },

  renderDOM({ htmlAttributes }) {
    return ['td', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), 0];
  },
});
