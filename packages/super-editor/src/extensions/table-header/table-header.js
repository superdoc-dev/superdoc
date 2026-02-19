// @ts-nocheck

import { Node, Attribute } from '@core/index.js';
import { createCellBorders } from '../table-cell/helpers/createCellBorders.js';
import { renderCellBorderStyle } from '../table-cell/helpers/renderCellBorderStyle.js';

/**
 * Configuration options for TableHeader
 * @typedef {Object} TableHeaderOptions
 * @category Options
 * @property {Object} [htmlAttributes={'aria-label': 'Table head node'}] - HTML attributes for table headers
 */

/**
 * Attributes for table header nodes
 * @typedef {Object} TableHeaderAttributes
 * @category Attributes
 * @property {number} [colspan=1] - Number of columns this header spans
 * @property {number} [rowspan=1] - Number of rows this header spans
 * @property {number[]} [colwidth=[100]] - Column widths array in pixels
 * @property {import('../table-cell/table-cell.js').CellBackground} [background] - Cell background color configuration
 * @property {string} [verticalAlign] - Vertical content alignment (top, middle, bottom)
 * @property {import('../table-cell/table-cell.js').CellMargins} [cellMargins] - Internal cell padding
 * @property {import('../table-cell/helpers/createCellBorders.js').CellBorders} [borders] - Cell border configuration
 * @property {string} [widthType='auto'] @internal - Internal width type
 * @property {string} [widthUnit='px'] @internal - Internal width unit
 * @property {import('../table-cell/table-cell.js').TableCellProperties} [tableCellProperties] @internal - Raw OOXML cell properties
 */

/**
 * @module TableHeader
 * @sidebarTitle Table Header
 * @snippetPath /snippets/extensions/table-header.mdx
 */
export const TableHeader = Node.create({
  name: 'tableHeader',

  content: 'block+',

  tableRole: 'header_cell',

  isolating: true,

  addOptions() {
    return {
      htmlAttributes: {
        'aria-label': 'Table head node',
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
        parseDOM: (element) => {
          const colwidth = element.getAttribute('data-colwidth');
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

      tableCellProperties: {
        default: null,
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
    };
  },

  parseDOM() {
    return [{ tag: 'th' }];
  },

  renderDOM({ htmlAttributes }) {
    return ['th', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), 0];
  },
});
