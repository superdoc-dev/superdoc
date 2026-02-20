import type { BlockNodeType, NodeAddress, NodeInfo } from '../types/index.js';

/**
 * Input for resolving a block node by its unique ID.
 */
export interface GetNodeByIdInput {
  nodeId: string;
  nodeType?: BlockNodeType;
}

/**
 * Engine-specific adapter that the getNode API delegates to.
 */
export interface GetNodeAdapter {
  /**
   * Resolve a node address to full node information.
   *
   * @param address - The node address to resolve.
   * @returns Full node information including typed properties.
   * @throws When the address cannot be resolved.
   */
  getNode(address: NodeAddress): NodeInfo;
  /**
   * Resolve a block node by its ID.
   *
   * @param input - The node-id input payload.
   * @returns Full node information including typed properties.
   * @throws When the node ID cannot be found.
   */
  getNodeById(input: GetNodeByIdInput): NodeInfo;
}

/**
 * Execute a getNode operation via the provided adapter.
 *
 * @param adapter - Engine-specific getNode adapter.
 * @param address - The node address to resolve.
 * @returns Full node information including typed properties.
 */
export function executeGetNode(adapter: GetNodeAdapter, address: NodeAddress): NodeInfo {
  return adapter.getNode(address);
}

/**
 * Execute a getNodeById operation via the provided adapter.
 *
 * @param adapter - Engine-specific getNode adapter.
 * @param input - The node-id input payload.
 * @returns Full node information including typed properties.
 */
export function executeGetNodeById(adapter: GetNodeAdapter, input: GetNodeByIdInput): NodeInfo {
  return adapter.getNodeById(input);
}
