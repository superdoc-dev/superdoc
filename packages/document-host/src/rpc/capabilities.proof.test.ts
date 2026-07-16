/**
 * Proofs for two hardening changes on the RPC boundary:
 *
 *  1. `document.capabilities` handshake: returns the protocol version, the five
 *     method names, and the docx size cap. Works in-process and over stdio, and
 *     is callable before any `document.open` (no session required).
 *  2. Per-session author identity over the wire: `document.open` accepts an
 *     optional `user`, validates its shape, and attributes tracked changes to it.
 */

import { test, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { DocumentHostServer } from './server';
import { PROTOCOL_VERSION, MAX_DOCX_BYTES, RpcCode } from './protocol';

const PKG_ROOT = join(import.meta.dir, '..', '..');
const STDIO = join(import.meta.dir, 'stdio.ts');
const FIXTURE = join(import.meta.dir, '../../../../evals/fixtures/docs/employment-offer.docx');

const EXPECTED_METHODS = [
  'document.open',
  'document.invoke',
  'document.export',
  'document.close',
  'document.capabilities',
];

interface RpcResponse {
  id: number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

class RpcClient {
  private child: ChildProcess;
  private buf = '';
  private nextId = 1;
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
        this.stdoutNoise.push(line);
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
}

test('document.capabilities (in-process) returns version, the five methods, and the size cap', async () => {
  const server = new DocumentHostServer();
  // No open first: capabilities must be callable on a fresh server with zero sessions.
  expect(server.sessionCount).toBe(0);
  const res = await server.handle({ jsonrpc: '2.0', id: 1, method: 'document.capabilities' });
  expect('result' in res).toBe(true);
  const result = (res as { result: any }).result;
  expect(result.protocolVersion).toBe(PROTOCOL_VERSION);
  expect(result.protocolVersion).toBe('1.0');
  expect(result.methods).toEqual(EXPECTED_METHODS);
  expect(result.maxDocxBytes).toBe(MAX_DOCX_BYTES);
  // Still no session created by the handshake.
  expect(server.sessionCount).toBe(0);
});

test('document.capabilities (in-process) ignores params', async () => {
  const server = new DocumentHostServer();
  const res = await server.handle({ jsonrpc: '2.0', id: 2, method: 'document.capabilities', params: { junk: true } });
  const result = (res as { result: any }).result;
  expect(result.protocolVersion).toBe('1.0');
  expect(result.methods).toEqual(EXPECTED_METHODS);
});

test('document.capabilities over stdio: callable before any open', async () => {
  const client = new RpcClient();
  try {
    const caps = await client.call('document.capabilities', {});
    expect(caps.result.protocolVersion).toBe('1.0');
    expect(caps.result.methods).toEqual(EXPECTED_METHODS);
    expect(caps.result.maxDocxBytes).toBe(MAX_DOCX_BYTES);
    expect(client.stdoutNoise).toEqual([]);

    // It works before any session was opened, and an open still works afterwards.
    const opened = await client.call('document.open', { source: { kind: 'blank' } });
    expect(typeof opened.result.sessionId).toBe('string');
    await client.call('document.close', { sessionId: opened.result.sessionId });
  } finally {
    client.kill();
  }
}, 60000);

test('per-session user identity over stdio attributes tracked changes to the provided author', async () => {
  const source = new Uint8Array(await readFile(FIXTURE));
  const client = new RpcClient();
  try {
    const opened = await client.call('document.open', {
      source: { kind: 'docxBase64', data: Buffer.from(source).toString('base64') },
      user: { id: 'agent-7', name: 'Agent Seven' },
    });
    const sessionId = opened.result.sessionId as string;
    expect(typeof sessionId).toBe('string');

    const inserted = await client.call('document.invoke', {
      sessionId,
      operationId: 'insert',
      input: { value: 'wire tracked marker', type: 'text' },
      options: { changeMode: 'tracked' },
    });
    expect(inserted.result).toBeTruthy();

    const listed = await client.call('document.invoke', {
      sessionId,
      operationId: 'trackChanges.list',
      input: {},
    });
    // invoke wraps the op output as { result: <opOutput> }, so the list is at result.result.items.
    const items = listed.result.result.items as Array<{ author?: string }>;
    const authors = items.map((i) => i.author ?? '');
    expect(authors).toContain('Agent Seven');
    expect(authors).not.toContain('Document Host');

    expect(client.stdoutNoise).toEqual([]);
    await client.call('document.close', { sessionId });
  } finally {
    client.kill();
  }
}, 120000);

test('open rejects a non-record user with InvalidParams (in-process)', async () => {
  const server = new DocumentHostServer();
  const res = await server.handle({
    jsonrpc: '2.0',
    id: 3,
    method: 'document.open',
    params: { source: { kind: 'blank' }, user: 'nope' },
  });
  expect('error' in res).toBe(true);
  expect((res as { error: { code: number } }).error.code).toBe(RpcCode.InvalidParams);
  expect(server.sessionCount).toBe(0);
});

test('open rejects a non-string user.id / user.name with InvalidParams (in-process)', async () => {
  const server = new DocumentHostServer();
  const badId = await server.handle({
    jsonrpc: '2.0',
    id: 4,
    method: 'document.open',
    params: { source: { kind: 'blank' }, user: { id: 7 } },
  });
  expect((badId as { error: { code: number } }).error.code).toBe(RpcCode.InvalidParams);

  const badName = await server.handle({
    jsonrpc: '2.0',
    id: 5,
    method: 'document.open',
    params: { source: { kind: 'blank' }, user: { name: false } },
  });
  expect((badName as { error: { code: number } }).error.code).toBe(RpcCode.InvalidParams);
  expect(server.sessionCount).toBe(0);
});

test('rejects a request whose id is a non-spec type as InvalidRequest, without running the method (in-process)', async () => {
  const server = new DocumentHostServer();
  // An object id is not a valid JSON-RPC id (string/number/null); the side-effecting method must not run.
  const res = await server.handle({
    jsonrpc: '2.0',
    id: { not: 'valid' },
    method: 'document.open',
    params: { source: { kind: 'blank' } },
  });
  expect('error' in res).toBe(true);
  expect((res as { error: { code: number } }).error.code).toBe(RpcCode.InvalidRequest);
  expect(server.sessionCount).toBe(0);
});

test('open accepts an absent user unchanged (in-process)', async () => {
  const server = new DocumentHostServer();
  const res = await server.handle({
    jsonrpc: '2.0',
    id: 6,
    method: 'document.open',
    params: { source: { kind: 'blank' } },
  });
  expect('result' in res).toBe(true);
  expect(typeof (res as { result: { sessionId: string } }).result.sessionId).toBe('string');
  server.closeAll();
});
