import {
  getLayoutDocumentAdapter,
  type DocumentAdapterConvertOptions,
  type FlowBlocksResult,
} from '@superdoc/layout-adapter';

export function toFlowBlocks(input: unknown, options?: DocumentAdapterConvertOptions): FlowBlocksResult {
  return getLayoutDocumentAdapter().toFlowBlocks(input, options);
}
