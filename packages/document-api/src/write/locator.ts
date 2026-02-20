/**
 * Shared internal locator types for friendly target resolution.
 *
 * These types capture the `blockId + offset` pattern (and `pos` in PR B)
 * for use by write operations (insert, and later replace/delete).
 *
 * NOT exported from the package root — internal use only.
 */

/** Block-relative locator: a block ID with an optional character offset. */
export interface BlockRelativeLocator {
  blockId: string;
  offset?: number;
}
