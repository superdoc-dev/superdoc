import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { WordExtraction } from './types.ts';
import { hashFile, readCache, sha256, writeCache } from './cache.ts';

const SCRIPT_PATH = fileURLToPath(new URL('./extract-layout.ps1', import.meta.url));

type McpResponse = {
  result?: { content?: Array<{ type: string; text?: string }> };
  error?: { message: string };
};

async function callWordMcp(command: string, timeoutSeconds = 240): Promise<string> {
  const url = process.env.WORD_MCP_URL;
  const token = process.env.WORD_MCP_TOKEN;
  if (!url) throw new Error('WORD_MCP_URL not set');
  if (!token) throw new Error('WORD_MCP_TOKEN not set');

  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'run_powershell',
      arguments: { command, timeout_seconds: timeoutSeconds },
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch((e) => `<body read failed: ${(e as Error).message}>`);
    throw new Error(`word-mcp HTTP ${res.status}: ${errText.slice(0, 5000)}`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  const parsed = contentType.startsWith('text/event-stream')
    ? parseSseResponse(await res.text())
    : ((await res.json()) as McpResponse);

  if (parsed.error) throw new Error(`word-mcp error: ${parsed.error.message}`);
  const content = parsed.result?.content ?? [];
  return content
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text!)
    .join('\n');
}

function parseSseResponse(stream: string): McpResponse {
  // SSE events are separated by blank lines; we want the last `data:` payload that parses as our JSON-RPC response.
  const events = stream.split(/\r?\n\r?\n/);
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const data = events[i]!.split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n');
    if (!data || data === '[DONE]') continue;
    try {
      return JSON.parse(data) as McpResponse;
    } catch {
      // try the previous event
    }
  }
  throw new Error(`word-mcp: no parseable SSE payload in:\n${stream.slice(0, 500)}`);
}

function parseExtractionOutput(output: string): WordExtraction {
  const begin = output.indexOf('JSON_BEGIN');
  const end = output.indexOf('JSON_END');
  if (begin === -1 || end === -1) {
    throw new Error(`extract-layout.ps1: missing JSON markers\n${output.slice(0, 800)}`);
  }
  const json = output.slice(begin + 'JSON_BEGIN'.length, end).trim();
  return JSON.parse(json) as WordExtraction;
}

export async function extractWord(
  docxPath: string,
  opts: { cache?: boolean } = {},
): Promise<{ extraction: WordExtraction; sha: string; cached: boolean }> {
  const [docxSha, psBody] = await Promise.all([hashFile(docxPath), readFile(SCRIPT_PATH, 'utf8')]);
  const psSha = sha256(psBody).slice(0, 12);
  const useCache = opts.cache !== false;

  if (useCache) {
    const hit = await readCache<WordExtraction>(docxSha, psSha);
    if (hit) return { extraction: hit, sha: docxSha, cached: true };
  }

  const docxBytes = await readFile(docxPath);
  const b64 = docxBytes.toString('base64');
  const command = `$b64 = '${b64}'\n${psBody}`;

  const output = await callWordMcp(command);
  const extraction = parseExtractionOutput(output);

  if (useCache) await writeCache(docxSha, psSha, extraction);
  return { extraction, sha: docxSha, cached: false };
}
