/**
 * Logical -> physical font resolution.
 *
 * A document refers to a font by its *logical* family - the name Word wrote, e.g.
 * "Calibri". The browser may not have that font (it is proprietary), so SuperDoc
 * renders a metric-compatible *physical* substitute - e.g. Carlito, whose advance
 * widths match Calibri so line breaks land where Word puts them. The logical name
 * stays the source of truth (toolbar, export); only measurement and paint use the
 * physical family, and they MUST use the same one or text is measured in one font
 * and painted in another.
 *
 * The value reaching measure and paint is a CSS font-family *stack* the layout
 * builds via `toCssFontFamily`, e.g. "Calibri, sans-serif" - so resolution applies
 * to the PRIMARY family and keeps the remaining fallbacks ("Carlito, sans-serif").
 *
 * Ships the five verified clean clones (Calibri->Carlito, Cambria->Caladea,
 * Arial->Liberation Sans, Times New Roman->Liberation Serif, Courier New->Liberation
 * Mono) - each proven to match Word's painted line breaks. Becomes customer-configurable
 * in T7; this module stays the single source of the map.
 */

export type FontResolutionReason =
  /** No substitute is known; the requested family is used as-is. */
  | 'as_requested'
  /** Replaced by a bundled metric-compatible clone. */
  | 'bundled_substitute';

export interface FontResolution {
  /** The family the document asked for (preserved for toolbar/export). */
  logicalFamily: string;
  /** The bare physical family that is actually loaded, measured, and painted. */
  physicalFamily: string;
  reason: FontResolutionReason;
}

/**
 * Logical (normalized) -> physical family. Lowercased, quote-stripped keys.
 *
 * Only metric-verified clean clones (advance widths + OS/2 line metrics match the Word
 * original) belong here. Each target MUST be a family the bundled pack supplies
 * (see `bundled.ts`). Aptos/Georgia are intentionally absent - no clean clone yet.
 */
const BUNDLED_SUBSTITUTES: Readonly<Record<string, string>> = Object.freeze({
  calibri: 'Carlito',
  cambria: 'Caladea',
  arial: 'Liberation Sans',
  'times new roman': 'Liberation Serif',
  'courier new': 'Liberation Mono',
});

/** Normalize a family name for lookup: trim, strip surrounding quotes, lowercase. */
function normalizeFamilyKey(family: string): string {
  return family
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();
}

/** Split a CSS font-family value into trimmed, non-empty families (primary first). */
function splitStack(cssFontFamily: string): string[] {
  return cssFontFamily
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The physical family for a bare logical name, or the name itself if unmapped. */
function physicalFor(bareFamily: string): { physical: string; mapped: boolean } {
  const physical = BUNDLED_SUBSTITUTES[normalizeFamilyKey(bareFamily)];
  return physical ? { physical, mapped: true } : { physical: bareFamily, mapped: false };
}

/**
 * Structured resolution of a logical family (or CSS stack) to its bare physical
 * render family. The primary (first) family drives the result; this is what the
 * load gate awaits and what diagnostics report.
 */
export function resolveFontFamily(logicalFamily: string): FontResolution {
  const parts = splitStack(logicalFamily);
  const primary = parts[0] ?? logicalFamily;
  const { physical, mapped } = physicalFor(primary);
  return {
    logicalFamily,
    physicalFamily: physical,
    reason: mapped ? 'bundled_substitute' : 'as_requested',
  };
}

/**
 * Resolve a CSS font-family value for MEASURE and PAINT: swap the primary family
 * to its physical substitute and keep the original fallbacks.
 * "Calibri, sans-serif" -> "Carlito, sans-serif"; "Calibri" -> "Carlito".
 * An unmapped value is returned unchanged.
 */
export function resolvePhysicalFamily(cssFontFamily: string): string {
  if (!cssFontFamily) return cssFontFamily;
  const parts = splitStack(cssFontFamily);
  if (parts.length === 0) return cssFontFamily;
  const { physical, mapped } = physicalFor(parts[0]);
  if (!mapped) return cssFontFamily;
  return [physical, ...parts.slice(1)].join(', ');
}

/**
 * The bare physical family the load gate must await - the primary family resolved
 * to its substitute. "Calibri, sans-serif" -> "Carlito"; "Calibri" -> "Carlito".
 */
export function resolvePrimaryPhysicalFamily(family: string): string {
  const parts = splitStack(family);
  const primary = parts[0] ?? family;
  return physicalFor(primary).physical;
}

/** The deduped set of physical face families a set of logical families needs loaded. */
export function resolvePhysicalFamilies(families: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const family of families) {
    if (family) out.add(resolvePrimaryPhysicalFamily(family));
  }
  return [...out];
}
