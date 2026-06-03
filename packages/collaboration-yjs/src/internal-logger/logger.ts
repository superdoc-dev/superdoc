import { createLogger as createBaseLogger } from '@superdoc/common/logger';

export type Logger = (...args: unknown[]) => void;

/**
 * Always-on, label-prefixed logger for the collaboration server.
 *
 * Thin adapter over the shared `@superdoc/common/logger`. The level is pinned
 * to `info` so server diagnostics stay visible regardless of the global level,
 * preserving the previous always-print behavior.
 */
export function createLogger(label: string): Logger {
  const base = createBaseLogger(label, { level: 'info' });
  return (...args: unknown[]) => base.info(...args);
}
