import { NodeTranslator } from '@translator';
import { parseBoolean } from '@converter/v3/handlers/utils';

/**
 * The NodeTranslator instance for the tblHeader element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 433
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:tblHeader',
  sdNodeOrKeyName: 'repeatHeader',
  encode: ({ nodes }) => parseBoolean(nodes[0].attributes?.['w:val'] ?? '1'),
  decode: ({ node }) => (node.attrs.repeatHeader ? { attributes: {} } : undefined),
});
