/**
 * Segment Hash
 *
 * Simple hash for segment text content. Used to detect whether a segment
 * has changed since its last check, allowing unchanged segments to reuse
 * prior results without a provider call.
 *
 * This is a fast, non-cryptographic hash — it only needs to detect changes,
 * not resist collision attacks.
 */

/**
 * Compute a simple hash string for segment text.
 * Uses FNV-1a for speed and low collision rate on short strings.
 */
export function hashSegmentText(text: string): string {
  let hash = 0x811c9dc5; // FNV offset basis (32-bit)
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  // Convert to unsigned 32-bit hex string
  return (hash >>> 0).toString(16);
}
