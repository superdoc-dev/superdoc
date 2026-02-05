/**
 * Shared utility functions for visual testing scripts.
 */

/**
 * Sleep for a given number of milliseconds.
 *
 * @param ms - Duration to sleep in milliseconds
 * @returns Promise that resolves after the specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalize a file path to use forward slashes and remove leading ./ or /.
 * This ensures consistent path handling across Windows and Unix systems.
 *
 * @param value - Path to normalize
 * @returns Normalized path string with forward slashes
 */
export function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
}

/**
 * Creates a ring buffer for log output that keeps only the most recent content.
 *
 * @param limit - Maximum number of characters to retain
 * @returns Object with append() to add content and dump() to retrieve buffered content
 */
export function createLogBuffer(limit: number): {
  append: (chunk: Buffer | string) => void;
  dump: () => string;
} {
  let buffer = '';
  return {
    append: (chunk: Buffer | string) => {
      buffer = `${buffer}${chunk.toString()}`.slice(-limit);
    },
    dump: () => buffer.trim(),
  };
}
