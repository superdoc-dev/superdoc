import { NodeTranslator } from '@translator';
import { createNestedPropertiesTranslator } from '../../utils.js';

import { marginBottomTranslator } from '../bottom/index.js';
import { marginEndTranslator } from '../end/index.js';
import { marginLeftTranslator } from '../left/index.js';
import { marginRightTranslator } from '../right/index.js';
import { marginStartTranslator } from '../start/index.js';
import { marginTopTranslator } from '../top/index.js';

// Property translators for w:tcMar child elements
// Each translator handles a specific margin property of the table cell
/** @type {import('@translator').NodeTranslator[]} */
const propertyTranslators = [
  marginBottomTranslator,
  marginEndTranslator,
  marginLeftTranslator,
  marginRightTranslator,
  marginStartTranslator,
  marginTopTranslator,
];

// ECMA-376 Part 1 §A.1 CT_TcMar is xsd:sequence; children must appear in this
// order on export. Identical to CT_TblCellMar; re-exported for that translator.
export const CT_TC_MAR_CHILD_ORDER = ['w:top', 'w:start', 'w:left', 'w:bottom', 'w:end', 'w:right'];

const baseConfig = createNestedPropertiesTranslator('w:tcMar', 'cellMargins', propertyTranslators);

const orderedConfig = {
  ...baseConfig,
  decode: function (params) {
    const result = baseConfig.decode.call(this, params);
    if (!result || !Array.isArray(result.elements)) return result;
    const rank = (name) => {
      const i = CT_TC_MAR_CHILD_ORDER.indexOf(name);
      return i === -1 ? CT_TC_MAR_CHILD_ORDER.length : i;
    };
    return {
      ...result,
      elements: [...result.elements].sort((a, b) => rank(a.name) - rank(b.name)),
    };
  },
};

/**
 * The NodeTranslator instance for the w:tcMar element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 462
 */
export const translator = NodeTranslator.from(orderedConfig);
