import { NodeTranslator } from '@translator';
import { parseBoolean } from '@converter/v3/handlers/utils';

/**
 * The NodeTranslator instance for the bidiVisual element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 373
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:bidiVisual',
  sdNodeOrKeyName: 'rightToLeft',
  encode: ({ nodes }) => parseBoolean(nodes[0].attributes?.['w:val'] ?? '1'),
  decode: ({ node }) => (node.attrs.rightToLeft ? { attributes: {} } : undefined),
});
