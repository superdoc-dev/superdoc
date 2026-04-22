import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { WordExtraction } from './types.ts';
import { hashFile, readCache, sha256, writeCache } from './cache.ts';

const SCRIPT_PATH = fileURLToPath(new URL('./extract-layout.ps1', import.meta.url));

type JobEnvelope = {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  result?: { output?: string } | null;
  error?: { code: string; message: string } | null;
};

const POLL_INTERVAL_MS = 500;
const POLL_BUFFER_MS = 30_000;

async function runPowerShell(script: string, timeoutSeconds: number): Promise<string> {
  const base = process.env.WORD_API_URL;
  const token = process.env.WORD_API_TOKEN;
  if (!base) throw new Error('WORD_API_URL not set');
  if (!token) throw new Error('WORD_API_TOKEN not set');

  const root = base.replace(/\/$/, '');
  const authHeaders = { Authorization: `Bearer ${token}` } as const;

  const res = await fetch(`${root}/v1/executions`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ script, timeout_seconds: timeoutSeconds }),
  });

  if (!res.ok) {
    const body = await res.text().catch((e) => `<body read failed: ${(e as Error).message}>`);
    throw new Error(`word-api HTTP ${res.status}: ${body.slice(0, 5000)}`);
  }

  let job = (await res.json()) as JobEnvelope;
  const deadline = Date.now() + timeoutSeconds * 1000 + POLL_BUFFER_MS;

  while (job.status === 'queued' || job.status === 'running') {
    if (Date.now() > deadline) {
      throw new Error(`word-api job ${job.id} poll deadline exceeded (${job.status})`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const pollRes = await fetch(`${root}/v1/jobs/${job.id}`, { headers: authHeaders });
    if (!pollRes.ok) {
      const body = await pollRes.text().catch(() => '');
      throw new Error(`word-api poll HTTP ${pollRes.status}: ${body.slice(0, 500)}`);
    }
    job = (await pollRes.json()) as JobEnvelope;
  }

  if (job.status !== 'succeeded') {
    const code = job.error?.code ?? 'unknown';
    const message = job.error?.message ?? 'no error message';
    throw new Error(`word-api job ${job.id} ${job.status} (${code}): ${message}`);
  }
  return job.result?.output ?? '';
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

  const output = await runPowerShell(command, 600);
  const extraction = parseExtractionOutput(output);

  if (useCache) await writeCache(docxSha, psSha, extraction);
  return { extraction, sha: docxSha, cached: false };
}
