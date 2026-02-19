/**
 * Shared utility functions for provider implementations
 * @module providers/utils
 */

import type { FetchLike } from './types';

/**
 * Resolves the fetch implementation to use
 * Uses custom fetch if provided, otherwise falls back to global fetch
 *
 * @param customFetch - Optional custom fetch implementation
 * @returns Fetch implementation to use
 * @throws {Error} If no fetch is available
 */
export function resolveFetch(customFetch?: FetchLike): FetchLike {
  if (customFetch) return customFetch;
  if (!globalThis?.fetch) throw new Error('No fetch available. Provide fetch in provider config.');
  return globalThis.fetch.bind(globalThis);
}

/**
 * Ensures the `Content-Type` header is set to JSON when the caller did not
 * provide one explicitly.
 *
 * @param headers - Original headers object.
 * @returns Headers object guaranteed to include `Content-Type`.
 */
export function ensureContentType(headers: Record<string, string>): Record<string, string> {
  if (Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
    return headers;
  }
  return {
    ...headers,
    'Content-Type': 'application/json',
  };
}

/**
 * Removes properties with `undefined` values from an object to avoid sending
 * spurious keys to provider APIs.
 *
 * @param object - Source object to clean.
 * @returns New object without undefined values.
 */
export function cleanUndefined(object: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined));
}

/**
 * Joins a base URL and relative path without introducing duplicate slashes.
 *
 * @param base - Base URL (with or without trailing slash).
 * @param path - Path segment to append.
 * @returns Normalized URL string.
 */
export function joinUrl(base: string, path: string): string {
  let normalizedBase = base;
  while (normalizedBase.endsWith('/')) {
    normalizedBase = normalizedBase.slice(0, -1);
  }

  return `${normalizedBase}${path.startsWith('/') ? path : `/${path}`}`;
}
