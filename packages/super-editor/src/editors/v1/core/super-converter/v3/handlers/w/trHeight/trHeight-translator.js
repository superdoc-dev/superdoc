import { NodeTranslator } from '@translator';

/**
 * The NodeTranslator instance for the trHeight element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 474
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:trHeight',
  sdNodeOrKeyName: 'rowHeight',
  encode: ({ nodes }) => {
    const heightAttrs = {};
    const val = nodes[0].attributes['w:val'];
    if (val) {
      heightAttrs['value'] = parseInt(val, 10);
    }
    const rule = nodes[0].attributes['w:hRule'];
    if (rule) {
      heightAttrs['rule'] = rule;
    }
    return Object.keys(heightAttrs).length > 0 ? heightAttrs : undefined;
  },
  decode: ({ node }) => {
    if (!node.attrs?.rowHeight) return;
    const heightAttrs = {};
    if (typeof node.attrs.rowHeight.value === 'number' && !isNaN(node.attrs.rowHeight.value)) {
      heightAttrs['w:val'] = String(node.attrs.rowHeight.value);
    }
    if (node.attrs.rowHeight.rule) {
      heightAttrs['w:hRule'] = node.attrs.rowHeight.rule;
    }
    return Object.keys(heightAttrs).length > 0 ? { attributes: heightAttrs } : undefined;
  },
});
