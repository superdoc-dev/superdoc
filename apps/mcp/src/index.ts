#!/usr/bin/env node
import { Console } from 'node:console';

// Redirect ALL console output to stderr BEFORE anything else runs.
// stdout is reserved exclusively for the MCP JSON-RPC protocol.
// Any stray output (e.g. "[super-editor] Telemetry: enabled" from
// console.debug in Editor.ts) will corrupt the transport and crash
// the MCP client (rmcp serde parse error at the non-JSON line).
globalThis.console = new Console(process.stderr) as unknown as typeof console;
const _error = console.error.bind(console);
console.log = (...args: unknown[]) => _error('[mcp:log]', ...args);
console.info = (...args: unknown[]) => _error('[mcp:info]', ...args);
console.debug = (...args: unknown[]) => _error('[mcp:debug]', ...args);
console.warn = (...args: unknown[]) => _error('[mcp:warn]', ...args);

await import('./server.js');
