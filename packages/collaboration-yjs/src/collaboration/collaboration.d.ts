import { DocumentManager } from '../document-manager/manager.js';
import type { CollaborationWebSocket, ServiceConfig, SocketRequest } from '../types/service-types.js';
export declare class SuperDocCollaboration {
  #private;
  readonly config: ServiceConfig;
  readonly documentManager: DocumentManager;
  constructor(config: ServiceConfig);
  get name(): string;
  welcome(socket: CollaborationWebSocket, request: SocketRequest): Promise<void>;
  has(documentId: string): boolean;
}
//# sourceMappingURL=collaboration.d.ts.map
