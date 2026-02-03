/**
 * Generate a unique ID for SuperDoc container elements.
 *
 * Uses a combination of timestamp and random string to ensure uniqueness
 * across multiple instances without relying on a global counter.
 *
 * Note: The component is client-only (returns null on server), so this
 * function only runs on the client after hydration.
 *
 * @returns A unique identifier string
 */
export function generateId(): string {
  return `superdoc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
