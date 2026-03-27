import { NodeTranslator } from '@translator';

/**
 * The NodeTranslator instance for the cantSplit element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 377
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:cantSplit',
  sdNodeOrKeyName: 'cantSplit',
  encode: ({ nodes }) => ['1', 'true'].includes(nodes[0].attributes?.['w:val'] ?? '1'),
  decode: ({ node }) => (node.attrs?.cantSplit ? { attributes: {} } : undefined),
});
