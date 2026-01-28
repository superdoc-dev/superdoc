import { Hocuspocus } from '@hocuspocus/server';

const PORT = 3050;

const server = new Hocuspocus({
  port: PORT,
  async onConnect({ documentName }) {
    console.log(`[collab] Connected: ${documentName}`);
  },
  async onDisconnect({ documentName }) {
    console.log(`[collab] Disconnected: ${documentName}`);
  },
});

server.listen();
console.log(`[collab] Hocuspocus server running on ws://localhost:${PORT}`);
