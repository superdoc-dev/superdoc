function safeTraceCollector() {
  try {
    const collector = globalThis.__superdocInteractionTrace;
    return collector && typeof collector === 'object' ? collector : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} stage
 * @param {string} branch
 * @param {Record<string, unknown> | undefined} [meta]
 * @returns {{ traceId: string, spanId: string } | null}
 */
export function startInteractionSpan(stage, branch, meta = undefined) {
  try {
    const collector = safeTraceCollector();
    if (!collector || typeof collector.startSpan !== 'function') return null;
    return collector.startSpan(stage, branch, meta);
  } catch {
    return null;
  }
}

/**
 * @param {{ traceId: string, spanId: string } | null | undefined} span
 * @param {Record<string, unknown> | undefined} [meta]
 */
export function endInteractionSpan(span, meta = undefined) {
  if (!span) return;
  try {
    const collector = safeTraceCollector();
    if (!collector || typeof collector.endSpan !== 'function') return;
    collector.endSpan(span, meta);
  } catch {
    /* tracing must never affect product behavior */
  }
}

/**
 * @param {string} stage
 * @param {string} branch
 * @param {Record<string, unknown> | undefined} meta
 * @param {() => any} fn
 * @returns {any}
 */
export function withInteractionSpan(stage, branch, meta, fn) {
  const span = startInteractionSpan(stage, branch, meta);
  if (!span) {
    return fn();
  }
  try {
    const result = fn();
    const maybePromise = /** @type {{ then?: unknown }} */ (/** @type {unknown} */ (result));
    if (result && typeof maybePromise.then === 'function') {
      return /** @type {Promise<unknown>} */ (/** @type {unknown} */ (result))
        .then((value) => {
          endInteractionSpan(span);
          return value;
        })
        .catch((error) => {
          endInteractionSpan(span, { error: error instanceof Error ? error.message : String(error) });
          throw error;
        });
    }
    endInteractionSpan(span);
    return result;
  } catch (error) {
    endInteractionSpan(span, { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
