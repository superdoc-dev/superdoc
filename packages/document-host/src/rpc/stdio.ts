/**
 * Run the document host as a newline-delimited JSON-RPC 2.0 server over stdio.
 *
 * stdout carries ONLY protocol frames. Any stray logging from the engine is
 * redirected to stderr so it cannot corrupt the stream. On stdin end (parent
 * closes the pipe) every live session is closed.
 */

import { createInterface } from 'node:readline';
import { DocumentHostServer } from './server';
import { makeError, serializeFrame, RpcCode, type JsonRpcResponse } from './protocol';

/** Route console.* to stderr so stdout stays a clean protocol channel. */
function redirectConsoleToStderr(): void {
  const toStderr = (...args: unknown[]) => {
    const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    process.stderr.write(`${line}\n`);
  };
  console.log = toStderr as typeof console.log;
  console.info = toStderr as typeof console.info;
  console.warn = toStderr as typeof console.warn;
  console.debug = toStderr as typeof console.debug;
}

export async function runStdioServer(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  redirectConsoleToStderr();
  const server = new DocumentHostServer();
  const write = (frame: JsonRpcResponse) => output.write(serializeFrame(frame));
  const rl = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });

  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        write(makeError(null, RpcCode.ParseError, 'Parse error: invalid JSON.'));
        continue;
      }
      write(await server.handle(parsed));
    }
  } finally {
    server.closeAll();
  }
}

// Run when executed directly (e.g. `bun src/rpc/stdio.ts`).
if (import.meta.main) {
  runStdioServer()
    .then(() => process.exit(0))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    });
}
