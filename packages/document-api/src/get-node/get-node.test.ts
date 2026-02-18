import type { NodeAddress, NodeInfo } from '../types/index.js';
import { executeGetNode, executeGetNodeById } from './get-node.js';
import type { GetNodeAdapter } from './get-node.js';

const PARAGRAPH_ADDRESS: NodeAddress = { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' };

const PARAGRAPH_INFO: NodeInfo = {
  nodeType: 'paragraph',
  kind: 'block',
  properties: {},
};

describe('executeGetNode', () => {
  it('delegates to adapter.getNode with the address', () => {
    const adapter: GetNodeAdapter = {
      getNode: vi.fn(() => PARAGRAPH_INFO),
      getNodeById: vi.fn(() => PARAGRAPH_INFO),
    };

    const result = executeGetNode(adapter, PARAGRAPH_ADDRESS);

    expect(result).toBe(PARAGRAPH_INFO);
    expect(adapter.getNode).toHaveBeenCalledWith(PARAGRAPH_ADDRESS);
  });
});

describe('executeGetNodeById', () => {
  it('delegates to adapter.getNodeById with the input', () => {
    const adapter: GetNodeAdapter = {
      getNode: vi.fn(() => PARAGRAPH_INFO),
      getNodeById: vi.fn(() => PARAGRAPH_INFO),
    };
    const input = { nodeId: 'p1', nodeType: 'paragraph' as const };

    const result = executeGetNodeById(adapter, input);

    expect(result).toBe(PARAGRAPH_INFO);
    expect(adapter.getNodeById).toHaveBeenCalledWith(input);
  });
});
