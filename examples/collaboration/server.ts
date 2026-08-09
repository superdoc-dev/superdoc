import { Server } from '@hocuspocus/server';

const server = Server.configure({ port: 1234 });
await server.listen();

const stop = async () => {
  await server.destroy();
  process.exit();
};

process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
