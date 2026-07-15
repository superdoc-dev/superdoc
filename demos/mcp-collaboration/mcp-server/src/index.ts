import { startMcpHttpServer } from './http-server.js';

const server = await startMcpHttpServer({
  port: process.env.MCP_HTTP_PORT ? Number(process.env.MCP_HTTP_PORT) : undefined,
});

console.log(`SuperDoc MCP demo server listening at ${server.url}`);

async function shutdown(): Promise<void> {
  await server.close();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
