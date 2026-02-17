/**
 * Engine-agnostic Document API surface.
 */

export * from './types/index.js';

import type { DocumentInfo, NodeAddress, NodeInfo, Query, QueryResult, Selector } from './types/index.js';
import { executeFind, type FindAdapter, type FindOptions } from './find/find.js';
import type { GetNodeAdapter, GetNodeByIdInput } from './get-node/get-node.js';
import { executeGetNode, executeGetNodeById } from './get-node/get-node.js';
import { executeGetText, type GetTextAdapter, type GetTextInput } from './get-text/get-text.js';
import { executeInfo, type InfoAdapter, type InfoInput } from './info/info.js';

export type { FindAdapter, FindOptions } from './find/find.js';
export type { GetNodeAdapter, GetNodeByIdInput } from './get-node/get-node.js';
export type { GetTextAdapter, GetTextInput } from './get-text/get-text.js';
export type { InfoAdapter, InfoInput } from './info/info.js';

/**
 * Read-focused Document API interface used by adapter-backed consumers.
 */
export interface DocumentApi {
  /**
   * Find nodes in the document matching a query.
   */
  find(query: Query): QueryResult;
  /**
   * Find nodes in the document matching a selector with optional options.
   */
  find(selector: Selector, options?: FindOptions): QueryResult;
  /**
   * Get detailed information about a specific node by its address.
   */
  getNode(address: NodeAddress): NodeInfo;
  /**
   * Get detailed information about a block node by its ID.
   */
  getNodeById(input: GetNodeByIdInput): NodeInfo;
  /**
   * Return the full document text content.
   */
  getText(input: GetTextInput): string;
  /**
   * Return document summary info used by `doc.info`.
   */
  info(input: InfoInput): DocumentInfo;
}

export interface DocumentApiAdapters {
  find: FindAdapter;
  getNode: GetNodeAdapter;
  getText: GetTextAdapter;
  info: InfoAdapter;
}

/**
 * Creates a read-focused Document API instance from the provided adapters.
 */
export function createDocumentApi(adapters: DocumentApiAdapters): DocumentApi {
  return {
    find(selectorOrQuery: Selector | Query, options?: FindOptions): QueryResult {
      return executeFind(adapters.find, selectorOrQuery, options);
    },
    getNode(address: NodeAddress): NodeInfo {
      return executeGetNode(adapters.getNode, address);
    },
    getNodeById(input: GetNodeByIdInput): NodeInfo {
      return executeGetNodeById(adapters.getNode, input);
    },
    getText(input: GetTextInput): string {
      return executeGetText(adapters.getText, input);
    },
    info(input: InfoInput): DocumentInfo {
      return executeInfo(adapters.info, input);
    },
  };
}
