/**
 * Parse a JSON string parameter from the LLM input.
 * Returns undefined if the param is not set.
 * Throws a clear error if the JSON is malformed.
 */
export function parseTarget(params: Record<string, unknown>, key = 'target'): unknown {
  const raw = params[key];
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw as string);
  } catch {
    throw new Error(`Invalid JSON in "${key}" parameter: ${raw}`);
  }
}

/** Returns tracked-change options when suggest mode is enabled. */
export function trackedOptions(params: Record<string, unknown>) {
  return params.suggest ? { changeMode: 'tracked' as const } : undefined;
}
