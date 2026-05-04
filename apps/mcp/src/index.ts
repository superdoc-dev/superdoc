#!/usr/bin/env node
import { Console } from 'node:console';

// AIDEV-NOTE: stdout is reserved exclusively for the MCP JSON-RPC
// protocol. Any stray write (e.g. "[super-editor] Telemetry: enabled"
// from console.debug in Editor.ts) corrupts the transport and crashes
// the MCP client (rmcp serde parse error at the non-JSON line). All
// console output is redirected to stderr before anything else runs;
// new code in this entry must not write to stdout outside the JSON-RPC
// path.
globalThis.console = new Console(process.stderr) as unknown as typeof console;
const _error = console.error.bind(console);
console.log = (...args: unknown[]) => _error('[mcp:log]', ...args);
console.info = (...args: unknown[]) => _error('[mcp:info]', ...args);
console.debug = (...args: unknown[]) => _error('[mcp:debug]', ...args);
console.warn = (...args: unknown[]) => _error('[mcp:warn]', ...args);

await import('./server.js');
