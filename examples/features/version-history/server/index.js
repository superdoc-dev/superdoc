import { Hocuspocus } from '@hocuspocus/server';

const port = process.env.PORT || 1234;

const server = new Hocuspocus({
  port,

  async onConnect({ documentName }) {
    console.log(`Connected: ${documentName}`);
  },

  async onDisconnect({ documentName }) {
    console.log(`Disconnected: ${documentName}`);
  },
});

server.listen();
console.log(`Hocuspocus server running on port ${port}`);
