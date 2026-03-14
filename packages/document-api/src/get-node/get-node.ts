import type { BlockNodeType, NodeAddress } from '../types/index.js';
import type { SDNodeResult } from '../types/sd-envelope.js';

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
   * Resolve a node address to an SDNodeResult.
   *
   * @param address - The node address to resolve.
   * @returns SDNodeResult with the projected node and its address.
   * @throws When the address cannot be resolved.
   */
  getNode(address: NodeAddress): SDNodeResult;
  /**
   * Resolve a block node by its ID.
   *
   * @param input - The node-id input payload.
   * @returns SDNodeResult with the projected node and its address.
   * @throws When the node ID cannot be found.
   */
  getNodeById(input: GetNodeByIdInput): SDNodeResult;
}

/**
 * Execute a getNode operation via the provided adapter.
 *
 * @param adapter - Engine-specific getNode adapter.
 * @param address - The node address to resolve.
 * @returns SDNodeResult with the projected node and its address.
 */
export function executeGetNode(adapter: GetNodeAdapter, address: NodeAddress): SDNodeResult {
  return adapter.getNode(address);
}

/**
 * Execute a getNodeById operation via the provided adapter.
 *
 * @param adapter - Engine-specific getNode adapter.
 * @param input - The node-id input payload.
 * @returns SDNodeResult with the projected node and its address.
 */
export function executeGetNodeById(adapter: GetNodeAdapter, input: GetNodeByIdInput): SDNodeResult {
  return adapter.getNodeById(input);
}
