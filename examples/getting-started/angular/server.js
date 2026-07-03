import { Server } from '@hocuspocus/server';

const server = Server.configure({
  port: 1234,
  onConnect: () => {
    console.log('Client connected');
  },
  onDisconnect: () => {
    console.log('Client disconnected');
  },
});

server.listen();
console.log('Hocuspocus server running on ws://localhost:1234');
