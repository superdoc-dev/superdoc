import { parseBoolean, booleanToString } from '@converter/v3/handlers/utils.js';
import { NodeTranslator } from '@translator';

/**
 * The NodeTranslator instance for the w:caps element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 267
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:caps',
  sdNodeOrKeyName: 'textTransform',
  encode: ({ nodes }) => (parseBoolean(nodes[0].attributes?.['w:val'] ?? '1') ? 'uppercase' : 'none'),
  decode: ({ node }) =>
    node.attrs['textTransform'] != null
      ? { name: 'w:caps', attributes: { 'w:val': booleanToString(node.attrs['textTransform'] === 'uppercase') } }
      : undefined,
});
