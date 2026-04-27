import 'dotenv/config';
import http from 'node:http';
import OpenAI from 'openai';

const PORT = Number(process.env.PORT || 8092);
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const SYSTEM_PROMPT = `You are a helpful writing assistant. Produce clean, well-structured prose as plain text.
Do not use markdown formatting (no **, no #, no backticks).
Put each section heading on its own line. Put each list item on its own line.
Separate paragraphs with a newline.`;

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  if (req.method === 'GET' && url.pathname === '/api/health') return sendJson(res, 200, { ok: true, model: MODEL });
  if (req.method === 'POST' && url.pathname === '/api/generate') return handleGenerate(req, res);
  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => console.log(`[api] streaming server on http://localhost:${PORT}`));

async function handleGenerate(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    return sendJson(res, 500, { error: 'OPENAI_API_KEY is not set. Copy .env.example to .env first.' });
  }

  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return sendJson(res, 400, { error: 'prompt is required' });

  // Tie the upstream OpenAI request to the client connection: if the browser
  // disconnects (user clicked Stop, navigated away, unmounted), abort upstream
  // so we don't burn tokens streaming into the void.
  const upstream = new AbortController();
  let done = false;
  res.on('close', () => { if (!done) upstream.abort(); });

  const openai = new OpenAI();
  let stream;
  try {
    stream = await openai.chat.completions.create(
      {
        model: MODEL,
        stream: true,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      },
      { signal: upstream.signal },
    );
  } catch (err) {
    if (upstream.signal.aborted) return;
    return sendJson(res, 502, { error: err instanceof Error ? err.message : String(err) });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? '';
      if (text) writeEvent(res, { type: 'token', text });
    }
    writeEvent(res, { type: 'done' });
  } catch (err) {
    if (!upstream.signal.aborted) {
      writeEvent(res, { type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  } finally {
    done = true;
    res.end();
  }
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function readJson(req) {
  const MAX = 128 * 1024;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function writeEvent(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}
