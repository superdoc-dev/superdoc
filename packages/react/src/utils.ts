/** @module utils */

/**
 * Generate a unique ID for SuperDoc container elements.
 *
 * Uses a combination of timestamp and random string to ensure uniqueness
 * across multiple instances without relying on a global counter.
 *
 * Note: This function only runs on the client after hydration since
 * IDs are generated in a ref initializer (not during SSR render).
 *
 * @returns A unique identifier string
 */
export function generateId(): string {
  return `superdoc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
