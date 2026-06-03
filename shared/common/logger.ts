/**
 * Canonical logger for SuperDoc packages.
 *
 * Goals:
 * - Single implementation that the per-package loggers (ai, collaboration-yjs,
 *   super-validator) can adapt onto, replacing the scattered raw `console.*`
 *   calls across the codebase.
 * - Level-gated and silenceable, so embedding SuperDoc does not spam the host
 *   console. The default level shows `warn`/`error` only; debug/info are opt-in.
 * - Configurable sink, so SDK consumers can redirect output (or drop it).
 * - Isomorphic: no Node-only or browser-only APIs in the hot path.
 *
 * Typical usage:
 *
 * ```ts
 * import { createLogger } from '@superdoc/common/logger';
 * const log = createLogger('super-converter');
 * log.warn('unrecognized element', tag);
 * log.debug('parsed node', node); // hidden unless level >= debug
 * ```
 */

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

/** Numeric ordering so `weight[a] >= weight[b]` answers "is a at least as verbose as b". */
const LEVEL_WEIGHT: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

/** A single log record handed to a {@link LogSink}. */
export interface LogEntry {
  readonly level: Exclude<LogLevel, 'silent'>;
  /** Dotted namespace, e.g. `super-converter` or `super-converter:lists`. */
  readonly namespace: string;
  /** Display prefix the default sink prepends (e.g. `[super-converter]`). */
  readonly prefix: string;
  /** The variadic arguments passed to the log method, unmodified. */
  readonly args: unknown[];
}

/** Receives every record that passes the level gate. */
export type LogSink = (entry: LogEntry) => void;

export interface Logger {
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  /** Create a sub-namespaced logger that inherits this logger's config. */
  child(namespace: string): Logger;
  /** Current effective threshold. */
  readonly level: LogLevel;
  /** Override the threshold for this logger instance. */
  setLevel(level: LogLevel): void;
}

export interface LoggerOptions {
  /** Namespace shown in the prefix and passed to the sink. */
  namespace?: string;
  /** Threshold for this logger; falls back to the global level when omitted. */
  level?: LogLevel;
  /** Output target; falls back to the global sink (console) when omitted. */
  sink?: LogSink;
}

// ---------------------------------------------------------------------------
// Default console sink
// ---------------------------------------------------------------------------

const CONSOLE_METHOD: Record<Exclude<LogLevel, 'silent'>, 'error' | 'warn' | 'info' | 'debug'> = {
  error: 'error',
  warn: 'warn',
  info: 'info',
  debug: 'debug',
};

/** Writes entries to the global `console`, prefixed with the namespace. */
export const consoleSink: LogSink = ({ level, prefix, args }) => {
  if (typeof console === 'undefined') return;
  const method = CONSOLE_METHOD[level];
  // `console.debug`/`console.info` are missing in some embedded runtimes.
  const fn = console[method] ?? console.log;
  if (prefix) {
    fn.call(console, prefix, ...args);
  } else {
    fn.call(console, ...args);
  }
};

// ---------------------------------------------------------------------------
// Global configuration
// ---------------------------------------------------------------------------

/**
 * Read an initial level from the environment so debugging needs no code change:
 * `SUPERDOC_LOG_LEVEL=debug` (Node) or `globalThis.SUPERDOC_LOG_LEVEL` (browser).
 */
function readEnvLevel(): LogLevel | undefined {
  const candidates: unknown[] = [];
  const g = globalThis as Record<string, unknown>;
  if (typeof g.SUPERDOC_LOG_LEVEL === 'string') candidates.push(g.SUPERDOC_LOG_LEVEL);
  const proc = g.process as { env?: Record<string, string | undefined> } | undefined;
  if (proc?.env?.SUPERDOC_LOG_LEVEL) candidates.push(proc.env.SUPERDOC_LOG_LEVEL);
  for (const value of candidates) {
    if (typeof value === 'string' && value in LEVEL_WEIGHT) return value as LogLevel;
  }
  return undefined;
}

const DEFAULT_LEVEL: LogLevel = 'warn';

const globalConfig: { level: LogLevel; sink: LogSink } = {
  level: readEnvLevel() ?? DEFAULT_LEVEL,
  sink: consoleSink,
};

/**
 * Set the process-wide logging defaults. Loggers that did not pin their own
 * `level`/`sink` follow these. Call once during app/SDK setup.
 */
export function configureLogging(options: { level?: LogLevel; sink?: LogSink }): void {
  if (options.level !== undefined) globalConfig.level = options.level;
  if (options.sink !== undefined) globalConfig.sink = options.sink;
}

/** Current global level (used as the fallback threshold). */
export function getGlobalLogLevel(): LogLevel {
  return globalConfig.level;
}

// ---------------------------------------------------------------------------
// Logger factory
// ---------------------------------------------------------------------------

function formatPrefix(namespace: string): string {
  return namespace ? `[${namespace}]` : '';
}

/**
 * Create a namespaced {@link Logger}.
 *
 * @param namespace - shown as `[namespace]` in the default sink; pass `''` for none.
 * @param options - per-logger overrides; omit to inherit global config.
 */
export function createLogger(namespace = '', options: LoggerOptions = {}): Logger {
  const ns = options.namespace ?? namespace;
  const prefix = formatPrefix(ns);
  let pinnedLevel: LogLevel | undefined = options.level;
  const sink = options.sink;

  const effectiveLevel = (): LogLevel => pinnedLevel ?? globalConfig.level;
  const enabled = (level: Exclude<LogLevel, 'silent'>): boolean =>
    LEVEL_WEIGHT[effectiveLevel()] >= LEVEL_WEIGHT[level];

  const emit = (level: Exclude<LogLevel, 'silent'>, args: unknown[]): void => {
    if (!enabled(level)) return;
    (sink ?? globalConfig.sink)({ level, namespace: ns, prefix, args });
  };

  const logger: Logger = {
    error: (...args) => emit('error', args),
    warn: (...args) => emit('warn', args),
    info: (...args) => emit('info', args),
    debug: (...args) => emit('debug', args),
    child: (childNs: string) => {
      // Build options without explicit `undefined` keys (exactOptionalPropertyTypes).
      const childOptions: LoggerOptions = {};
      if (pinnedLevel !== undefined) childOptions.level = pinnedLevel;
      if (sink !== undefined) childOptions.sink = sink;
      return createLogger(ns ? `${ns}:${childNs}` : childNs, childOptions);
    },
    get level() {
      return effectiveLevel();
    },
    setLevel: (level: LogLevel) => {
      pinnedLevel = level;
    },
  };

  return logger;
}

/** Shared root logger for one-off call sites that do not need a namespace. */
export const logger: Logger = createLogger('superdoc');
