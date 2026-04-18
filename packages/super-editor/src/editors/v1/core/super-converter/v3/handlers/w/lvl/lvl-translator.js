// @ts-check
import { NodeTranslator } from '@translator';
import {
  createNestedPropertiesTranslator,
  createIntegerAttributeHandler,
  createBooleanAttributeHandler,
} from '@converter/v3/handlers/utils.js';
import { translator as wLvlStartTranslator } from '../../w/start/lvlStart-translator.js';
import { translator as wLvlRestartTranslator } from '../../w/lvlRestart/lvlRestart-translator.js';
import { translator as wLvlPicBulletId } from '../../w/lvlPicBulletId/lvlPicBulletId-translator.js';
import { translator as wIsLglTranslator } from '../../w/isLgl/isLgl-translator.js';
import { translator as wPStyleTranslator } from '../../w/pStyle/pStyle-translator.js';
import { translator as wSuffTranslator } from '../../w/suff/suff-translator.js';
import { translator as wLvlTextTranslator } from '../../w/lvlText/lvlText-translator.js';
import { translator as wLvlJcTranslator } from '../../w/lvlJc/lvlJc-translator.js';
import { translator as wNumFmtTranslator } from '../../w/numFmt/numFmt-translator.js';
import { translator as wLegacyTranslator } from '../../w/legacy/legacy-translator.js';
import { translator as wPPrTranslator } from '../../w/pPr';
import { translator as wRPrTranslator } from '../../w/rpr';

// Property translators for w:lvl child elements
// Each translator handles a specific property
/** @type {import('@translator').NodeTranslator[]} */
const propertyTranslators = [
  wLvlStartTranslator,
  wLvlRestartTranslator,
  wLvlPicBulletId,
  wIsLglTranslator,
  wPStyleTranslator,
  wSuffTranslator,
  wLvlTextTranslator,
  wLvlJcTranslator,
  wNumFmtTranslator,
  wLegacyTranslator,
  wPPrTranslator,
  wRPrTranslator,
];

const attributeHandlers = [
  createIntegerAttributeHandler('w:ilvl'),
  createIntegerAttributeHandler('w:tplc'),
  createBooleanAttributeHandler('w:tentative'),
];

/**
 * The NodeTranslator instance for the w:lvl element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(
  createNestedPropertiesTranslator('w:lvl', 'lvl', propertyTranslators, {}, attributeHandlers),
);
