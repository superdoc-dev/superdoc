/**
 * Milestone 2 proof: the clean process boundary works.
 *
 * Spawns the stdio JSON-RPC server as a child process and drives the full
 * open -> invoke -> export -> close cycle over the wire (no argv, no SDK, no
 * agent vocabulary). Also checks: structured errors (#3/#4), strict base64
 * (#2), stdout purity (non-JSON stdout fails the test), and clean shutdown on
 * stdin end (#6).
 */

import { test, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

const PKG_ROOT = join(import.meta.dir, '..', '..');
const STDIO = join(import.meta.dir, 'stdio.ts');
const FIXTURE = join(import.meta.dir, '../../../../evals/fixtures/docs/employment-offer.docx');
const MARKER = 'SUPERDOC_RPC_PROOF_MARKER_77';

interface RpcResponse {
  id: number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

class RpcClient {
  private child: ChildProcess;
  private buf = '';
  private nextId = 1;
  /** Complete stdout lines that were NOT valid JSON-RPC frames (contract violation). */
  readonly stdoutNoise: string[] = [];
  private pending = new Map<
    number,
    { resolve: (v: RpcResponse) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  constructor() {
    this.child = spawn('bun', [STDIO], { cwd: PKG_ROOT, stdio: ['pipe', 'pipe', 'inherit'] });
    this.child.stdout!.setEncoding('utf8');
    this.child.stdout!.on('data', (chunk: string) => this.onData(chunk));
    this.child.on('error', (err) => this.rejectAll(new Error(`child error: ${err.message}`)));
    this.child.on('exit', (code) => this.rejectAll(new Error(`child exited (code ${code})`)));
  }

  private onData(chunk: string): void {
    this.buf += chunk;
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line) continue;
      let msg: RpcResponse;
      try {
        msg = JSON.parse(line);
      } catch {
        this.stdoutNoise.push(line); // stdout purity is part of the transport contract
        continue;
      }
      const p = this.pending.get(msg.id);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        p.resolve(msg);
      }
    }
  }

  private rejectAll(err: Error): void {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(err);
    }
    this.pending.clear();
  }

  call(method: string, params: unknown): Promise<RpcResponse> {
    const id = this.nextId++;
    return new Promise<RpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }, 60000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  kill(): void {
    this.child.kill();
  }

  /** Close stdin and resolve with the child's exit code (proves stdin-end cleanup). */
  endAndWaitForExit(): Promise<number | null> {
    return new Promise((resolve) => {
      this.child.once('exit', (code) => resolve(code));
      this.child.stdin!.end();
    });
  }
}

test('clean process boundary: open -> invoke -> export -> close over stdio JSON-RPC', async () => {
  const source = new Uint8Array(await readFile(FIXTURE));
  const client = new RpcClient();
  try {
    const opened = await client.call('document.open', {
      source: { kind: 'docxBase64', data: Buffer.from(source).toString('base64') },
    });
    const sessionId = opened.result.sessionId as string;
    expect(typeof sessionId).toBe('string');

    // #4: unknown operation -> structured host error (not a thrown JS error)
    const badOp = await client.call('document.invoke', { sessionId, operationId: 'doc.__nope__', input: {} });
    expect(badOp.error?.code).toBe(-32010);
    expect(badOp.error?.data?.operationId).toBe('doc.__nope__');

    // unknown session -> structured error
    const badSession = await client.call('document.invoke', {
      sessionId: 'missing',
      operationId: 'getText',
      input: {},
    });
    expect(badSession.error?.code).toBe(-32000);

    // real mutation by operationId, then read it back over the wire
    const inserted = await client.call('document.invoke', {
      sessionId,
      operationId: 'insert',
      input: { value: MARKER, type: 'text' },
    });
    expect(inserted.result).toBeTruthy();
    const text = await client.call('document.invoke', { sessionId, operationId: 'getText', input: {} });
    expect(JSON.stringify(text.result)).toContain(MARKER);

    // export -> base64 + byteLength + sha256
    const exported = await client.call('document.export', { sessionId });
    expect(exported.result.byteLength).toBeGreaterThan(0);
    expect(exported.result.sha256).toMatch(/^[0-9a-f]{64}$/);

    // round-trip over the wire: re-open exported in a fresh session, marker persists
    const reopened = await client.call('document.open', {
      source: { kind: 'docxBase64', data: exported.result.docxBase64 },
    });
    const sessionId2 = reopened.result.sessionId as string;
    const text2 = await client.call('document.invoke', { sessionId: sessionId2, operationId: 'getText', input: {} });
    expect(JSON.stringify(text2.result)).toContain(MARKER);

    // stdout purity: no non-JSON lines arrived on the protocol channel
    expect(client.stdoutNoise).toEqual([]);

    // #6: close + idempotent close
    const closed = await client.call('document.close', { sessionId });
    expect(closed.result.ok).toBe(true);
    const closedAgain = await client.call('document.close', { sessionId });
    expect(closedAgain.result.alreadyClosed).toBe(true);
    await client.call('document.close', { sessionId: sessionId2 });
  } finally {
    client.kill();
  }
}, 120000);

test('rejects malformed base64 source with InvalidParams', async () => {
  const client = new RpcClient();
  try {
    const r = await client.call('document.open', {
      source: { kind: 'docxBase64', data: 'not valid base64 !!!' },
    });
    expect(r.error?.code).toBe(-32602);
    expect(client.stdoutNoise).toEqual([]);
  } finally {
    client.kill();
  }
}, 60000);

test('closes all sessions and exits cleanly on stdin end', async () => {
  const client = new RpcClient();
  const opened = await client.call('document.open', { source: { kind: 'blank' } });
  expect(typeof opened.result.sessionId).toBe('string');
  expect(client.stdoutNoise).toEqual([]);
  const code = await client.endAndWaitForExit();
  expect(code).toBe(0);
}, 60000);
