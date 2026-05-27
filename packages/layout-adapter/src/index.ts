export type {
  DocumentAdapterInput,
  DocumentAdapterConvertOptions,
  DocumentAdapter,
  FlowBlockCacheLike,
  FlowBlocksResult,
  LayoutDocumentAdapter,
  SectionAnalysisAdapter,
} from './document-adapter.js';

export {
  registerLayoutDocumentAdapter,
  getLayoutDocumentAdapter,
  resetLayoutDocumentAdapterForTests,
} from './registry.js';

export {
  SectionType,
  DEFAULT_PARAGRAPH_SECTION_TYPE,
  DEFAULT_BODY_SECTION_TYPE,
  type SectPrElement,
  type SectPrChildElement,
  type ParagraphProperties,
  type SectPrLikeObject,
  type SectionSignature,
  type SectionVerticalAlign,
  type SectionRange,
} from './sections.js';
