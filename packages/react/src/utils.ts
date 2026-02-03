/**
 * Generate a unique ID for SuperDoc container elements.
 *
 * Uses a combination of timestamp and random string to ensure uniqueness
 * without relying on a global counter. This avoids SSR hydration mismatches
 * since the ID is only used for DOM element targeting after client-side
 * initialization (SuperDoc is dynamically imported and only runs on the client).
 *
 * @returns A unique identifier string
 */
export function generateId(): string {
  return `superdoc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
