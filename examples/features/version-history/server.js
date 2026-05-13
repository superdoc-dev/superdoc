import { Hocuspocus } from '@hocuspocus/server';

const server = new Hocuspocus({
  port: 1234,

  async onConnect({ documentName }) {
    console.log(`Connected: ${documentName}`);
  },

  async onDisconnect({ documentName }) {
    console.log(`Disconnected: ${documentName}`);
  },
});

server.listen();
console.log('Hocuspocus server running on ws://localhost:1234');
