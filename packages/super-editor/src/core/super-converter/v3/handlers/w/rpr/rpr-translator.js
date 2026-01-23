import { NodeTranslator } from '@translator';
import { createNestedPropertiesTranslator } from '@converter/v3/handlers/utils.js';
import { translator as boldTranslator } from '../b/b-translator.js';
import { translator as boldCsTranslator } from '../bCs/bCs-translator.js';
import { translator as borderTranslator } from '../bdr/bdr-translator.js';
import { translator as italicTranslator } from '../i/i-translator.js';
import { translator as underlineTranslator } from '../u/u-translator.js';
import { translator as strikeTranslator } from '../strike/strike-translator.js';
import { translator as dStrikeTranslator } from '../dstrike/dstrike-translator.js';
import { translator as colorTranslator } from '../color/color-translator.js';
import { translator as highlightTranslator } from '../highlight/highlight-translator.js';
import { translator as fontFamilyTranslator } from '../rFonts/rFonts-translator.js';
import { translator as runStyleTranslator } from '../rStyle/rstyle-translator.js';
import { translator as fontSizeTranslator } from '../sz/sz-translator.js';
import { translator as fontSizeCsTranslator } from '../szcs/szcs-translator.js';
import { translator as capsTranslator } from '../caps/caps-translator.js';
import { translator as shdTranslator } from '../shd/shd-translator.js';
import { translator as langTranslator } from '../lang/lang-translator.js';
import { translator as letterSpacingTranslator } from '../spacing/letter-spacing-translator.js';
import { translator as vertAlignTranslator } from '../vertAlign/vertAlign-translator.js';
import { translator as smallCapsTranslator } from '../smallCaps/smallCaps-translator.js';
import { translator as snapToGridTranslator } from '../snapToGrid/snapToGrid-translator.js';
import { translator as embossTranslator } from '../emboss/emboss-translator.js';
import { translator as imprintTranslator } from '../imprint/imprint-translator.js';
import { translator as noProofTranslator } from '../noProof/noProof-translator.js';
import { translator as oMathTranslator } from '../oMath/oMath-translator.js';
import { translator as outlineTranslator } from '../outline/outline-translator.js';
import { translator as shadowTranslator } from '../shadow/shadow-translator.js';
import { translator as vanishTranslator } from '../vanish/vanish-translator.js';
import { translator as specVanishTranslator } from '../specVanish/specVanish-translator.js';
import { translator as effectTranslator } from '../effect/effect-translator.js';
import { translator as emTranslator } from '../em/em-translator.js';
import { translator as wTranslator } from '../w/w-translator.js';
import { translator as kernTranslator } from '../kern/kern-translator.js';
import { translator as positionTranslator } from '../position/position-translator.js';
import { translator as fitTextTranslator } from '../fitText/fitText-translator.js';
import { translator as eastAsianLayoutTranslator } from '../eastAsianLayout/eastAsianLayout-translator.js';
import { translator as rtlTranslator } from '../rtl/rtl-translator.js';
import { translator as csTranslator } from '../cs/cs-translator.js';
import { translator as iCsTranslator } from '../iCs/iCs-translator.js';
import { translator as webHiddenTranslator } from '../webHidden/webHidden-translator.js';

// Property translators for w:rPr child elements
// Each translator handles a specific property of the run properties
/** @type {import('@translator').NodeTranslator[]} */
export const propertyTranslators = [
  boldCsTranslator,
  boldTranslator,
  borderTranslator,
  capsTranslator,
  colorTranslator,
  csTranslator,
  dStrikeTranslator,
  eastAsianLayoutTranslator,
  effectTranslator,
  emTranslator,
  embossTranslator,
  fitTextTranslator,
  fontFamilyTranslator,
  fontSizeCsTranslator,
  fontSizeTranslator,
  highlightTranslator,
  imprintTranslator,
  italicTranslator,
  iCsTranslator,
  kernTranslator,
  langTranslator,
  letterSpacingTranslator,
  noProofTranslator,
  oMathTranslator,
  outlineTranslator,
  positionTranslator,
  rtlTranslator,
  runStyleTranslator,
  shadowTranslator,
  shdTranslator,
  smallCapsTranslator,
  snapToGridTranslator,
  specVanishTranslator,
  strikeTranslator,
  underlineTranslator,
  vanishTranslator,
  vertAlignTranslator,
  webHiddenTranslator,
  wTranslator,
];

/**
 * The NodeTranslator instance for the w:rPr element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(
  createNestedPropertiesTranslator('w:rPr', 'runProperties', propertyTranslators),
);
