import { NodeTranslator } from '@translator';
import { createNestedPropertiesTranslator } from '../../utils.js';
import { marginBottomTranslator } from '../bottom/index.js';
import { marginEndTranslator } from '../end/index.js';
import { marginLeftTranslator } from '../left/index.js';
import { marginRightTranslator } from '../right/index.js';
import { marginStartTranslator } from '../start/index.js';
import { marginTopTranslator } from '../top/index.js';

const propertyTranslators = [
  marginBottomTranslator,
  marginEndTranslator,
  marginLeftTranslator,
  marginRightTranslator,
  marginStartTranslator,
  marginTopTranslator,
];

export const translator = NodeTranslator.from(
  createNestedPropertiesTranslator('w:tblCellMar', 'cellMargins', propertyTranslators),
);
