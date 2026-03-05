import type { CollaborationParams, CollaborationWebSocket, Hooks, SocketRequest } from '../types/service-types.js';
import type { DocumentManager } from '../document-manager/manager.js';
interface ConnectionHandlerConfig {
  documentManager: DocumentManager;
  hooks?: Hooks;
}
/**
 * Handles WebSocket connections for collaborative document editing.
 * This class manages the connection lifecycle, including authentication,
 * setting up the document, and handling incoming messages.
 * It also provides methods to close the connection gracefully.
 */
export declare class ConnectionHandler {
  #private;
  documentManager: DocumentManager;
  constructor({ documentManager, hooks }: ConnectionHandlerConfig);
  handle(
    socket: CollaborationWebSocket,
    request: SocketRequest,
    params: CollaborationParams
  ): Promise<CollaborationParams>;
  hangUp(socket: CollaborationWebSocket, errorMessage: string, code?: number): void;
}
export {};
//# sourceMappingURL=handler.d.ts.map
