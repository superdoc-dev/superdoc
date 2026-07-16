/**
 * `executeCode` — runs model-authored JavaScript IN-HOST against the live,
 * SYNCHRONOUS SuperDoc Document API.
 *
 * Phase 1 of AGENT_TOOLSET_PLAN. Unlike the provider-side prototype (which ran
 * the model's code in the provider process against an async RPC `doc` proxy),
 * this version runs INSIDE the CLI host process against the session's real
 * `editor.doc` (a synchronous {@link DocumentApi}). Because the doc is in-host
 * and synchronous, the model's code calls `doc.*` WITHOUT `await` — every
 * Document API method returns its receipt synchronously.
 *
 * This module is a PURE FUNCTION over a `DocumentApi`, so it is dependency-free
 * and testable without a browser or a session. It NEVER throws to the caller:
 * syntax errors, thrown exceptions, and timeouts are all captured into a
 * structured `{ ok:false, error }` result.
 *
 * Trust boundary: code runs in-realm via `AsyncFunction` with a curated scope
 * (`doc`, `console`). This is NOT a security sandbox — the wrapper shares the
 * host realm. The threat model matches today's discrete CLI ops: first-party,
 * model-authored code that already calls `doc.*`. Hardening for untrusted code
 * (Worker / isolated-vm) is future work.
 *
 * EFFECTS MUST COMPLETE WITHIN THE SCRIPT. The wrapper is async so a stray
 * `await` is tolerated (await on a synchronous value just returns it), and after
 * the script resolves we flush one event-loop tick so fire-and-forget timer-0 /
 * unawaited-promise mutations land before the caller reads the revision. Work
 * deferred on a LONGER timer is unsupported — its mutation may not be persisted.
 *
 * MLV scope: no dry-run, no rollback, no diff. The script's mutations commit to
 * the live session doc; the calling op detects the revision change and layers on
 * the host's normal session persistence (mark-dirty + revision bump).
 */

import type { DocumentApi } from '@superdoc/document-api';

// ---------------------------------------------------------------------------
// Caps — keep the structured result small + serializable across JSON-RPC, and
// stop a runaway script from flooding the host with logs/giant return values.
// ---------------------------------------------------------------------------
const MAX_LOGS = 200;
const MAX_LOG_LEN = 2_000;
const MAX_RESULT_CHARS = 20_000;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Console output captured while the script ran. */
export interface CapturedLog {
  /** Console method the script called. */
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  /** Space-joined, stringified arguments (truncated to a max length). */
  message: string;
}

export interface ExecuteCodeOptions {
  /** Wall-clock budget for the script in ms. Defaults to 10_000. */
  timeoutMs?: number;
}

export type ExecuteCodeResult =
  | {
      ok: true;
      /** The script's `return` value, if it returned one. JSON-safe + bounded. */
      result: unknown;
      /** Captured console output, in order (capped). */
      logs: CapturedLog[];
    }
  | {
      ok: false;
      logs: CapturedLog[];
      error: { name: string; message: string; stack?: string };
    };

// ---------------------------------------------------------------------------
// Injected scope
// ---------------------------------------------------------------------------

/**
 * AsyncFunction constructor. The injected `doc` is synchronous, so `doc.*` calls
 * do NOT need `await` — but wrapping in an async function tolerates a stray
 * `await` (await on a synchronous value returns it) rather than throwing a
 * SyntaxError, which keeps the tool robust to a model that awaits out of habit.
 */
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...callArgs: unknown[]) => Promise<unknown>;

const CONSOLE_LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const;

function stringifyArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  try {
    return JSON.stringify(arg);
  } catch {
    try {
      return String(arg);
    } catch {
      return '[unstringifiable]';
    }
  }
}

/** Build a console shim that records into `logs` (capped) instead of the host console. */
function createCapturingConsole(logs: CapturedLog[]): Record<string, (...args: unknown[]) => void> {
  const shim: Record<string, (...args: unknown[]) => void> = {};
  for (const level of CONSOLE_LEVELS) {
    shim[level] = (...args: unknown[]) => {
      if (logs.length >= MAX_LOGS) return;
      let message = args.map(stringifyArg).join(' ');
      if (message.length > MAX_LOG_LEN) message = `${message.slice(0, MAX_LOG_LEN)}…[truncated]`;
      logs.push({ level, message });
    };
  }
  return shim;
}

/**
 * Make a value JSON-safe and bounded so the structured result stays small and
 * serializable across the JSON-RPC transport. Falls back to `String(value)`
 * when the value cannot be stringified (cycle, BigInt), then to a fixed
 * placeholder if even coercion throws; finally truncates to a max length.
 */
function toJsonSafe(value: unknown): unknown {
  if (value === undefined) return undefined;
  let out: unknown;
  try {
    out = JSON.parse(JSON.stringify(value));
  } catch {
    try {
      out = String(value);
    } catch {
      return '[unserializable]';
    }
  }
  // Bound the size regardless of shape.
  try {
    const serialized = typeof out === 'string' ? out : JSON.stringify(out);
    if (typeof serialized === 'string' && serialized.length > MAX_RESULT_CHARS) {
      return `${serialized.slice(0, MAX_RESULT_CHARS)}…[truncated ${serialized.length - MAX_RESULT_CHARS} chars]`;
    }
  } catch {
    return '[unserializable]';
  }
  return out;
}

// ---------------------------------------------------------------------------
// Flat-target ergonomics — mirror the CLI's input normalization in-host.
//
// The CLI layer upgrades legacy flat {blockId, start, end} inputs to canonical
// targets before invoking operations, so prompts and models learned that
// shape. Scripts run here call the document API DIRECTLY and used to get
// "Unknown field blockId" — a trap. Accept both shapes for the operations the
// CLI normalizes: format.* (SelectionTarget) and comments.create/patch
// (text-address target).
// ---------------------------------------------------------------------------

function flatToSelectionTarget(input: Record<string, unknown>): Record<string, unknown> | null {
  if (input.target !== undefined) return null;
  const blockId = input.blockId;
  if (typeof blockId !== 'string') return null;
  const hasOffset = typeof input.offset === 'number';
  const hasRange = typeof input.start === 'number' || typeof input.end === 'number' || hasOffset;
  if (!hasRange) return null;
  const start = typeof input.start === 'number' ? input.start : hasOffset ? (input.offset as number) : 0;
  const end = typeof input.end === 'number' ? input.end : hasOffset ? (input.offset as number) : start;
  const { blockId: _b, start: _s, end: _e, offset: _o, ...rest } = input;
  return {
    ...rest,
    target: {
      kind: 'selection',
      start: { kind: 'text', blockId, offset: start },
      end: { kind: 'text', blockId, offset: end },
    },
  };
}

function flatToTextAddressTarget(input: Record<string, unknown>): Record<string, unknown> | null {
  if (input.target !== undefined) return null;
  const blockId = input.blockId;
  if (typeof blockId !== 'string') return null;
  const start = typeof input.start === 'number' ? input.start : 0;
  const end = typeof input.end === 'number' ? input.end : start;
  const { blockId: _b, start: _s, end: _e, ...rest } = input;
  return { ...rest, target: { kind: 'text', blockId, range: { start, end } } };
}

type AnyFn = (...args: unknown[]) => unknown;
type ScriptDocGuard = { state: 'active' | 'timedOut' | 'closed' };

function inactiveDocCallResult(guard: ScriptDocGuard): Record<string, unknown> {
  const timedOut = guard.state === 'timedOut';
  return {
    ok: false,
    success: false,
    error: {
      code: timedOut ? 'EXECUTION_TIMED_OUT' : 'EXECUTION_CLOSED',
      message: timedOut
        ? 'execute_code timed out; delayed document calls were ignored.'
        : 'execute_code already returned; delayed document calls were ignored.',
    },
  };
}

/**
 * The raw document API takes changeMode/dryRun in the OPTIONS second arg and
 * rejects them as unknown input fields — but the CLI command layer (and every
 * prompt/model habit built on it) passes them inside the input. Scripts that
 * write `format.bold({ ..., changeMode: 'tracked' })` used to get
 * "Unknown field changeMode" and silently retried WITHOUT tracking. Split the
 * option keys out of the input and merge them into the options arg.
 */
function splitInvokeOptions(
  input: Record<string, unknown>,
  rest: unknown[],
): { input: Record<string, unknown>; rest: unknown[] } {
  if (input.changeMode === undefined && input.dryRun === undefined) return { input, rest };
  const { changeMode, dryRun, ...cleanInput } = input;
  const existing = rest[0] && typeof rest[0] === 'object' ? (rest[0] as Record<string, unknown>) : {};
  const options: Record<string, unknown> = { ...existing };
  if (changeMode !== undefined && options.changeMode === undefined) options.changeMode = changeMode;
  if (dryRun !== undefined && options.dryRun === undefined) options.dryRun = dryRun;
  return { input: cleanInput, rest: [options, ...rest.slice(1)] };
}

function wrapWithNormalizer(
  fn: AnyFn,
  ctx: unknown,
  options: {
    normalize?: (input: Record<string, unknown>) => Record<string, unknown> | null;
    splitOptions?: boolean;
    guard?: ScriptDocGuard;
  },
): AnyFn {
  return (...args: unknown[]) => {
    if (options.guard && options.guard.state !== 'active') {
      return inactiveDocCallResult(options.guard);
    }
    const [input, ...rest] = args;
    if (options.normalize && input && typeof input === 'object' && !Array.isArray(input)) {
      const normalized = options.normalize(input as Record<string, unknown>) ?? (input as Record<string, unknown>);
      if (options.splitOptions === true) {
        const split = splitInvokeOptions(normalized, rest);
        return fn.call(ctx, split.input, ...split.rest);
      }
      return fn.call(ctx, normalized, ...rest);
    }
    return fn.call(ctx, ...args);
  };
}

/** Wrap the live doc so scripts may use flat {blockId,start,end} targets. */
export function wrapDocForScript(doc: DocumentApi, guard?: ScriptDocGuard): DocumentApi {
  const wrapNamespace = (
    ns: object,
    options: {
      normalize?: (input: Record<string, unknown>) => Record<string, unknown> | null;
      splitOptions?: boolean;
    } = {},
  ) =>
    new Proxy(ns, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value === 'function') {
          return wrapWithNormalizer(value as AnyFn, target, { ...options, guard });
        }
        return value && typeof value === 'object' ? wrapNamespace(value as object) : value;
      },
    });

  return new Proxy(doc as object, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === 'format' && value && typeof value === 'object') {
        return wrapNamespace(value, { normalize: flatToSelectionTarget, splitOptions: true });
      }
      if (prop === 'comments' && value && typeof value === 'object') {
        return wrapNamespace(value, { normalize: flatToTextAddressTarget, splitOptions: true });
      }
      if ((prop === 'insert' || prop === 'replace' || prop === 'delete') && typeof value === 'function') {
        return wrapWithNormalizer(value as AnyFn, target, {
          normalize: flatToSelectionTarget,
          splitOptions: true,
          guard,
        });
      }
      if (typeof value === 'function') {
        return wrapWithNormalizer(value as AnyFn, target, { guard });
      }
      return value && typeof value === 'object' ? wrapNamespace(value as object) : value;
    },
  }) as DocumentApi;
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Run model-authored JS against a SYNCHRONOUS in-host {@link DocumentApi}.
 *
 * Never throws: all failures (syntax errors, thrown exceptions, timeouts) are
 * returned as a structured `{ ok:false, error }`.
 *
 * @param doc   The live, synchronous Document API for the open session.
 * @param code  The model's JavaScript body. Has access to `doc` and `console`.
 * @param options.timeoutMs  Wall-clock budget (default 10s). Bounds ASYNC waits
 *   only — a tight synchronous loop blocks the host event loop and cannot be
 *   preempted in-realm (true preemption needs Worker / isolated-vm).
 */
export async function executeCode(
  doc: DocumentApi,
  code: string,
  options: ExecuteCodeOptions = {},
): Promise<ExecuteCodeResult> {
  const { timeoutMs = 10_000 } = options;
  const logs: CapturedLog[] = [];

  if (typeof code !== 'string' || code.length === 0) {
    return {
      ok: false,
      logs,
      error: { name: 'EmptyCode', message: 'execute_code requires a non-empty `code` string.' },
    };
  }

  const capturingConsole = createCapturingConsole(logs);
  const docGuard: ScriptDocGuard = { state: 'active' };

  let runResult: unknown;
  let thrown: unknown = null;
  try {
    // Build the wrapper FIRST so a syntax error is captured as a structured
    // error (not thrown to the caller).
    const fn = new AsyncFunction('doc', 'console', code);
    runResult = await withTimeout(fn(wrapDocForScript(doc, docGuard), capturingConsole), timeoutMs, docGuard);
    // Flush one event-loop tick so any fire-and-forget timer-0 / unawaited
    // promise the script scheduled lands BEFORE the caller reads the revision.
    // (Longer-deferred work is unsupported — see the module header.)
    await new Promise((resolve) => setTimeout(resolve, 0));
  } catch (err) {
    thrown = err;
  } finally {
    if (docGuard.state === 'active') {
      docGuard.state = 'closed';
    }
  }

  if (thrown !== null) {
    const err = thrown instanceof Error ? thrown : new Error(String(thrown));
    return {
      ok: false,
      logs,
      error: { name: err.name, message: err.message, stack: err.stack },
    };
  }

  return { ok: true, result: toJsonSafe(runResult), logs };
}

/**
 * Reject a promise that outlives `ms`. Bounds ASYNC waits only — it does NOT
 * guard a tight SYNCHRONOUS loop: the script's synchronous prefix runs to its
 * first `await` (or to completion) before this ever sees the promise, so a
 * `while (true) {}` blocks the main thread and the timer never fires. True
 * preemption needs out-of-realm execution (Worker / isolated-vm).
 */
function withTimeout<T>(promise: Promise<T>, ms: number, guard: ScriptDocGuard): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      guard.state = 'timedOut';
      reject(new Error(`Script exceeded ${ms}ms time budget.`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
