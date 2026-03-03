import { Awareness } from 'y-protocols/awareness';
import { Doc as YDoc } from 'yjs';
import type { CollaborationWebSocket } from '../types/service-types.js';
export declare class SharedSuperDoc extends YDoc {
  name: string;
  conns: Map<CollaborationWebSocket, Set<number>>;
  awareness: Awareness;
  whenInitialized: Promise<void>;
  constructor(name: string);
}
export declare const send: (doc: SharedSuperDoc, conn: CollaborationWebSocket, message: Uint8Array) => void;
export declare const setupConnection: (conn: CollaborationWebSocket, doc: SharedSuperDoc) => void;
//# sourceMappingURL=shared-doc.d.ts.map
