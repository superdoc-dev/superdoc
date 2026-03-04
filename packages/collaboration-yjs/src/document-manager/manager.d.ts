import { SharedSuperDoc } from '../shared-doc/index.js';
import type { CollaborationParams, CollaborationWebSocket, ServiceConfig } from '../types/service-types.js';
/**
 * DocumentManager is responsible for managing Yjs documents.
 * It handles document retrieval and debouncing updates.
 */
export declare class DocumentManager {
  #private;
  debounceMs: number;
  constructor(config: ServiceConfig);
  get(documentId: string): SharedSuperDoc | null;
  getDocument(documentId: string, userParams: CollaborationParams): Promise<SharedSuperDoc>;
  releaseConnection(documentId: string, socket: CollaborationWebSocket): void;
  has(documentId: string): boolean;
}
//# sourceMappingURL=manager.d.ts.map
