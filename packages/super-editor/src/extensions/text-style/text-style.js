// @ts-nocheck
import { Mark, Attribute } from '@core/index.js';
import { annotationClass, annotationContentClass } from '../field-annotation/index.js';

/**
 * Configuration options for TextStyle
 * @typedef {Object} TextStyleOptions
 * @category Options
 * @property {Object} [htmlAttributes={}] - Custom HTML attributes to apply to text style spans
 */

/**
 * Attributes for text style marks
 * @typedef {Object} TextStyleAttributes
 * @category Attributes
 * @property {string} [styleId] - Style identifier for referencing predefined styles
 */

/**
 * @module TextStyle
 * @sidebarTitle Text Style
 * @snippetPath /snippets/extensions/text-style.mdx
 */
export const TextStyle = Mark.create({
  name: 'textStyle',

  addOptions() {
    return {
      htmlAttributes: {},
    };
  },

  parseDOM() {
    return [
      {
        tag: 'span',
        getAttrs: (el) => {
          const hasStyles = el.hasAttribute('style');
          const isAnnotation = el.classList.contains(annotationClass) || el.classList.contains(annotationContentClass);
          if (!hasStyles || isAnnotation) return false;
          return {};
        },
      },
      {
        getAttrs: (node) => {
          const fontFamily = node.style.fontFamily?.replace(/['"]+/g, '');
          const fontSize = node.style.fontSize;
          const textTransform = node.style.textTransform;
          if (fontFamily || fontSize || textTransform) {
            return {
              fontFamily: fontFamily || null,
              fontSize: fontSize || null,
              textTransform: textTransform || null,
            };
          }
          return false;
        },
      },
    ];
  },

  renderDOM({ htmlAttributes }) {
    return ['span', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), 0];
  },

  addAttributes() {
    return {
      /**
       * @category Attribute
       * @param {string} [styleId] - Style identifier for referencing predefined styles
       */
      styleId: {},
      /**
       * Vertical alignment for subscript/superscript text (DOCX w:vertAlign).
       * Standard values: 'superscript', 'subscript', 'baseline'.
       * When both vertAlign and position are present, position takes precedence.
       * Renders as CSS vertical-align with 65% font-size scaling for super/subscript.
       * @category Attribute
       * @param {string} [vertAlign] - Vertical alignment mode ('superscript' | 'subscript' | 'baseline')
       */
      vertAlign: {
        default: null,
        renderDOM: (attrs) => {
          if (!attrs.vertAlign || attrs.position) return {};
          if (attrs.vertAlign === 'superscript') {
            return { style: 'vertical-align: super; font-size: 65%;' };
          }
          if (attrs.vertAlign === 'subscript') {
            return { style: 'vertical-align: sub; font-size: 65%;' };
          }
          if (attrs.vertAlign === 'baseline') {
            return { style: 'vertical-align: baseline;' };
          }
          return {};
        },
        parseDOM: (el) => {
          const va = el.style?.verticalAlign;
          if (va === 'super') return 'superscript';
          if (va === 'sub') return 'subscript';
          if (va === 'baseline') return 'baseline';
          return null;
        },
      },
      /**
       * Custom vertical position offset in points (DOCX w:position).
       * Numeric value specifying vertical offset (positive raises, negative lowers).
       * Format: '{number}pt' (e.g., '2pt', '-1.5pt').
       * Takes precedence over vertAlign when both are present.
       * Renders as CSS vertical-align with the exact offset value.
       * @category Attribute
       * @param {string} [position] - Vertical position offset (e.g., '2pt', '-1pt')
       */
      position: {
        default: null,
        renderDOM: (attrs) => {
          if (!attrs.position) return {};
          return { style: `vertical-align: ${attrs.position};` };
        },
        parseDOM: (el) => {
          const va = el.style?.verticalAlign;
          if (!va) return null;
          const numeric = parseFloat(va);
          if (!Number.isNaN(numeric)) {
            return `${numeric}pt`;
          }
          return null;
        },
      },
    };
  },

  addCommands() {
    return {
      /**
       * Remove empty text style marks
       * @category Command
       * @example
       * editor.commands.removeEmptyTextStyle()
       * @note Cleanup utility to prevent empty span elements
       * @note Automatically checks if any style attributes exist before removal
       */
      removeEmptyTextStyle:
        () =>
        ({ state, commands }) => {
          const attributes = Attribute.getMarkAttributes(state, this.type);
          const hasStyles = Object.entries(attributes).some(([, value]) => !!value);
          if (hasStyles) return true;
          return commands.unsetMark(this.name);
        },
    };
  },
});
