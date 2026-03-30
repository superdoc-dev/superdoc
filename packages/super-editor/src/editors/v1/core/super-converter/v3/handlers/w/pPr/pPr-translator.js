// @ts-check
import { NodeTranslator } from '@translator';
import { createNestedPropertiesTranslator } from '@converter/v3/handlers/utils.js';
import { translator as mcAlternateContentTranslator } from '../../mc/altermateContent';
import { translator as wAdjustRightIndTranslator } from '../adjustRightInd';
import { translator as wAutoSpaceDETranslator } from '../autoSpaceDE';
import { translator as wAutoSpaceDNTranslator } from '../autoSpaceDN';
import { translator as wBidiTranslator } from '../bidi';
import { translator as wCnfStyleTranslator } from '../cnfStyle';
import { translator as wContextualSpacingTranslator } from '../contextualSpacing';
import { translator as wDivIdTranslator } from '../divId';
import { translator as wFramePrTranslator } from '../framePr';
import { translator as wIndTranslator } from '../ind';
import { translator as wJcTranslatorTranslator } from '../jc';
import { translator as wKeepLinesTranslator } from '../keepLines';
import { translator as wKeepNextTranslator } from '../keepNext';
import { translator as wKinsokuTranslator } from '../kinsoku';
import { translator as wMirrorIndentsTranslator } from '../mirrorIndents';
import { translator as wNumPrTranslator } from '../numPr';
import { translator as wOutlineLvlTranslator } from '../outlineLvl';
import { translator as wOverflowPunctTranslator } from '../overflowPunct';
import { translator as wPBdrTranslator } from '../pBdr';
import { translator as wPStyleTranslator } from '../pStyle';
import { translator as wPageBreakBeforeTranslator } from '../pageBreakBefore';
import { translator as wShdTranslator } from '../shd';
import { translator as wSnapToGridTranslator } from '../snapToGrid';
import { translator as wSpacingTranslator } from '../spacing';
import { translator as wSuppressAutoHyphensTranslator } from '../suppressAutoHyphens';
import { translator as wSuppressLineNumbersTranslator } from '../suppressLineNumbers';
import { translator as wSuppressOverlapTranslator } from '../suppressOverlap';
import { translator as wTabsTranslator } from '../tabs';
import { translator as wTextAlignmentTranslator } from '../textAlignment';
import { translator as wTextDirectionTranslator } from '../textDirection';
import { translator as wTextboxTightWrapTranslator } from '../textboxTightWrap';
import { translator as wTopLinePunctTranslator } from '../topLinePunct';
import { translator as wWidowControlTranslator } from '../widowControl';
import { translator as wWordWrapTranslator } from '../wordWrap';
import { translator as wRPrTranslator } from '../rpr';

// Property translators for w:pPr child elements
// Each translator handles a specific property of the paragraph properties
/** @type {import('@translator').NodeTranslator[]} */
const propertyTranslators = [
  mcAlternateContentTranslator,
  wAdjustRightIndTranslator,
  wAutoSpaceDETranslator,
  wAutoSpaceDNTranslator,
  wBidiTranslator,
  wCnfStyleTranslator,
  wContextualSpacingTranslator,
  wDivIdTranslator,
  wFramePrTranslator,
  wIndTranslator,
  wJcTranslatorTranslator,
  wKeepLinesTranslator,
  wKeepNextTranslator,
  wKinsokuTranslator,
  wMirrorIndentsTranslator,
  wNumPrTranslator,
  wOutlineLvlTranslator,
  wOverflowPunctTranslator,
  wPBdrTranslator,
  wPStyleTranslator,
  wPageBreakBeforeTranslator,
  wShdTranslator,
  wSnapToGridTranslator,
  wSpacingTranslator,
  wSuppressAutoHyphensTranslator,
  wSuppressLineNumbersTranslator,
  wSuppressOverlapTranslator,
  wTabsTranslator,
  wTextAlignmentTranslator,
  wTextDirectionTranslator,
  wTextboxTightWrapTranslator,
  wTopLinePunctTranslator,
  wWidowControlTranslator,
  wWordWrapTranslator,
  wRPrTranslator,
];

/**
 * The NodeTranslator instance for the w:pPr element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(
  createNestedPropertiesTranslator('w:pPr', 'paragraphProperties', propertyTranslators),
);
