declare module 'ws' {
  import type { IncomingMessage } from 'node:http';
  import type { Duplex } from 'node:stream';

  export class WebSocketServer {
    constructor(options?: { noServer?: boolean });
    handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer, callback: (websocket: any) => void): void;
  }
}
