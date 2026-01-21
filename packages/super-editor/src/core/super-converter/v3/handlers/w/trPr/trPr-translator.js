// @ts-check
import { NodeTranslator } from '@translator';
import { createNestedPropertiesTranslator } from '@converter/v3/handlers/utils.js';
import { translator as cantSplitTranslator } from '@converter/v3/handlers/w/cantSplit';
import { translator as cnfStyleTranslator } from '@converter/v3/handlers/w/cnfStyle';
import { translator as divIdTranslator } from '@converter/v3/handlers/w/divId';
import { translator as gridAfterTranslator } from '@converter/v3/handlers/w/gridAfter';
import { translator as gridBeforeTranslator } from '@converter/v3/handlers/w/gridBefore';
import { translator as hiddenTranslator } from '@converter/v3/handlers/w/hidden';
import { translator as jcTranslator } from '@converter/v3/handlers/w/jc';
import { translator as tblCellSpacingTranslator } from '@converter/v3/handlers/w/tblCellSpacing';
import { translator as tblHeaderTranslator } from '@converter/v3/handlers/w/tblHeader';
import { translator as trHeightTranslator } from '@converter/v3/handlers/w/trHeight';
import { translator as trWAfterTranslator } from '@converter/v3/handlers/w/wAfter';
import { translator as trWBeforeTranslator } from '@converter/v3/handlers/w/wBefore';

// Property translators for w:trPr child elements
// Each translator handles a specific property of the table row
/** @type {import('@translator').NodeTranslator[]} */
const propertyTranslators = [
  cantSplitTranslator,
  cnfStyleTranslator,
  divIdTranslator,
  gridAfterTranslator,
  gridBeforeTranslator,
  hiddenTranslator,
  jcTranslator,
  tblCellSpacingTranslator,
  tblHeaderTranslator,
  trHeightTranslator,
  trWAfterTranslator,
  trWBeforeTranslator,
];

/**
 * The NodeTranslator instance for the w:trPr element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(
  createNestedPropertiesTranslator('w:trPr', 'tableRowProperties', propertyTranslators, {
    cantSplit: false,
    hidden: false,
    repeatHeader: false,
  }),
);
