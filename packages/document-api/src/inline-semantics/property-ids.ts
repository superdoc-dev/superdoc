/**
 * Canonical inline property identifiers — single source of truth.
 *
 * All layers (contract, error schemas, SDK, CLI, registry, tests) must use
 * these constants. No synonyms (e.g., "strikethrough") in contract-facing surfaces.
 */

/**
 * All supported core inline property IDs.
 * Order: bold, italic, underline, strike (matches OOXML spec element ordering).
 */
export const CORE_PROPERTY_IDS = ['bold', 'italic', 'underline', 'strike'] as const;

/** A single core inline property ID. */
export type CorePropertyId = (typeof CORE_PROPERTY_IDS)[number];

/** Runtime set for O(1) property ID validation. */
export const CORE_PROPERTY_ID_SET: ReadonlySet<string> = new Set(CORE_PROPERTY_IDS);

/**
 * Pure-toggle property IDs (ON/OFF use identical attribute patterns).
 * Underline is excluded because it is a composite property (toggle + rich attrs).
 */
export const CORE_TOGGLE_PROPERTY_IDS = ['bold', 'italic', 'strike'] as const;

/** A single pure-toggle property ID. */
export type CoreTogglePropertyId = (typeof CORE_TOGGLE_PROPERTY_IDS)[number];

/** Runtime set for O(1) toggle property ID validation. */
export const CORE_TOGGLE_PROPERTY_ID_SET: ReadonlySet<string> = new Set(CORE_TOGGLE_PROPERTY_IDS);
