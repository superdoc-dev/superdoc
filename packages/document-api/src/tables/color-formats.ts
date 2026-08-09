/**
 * Single source of truth for the table-color regex used by both:
 *   - the schema-time validator (a string pattern in `contract/schemas.ts`)
 *   - the runtime executor validator (a compiled RegExp in `tables/tables.ts`)
 *
 * Accepts canonical `RRGGBB` and `auto`, plus loose forms `#RRGGBB`, `RGB`,
 * and `#RGB`. Adapters call `normalizeColorInput` to canonicalize before
 * storage, so any of these forms round-trips to uppercase `RRGGBB`.
 */
export const TABLE_COLOR_PATTERN_SOURCE = '^(#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})|auto)$';

/** Compiled once for runtime use. */
export const TABLE_COLOR_PATTERN = new RegExp(TABLE_COLOR_PATTERN_SOURCE, 'u');
