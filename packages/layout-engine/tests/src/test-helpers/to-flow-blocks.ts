import { toFlowBlocks as adapterToFlowBlocks } from '@core/layout-adapter';
import type { AdapterOptions, FlowBlocksResult, PMNode } from '@core/layout-adapter';

export function toFlowBlocks(input: PMNode | object, options?: AdapterOptions): FlowBlocksResult {
  return adapterToFlowBlocks(input, options);
}
