// @ts-check

import type { translator as wAbstractNumTranslator } from '@converter/v3/handlers/w/abstractNum';
import type { translator as wNumTranslator } from '@converter/v3/handlers/w/num';

export type { Editor } from '../Editor';
export type { RelationshipType } from './docx-helpers/docx-constants';

export type XmlRelationshipElement = Record<string, any>;

export type Numbering = {
  abstracts?: Record<string, ReturnType<typeof wAbstractNumTranslator.encode>>;
  definitions?: Record<string, ReturnType<typeof wNumTranslator.encode>>;
};

export {};
