/**
 * Counter for generating unique IDs
 */
let idCounter = 0;

/**
 * Generate a unique ID.
 * Each call returns a new unique identifier.
 *
 * @returns A unique identifier string
 */
export function generateId(): string {
  return `superdoc-${++idCounter}`;
}
