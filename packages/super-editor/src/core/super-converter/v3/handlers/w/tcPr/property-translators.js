// @ts-check
import { translator as cnfStyleTranslator } from '@converter/v3/handlers/w/cnfStyle';
import { translator as shdTranslator } from '@converter/v3/handlers/w/shd';
import { translator as tcWTranslator } from '@converter/v3/handlers/w/tcW';
import { translator as gridSpanTranslator } from '@converter/v3/handlers/w/gridSpan';
import { translator as vMergeTranslator } from '@converter/v3/handlers/w/vMerge';
import { translator as tcBordersTranslator } from '@converter/v3/handlers/w/tcBorders';
import { translator as noWrapTranslator } from '@converter/v3/handlers/w/noWrap';
import { translator as tcMarTranslator } from '@converter/v3/handlers/w/tcMar';
import { translator as textDirectionTranslator } from '@converter/v3/handlers/w/textDirection';
import { translator as tcFitTextTranslator } from '@converter/v3/handlers/w/tcFitText';
import { translator as vAlignTranslator } from '@converter/v3/handlers/w/vAlign';
import { translator as hideMarkTranslator } from '@converter/v3/handlers/w/hideMark';
import { translator as headersTranslator } from '@converter/v3/handlers/w/headers';

/**
 * Base property translators for w:tcPr child elements (excluding w:tcPrChange, w:hMerge, w:cellIns, w:cellDel, w:cellMerge).
 * Shared between tcPr and tcPrChange to avoid circular dependencies.
 * @type {import('@translator').NodeTranslator[]}
 */
export const basePropertyTranslators = [
  cnfStyleTranslator,
  tcWTranslator,
  gridSpanTranslator,
  vMergeTranslator,
  tcBordersTranslator,
  shdTranslator,
  noWrapTranslator,
  tcMarTranslator,
  textDirectionTranslator,
  tcFitTextTranslator,
  vAlignTranslator,
  hideMarkTranslator,
  headersTranslator,
];
