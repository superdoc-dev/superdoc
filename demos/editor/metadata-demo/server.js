import { Server } from '@hocuspocus/server';

const PORT = Number(process.env.PORT || 1234);

const server = Server.configure({
  port: PORT,
  onConnect() {
    console.log('Client connected');
  },
  onDisconnect() {
    console.log('Client disconnected');
  },
});

server.listen();

console.log(`Hocuspocus server running on ws://localhost:${PORT}`);
