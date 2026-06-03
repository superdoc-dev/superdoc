import 'dotenv/config';
import http from 'node:http';
import OpenAI from 'openai';

const PORT = Number(process.env.PORT || 8093);
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Tool schema the model is allowed to call. Mirror any change here in the
// browser's `handlers` map in src/App.tsx so the model's request can
// actually be executed.
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'addFootnoteCitation',
      description:
        'Insert a footnote at the current cursor position in the document. The footnote body is the provided source text. Word renders the superscript number.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          sourceText: {
            type: 'string',
            description: 'The full source citation text, e.g. "Doe, Cloud Reliability Patterns, 2024".',
          },
        },
        required: ['sourceText'],
        additionalProperties: false,
      },
    },
  },
];

// Lazy so the server can still boot and serve a friendly 500 from
// `handleTurn` when OPENAI_API_KEY is missing. Constructing at module
// scope would throw before the friendly path runs.
let _openai;
function getOpenAI() {
  return _openai ?? (_openai = new OpenAI());
}

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  if (req.method === 'GET' && url.pathname === '/api/health') return sendJson(res, 200, { ok: true, model: MODEL });
  if (req.method === 'POST' && url.pathname === '/api/turn') return handleTurn(req, res);
  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => console.log(`[api] footnote tool agent on http://localhost:${PORT}`));

async function handleTurn(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    return sendJson(res, 500, { error: 'OPENAI_API_KEY is not set. Copy .env.example to .env first.' });
  }

  let body;
  try { body = await readJson(req); }
  catch (err) { return sendJson(res, 400, { error: err.message }); }

  const messages = Array.isArray(body.messages) ? body.messages : null;
  const system = typeof body.system === 'string' ? body.system : '';
  if (!messages) return sendJson(res, 400, { error: 'messages array is required' });

  // Abort upstream if the client disconnects mid-call so we don't burn tokens.
  const upstream = new AbortController();
  res.on('close', () => upstream.abort());

  try {
    const completion = await getOpenAI().chat.completions.create(
      {
        model: MODEL,
        messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
        tools: TOOLS,
        tool_choice: 'auto',
        // One tool call per assistant turn keeps the demo lesson clean.
        parallel_tool_calls: false,
      },
      { signal: upstream.signal },
    );

    const choice = completion.choices[0];
    sendJson(res, 200, {
      type: 'message',
      message: {
        content: choice?.message?.content ?? null,
        tool_calls: choice?.message?.tool_calls,
      },
    });
  } catch (err) {
    if (upstream.signal.aborted) return;
    sendJson(res, 502, { error: err instanceof Error ? err.message : String(err) });
  }
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function readJson(req) {
  const MAX = 256 * 1024;
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
