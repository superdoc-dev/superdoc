import { createServer } from 'node:http';
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const SECRET_KEY = process.env.LIVEBLOCKS_SECRET_KEY;
const PORT = 3051;

if (!SECRET_KEY) {
  console.error('Missing LIVEBLOCKS_SECRET_KEY in .env');
  process.exit(1);
}

const server = createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Room-Id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'PUT' && req.url === '/api/init-ydoc') {
    const roomId = req.headers['x-room-id'];
    if (!roomId) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing X-Room-Id header');
      return;
    }

    // Read binary body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    console.log(`[liveblocks-proxy] Pushing ${(body.length / 1024).toFixed(1)} KB to room "${roomId}"`);

    try {
      const resp = await fetch(`https://api.liveblocks.io/v2/rooms/${roomId}/ydoc`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${SECRET_KEY}`,
          'Content-Type': 'application/octet-stream',
        },
        body,
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error(`[liveblocks-proxy] Liveblocks API error ${resp.status}:`, text);
        res.writeHead(resp.status, { 'Content-Type': 'text/plain' });
        res.end(text);
        return;
      }

      console.log(`[liveblocks-proxy] Success — pushed to Liveblocks`);
      res.writeHead(200);
      res.end('OK');
    } catch (err) {
      console.error('[liveblocks-proxy] Error:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(err.message);
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`[liveblocks-proxy] Listening on http://localhost:${PORT}`);
});
