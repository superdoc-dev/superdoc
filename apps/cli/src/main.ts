#!/usr/bin/env node

import { parseGlobalArgs } from './lib/args';
import type { OutputMode } from './lib/types';

// AIDEV-NOTE: This is the CLI executable bootstrap, kept separate from the
// importable module in `./index`. `run()` / `invokeCommand()` promise no
// process-level I/O side effects, so the process console policy below MUST NOT
// move into them. The policy is installed here, before any dynamic import of
// `./index`, so transitive module-load logs (e.g. super-editor telemetry) are
// already guarded when they fire.

type ConsoleMethod = 'debug' | 'info' | 'log' | 'warn' | 'error';
const CONSOLE_METHODS: ConsoleMethod[] = ['debug', 'info', 'log', 'warn', 'error'];

function noop(): void {}

function writeToStderr(...args: unknown[]): void {
  // Reuse console's own formatting but force the stderr stream.
  console.error(...args);
}

/**
 * Installs the process-level console policy for one-shot and host runs.
 *
 * @param argv - Process arguments after the binary path (`process.argv.slice(2)`)
 */
function installConsolePolicy(argv: string[]): void {
  let output: OutputMode = 'json';
  let quiet = false;
  let isHost = false;

  try {
    const { globals, rest } = parseGlobalArgs(argv);
    output = globals.output;
    quiet = globals.quiet;
    isHost = rest[0] === 'host';
  } catch {
    // Argument parsing will fail again inside `run()`, which emits a structured
    // JSON failure on stderr (default output mode is json). Fall through to the
    // one-shot JSON policy so that failure stays the only protocol output.
  }

  if (quiet) {
    // Quiet mode promises a silent diagnostic surface across one-shot and host
    // execution, while envelopes/JSON-RPC frames still use direct stream I/O.
    for (const method of CONSOLE_METHODS) {
      console[method] = noop;
    }
    return;
  }

  if (isHost) {
    // AIDEV-NOTE: Host stdout is the JSON-RPC channel; stderr is diagnostic.
    // Redirect stdout-bound console methods to stderr so stray logs never
    // corrupt a JSON-RPC frame. warn/error already write to stderr.
    console.log = writeToStderr;
    console.info = writeToStderr;
    console.debug = writeToStderr;
    return;
  }

  if (output === 'json') {
    // One-shot JSON mode writes the success envelope to stdout and the failure
    // envelope to stderr (see writeSuccess/writeFailure in ./index), so BOTH
    // streams are structured protocol channels. Suppress all console output on
    // both streams. The envelope itself is written via io.stdout/io.stderr, not
    // console, so it is unaffected.
    for (const method of CONSOLE_METHODS) {
      console[method] = noop;
    }
    return;
  }

  // Pretty mode without --quiet: stdout is human-facing and diagnostics are
  // expected, so console is left untouched.
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  installConsolePolicy(argv);
  const { run } = await import('./index');
  const exitCode = await run(argv);
  process.exit(exitCode);
}

await main();
