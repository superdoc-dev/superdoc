/**
 * Shared internal locator types for friendly target resolution.
 *
 * Point locators are used by insert. Range locators are used by replace,
 * delete, format.*, comments.add, and comments.move. Block-ID shorthand
 * is used by create.* and lists.*.
 *
 * NOT exported from the package root — internal use only.
 */

/** Block-relative point locator: a block ID with an optional character offset. Used by insert. */
export interface BlockRelativeLocator {
  blockId: string;
  offset?: number;
}

/** Block-relative range locator: a block ID with start and end offsets. Used by replace, delete, format.*, comments.add/move. */
export interface BlockRelativeRange {
  blockId: string;
  start: number;
  end: number;
}

/** Block-ID shorthand: a bare node ID that the adapter resolves to a full address. Used by create.*, lists.*. */
export interface BlockIdShorthand {
  nodeId: string;
}
