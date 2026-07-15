const http = require('node:http');
const { WebSocketServer } = require('ws');
const { docs, setupWSConnection } = require('y-websocket/bin/utils');

const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end('okay');
});
const webSocketServer = new WebSocketServer({ noServer: true });

webSocketServer.on('connection', setupWSConnection);
server.on('upgrade', (request, socket, head) => {
  webSocketServer.handleUpgrade(request, socket, head, (connection) => {
    webSocketServer.emit('connection', connection, request);
  });
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Relay did not expose a TCP address.');
  process.stdout.write(`${JSON.stringify({ port: address.port })}\n`);
});

async function shutdown() {
  for (const connection of webSocketServer.clients) connection.terminate();
  await new Promise((resolve) => webSocketServer.close(resolve));
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  for (const document of docs.values()) {
    document.awareness.destroy();
    document.destroy();
  }
  docs.clear();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    shutdown().then(
      () => process.exit(0),
      (error) => {
        console.error(error);
        process.exit(1);
      },
    );
  });
}
