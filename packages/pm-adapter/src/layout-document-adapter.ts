import type {
  DocumentAdapterConvertOptions,
  DocumentAdapterInput,
  FlowBlocksResult,
  LayoutDocumentAdapter,
} from '@superdoc/layout-adapter';

import { FlowBlockCache } from './cache.js';
import { toFlowBlocks } from './internal.js';
import { analyzeSectionRanges } from './sections/analysis.js';
import type { AdapterOptions, PMNode } from './types.js';

export const pmLayoutDocumentAdapter: LayoutDocumentAdapter = {
  id: 'prosemirror',

  toFlowBlocks(input: DocumentAdapterInput, options?: DocumentAdapterConvertOptions): FlowBlocksResult {
    return toFlowBlocks(input as PMNode, options as AdapterOptions);
  },

  createFlowBlockCache() {
    return new FlowBlockCache();
  },

  analyzeSectionRanges(doc: DocumentAdapterInput, bodySectPr?: unknown) {
    return analyzeSectionRanges(doc as PMNode, bodySectPr);
  },
};
