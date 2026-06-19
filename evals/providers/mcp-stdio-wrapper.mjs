#!/usr/bin/env node
/**
 * MCP stdio wrapper for debugging transport issues.
 *
 * Sits between the MCP client (Codex CLI) and the MCP server (SuperDoc).
 * Logs all raw stdin/stdout bytes to files in LOGDIR for post-mortem analysis,
 * then forwards them transparently.
 *
 * Usage:
 *   LOGDIR=/tmp/mcp-debug node mcp-stdio-wrapper.mjs <server-command> [args...]
 *
 * Files written:
 *   $LOGDIR/mcp-client-to-server.log  — raw bytes from client stdin → server stdin
 *   $LOGDIR/mcp-server-to-client.log  — raw bytes from server stdout → client stdout
 *   $LOGDIR/mcp-server-stderr.log     — server stderr output
 */

import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const logDir = process.env.LOGDIR || '/tmp/mcp-debug';
mkdirSync(logDir, { recursive: true });

const serverCmd = process.argv[2];
const serverArgs = process.argv.slice(3);

if (!serverCmd) {
  process.stderr.write('Usage: LOGDIR=/tmp/debug node mcp-stdio-wrapper.mjs <command> [args...]\n');
  process.exit(1);
}

const clientToServer = createWriteStream(resolve(logDir, 'mcp-client-to-server.log'));
const serverToClient = createWriteStream(resolve(logDir, 'mcp-server-to-client.log'));
const serverStderr = createWriteStream(resolve(logDir, 'mcp-server-stderr.log'));

// Spawn the real MCP server. shell: false is intentional — arguments are passed
// as an array and never interpreted by a shell, so there is no injection surface.
// The caller is trusted to supply a valid server command (dev/eval context only).
const child = spawn(serverCmd, serverArgs, {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    // Scrub noisy env vars that might cause stdout pollution
    DEBUG: undefined,
    NODE_OPTIONS: undefined,
    FORCE_COLOR: '0',
    NO_COLOR: '1',
  },
});

child.stdin.on('error', (err) => {
  serverStderr.write(`wrapper: child stdin error: ${err.message}\n`);
});
child.on('error', (err) => {
  serverStderr.write(`wrapper: child spawn error: ${err.message}\n`);
  process.exit(1);
});

// Client → Server: forward stdin to child, log it
process.stdin.on('data', (chunk) => {
  clientToServer.write(chunk);
  child.stdin.write(chunk);
});
process.stdin.on('end', () => {
  child.stdin.end();
});

// Server → Client: forward child stdout to our stdout, log it
child.stdout.on('data', (chunk) => {
  serverToClient.write(chunk);
  process.stdout.write(chunk);
});

// Server stderr → log file + our stderr
child.stderr.on('data', (chunk) => {
  serverStderr.write(chunk);
  process.stderr.write(chunk);
});

child.on('exit', (code) => {
  clientToServer.end();
  serverToClient.end();
  serverStderr.end();
  process.exit(code ?? 1);
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
