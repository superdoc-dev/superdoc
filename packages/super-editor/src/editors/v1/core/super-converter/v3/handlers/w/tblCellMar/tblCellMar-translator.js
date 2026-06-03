import { NodeTranslator } from '@translator';
import { createNestedPropertiesTranslator } from '../../utils.js';
import { marginBottomTranslator } from '../bottom/index.js';
import { marginEndTranslator } from '../end/index.js';
import { marginLeftTranslator } from '../left/index.js';
import { marginRightTranslator } from '../right/index.js';
import { marginStartTranslator } from '../start/index.js';
import { marginTopTranslator } from '../top/index.js';
import { CT_TC_MAR_CHILD_ORDER } from '../tcMar/tcMar-translator.js';

const propertyTranslators = [
  marginBottomTranslator,
  marginEndTranslator,
  marginLeftTranslator,
  marginRightTranslator,
  marginStartTranslator,
  marginTopTranslator,
];

// CT_TblCellMar has identical child sequence to CT_TcMar per ECMA-376 §A.1.
const baseConfig = createNestedPropertiesTranslator('w:tblCellMar', 'cellMargins', propertyTranslators);

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

export const translator = NodeTranslator.from(orderedConfig);
