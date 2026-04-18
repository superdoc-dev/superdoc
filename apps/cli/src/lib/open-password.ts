/**
 * Centralized password resolution for doc.open.
 *
 * Env-var fallback (`SUPERDOC_DOC_PASSWORD`) exists because passing secrets
 * via CLI argv is visible in process listings. The fallback is only enabled
 * for direct CLI invocations — SDK/host-mode calls must supply the password
 * explicitly so a server-side env var cannot silently override SDK callers.
 */
export function resolvePassword(explicit?: string, allowEnvFallback = true): string | undefined {
  if (explicit != null) return explicit;
  if (allowEnvFallback) return process.env.SUPERDOC_DOC_PASSWORD ?? undefined;
  return undefined;
}
