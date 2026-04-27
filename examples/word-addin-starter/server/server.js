import { WebSocketServer } from 'ws';
import { createServer } from 'https';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// ============================================================
// CONFIGURATION
// ============================================================
const PORT = process.env.PORT || 8080;

// Use the same certs as office-addin-dev-certs
const certDir = join(homedir(), '.office-addin-dev-certs');
const httpsOptions = {
  key: readFileSync(join(certDir, 'localhost.key')),
  cert: readFileSync(join(certDir, 'localhost.crt')),
};

// ============================================================
// STATE
// ============================================================
let currentDocument = null; // Base64 encoded .docx

// ============================================================
// HTTPS SERVER (for health check + WSS)
// ============================================================
const httpsServer = createServer(httpsOptions, (req, res) => {
  // Allow CORS for health checks
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', clients: wss.clients.size }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// ============================================================
// WEBSOCKET SERVER (WSS)
// ============================================================
const wss = new WebSocketServer({ server: httpsServer });

wss.on('connection', (ws) => {
  console.log(`📡 Client connected (total: ${wss.clients.size})`);

  // Send current document to new client
  if (currentDocument) {
    ws.send(JSON.stringify({
      type: 'document_update',
      document: currentDocument,
      author: 'server'
    }));
    console.log('📄 Sent existing document to new client');
  }

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'document_update':
          if (message.document) {
            currentDocument = message.document;
            const sizeKB = Math.round(message.document.length / 1024);
            console.log(`📄 Document updated by ${message.author} (${sizeKB} KB)`);
          }

          // Broadcast to all OTHER clients
          broadcast(ws, {
            type: 'document_update',
            document: message.document,
            author: message.author
          });
          break;

        case 'client_ready':
          console.log('🌐 Client ready');
          // Send current document if available
          if (currentDocument) {
            ws.send(JSON.stringify({
              type: 'document_update',
              document: currentDocument,
              author: 'server'
            }));
          }
          break;

        default:
          console.log('❓ Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('❌ Error parsing message:', error.message);
    }
  });

  ws.on('close', () => {
    console.log(`📡 Client disconnected (total: ${wss.clients.size})`);
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
  });
});

function broadcast(sender, message) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client !== sender && client.readyState === 1) { // 1 = OPEN
      client.send(data);
    }
  });
}

// ============================================================
// START
// ============================================================
httpsServer.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║     SuperDoc Sync Server (HTTPS)           ║
╠════════════════════════════════════════════╣
║  WebSocket:  wss://localhost:${PORT}           ║
║  Health:     https://localhost:${PORT}/health  ║
╚════════════════════════════════════════════╝
  `);
});
