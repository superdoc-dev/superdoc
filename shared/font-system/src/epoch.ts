/**
 * Global font-configuration epoch.
 *
 * Increments whenever the available-font picture changes: a bundled/customer face
 * finishes loading, or a mapping is added/removed. PAINT reuse signatures fold this value
 * in (see versionSignature), so a fragment painted before a font loaded carries the old
 * epoch and repaints once it bumps. Measurement caches are NOT keyed by the epoch
 * (fontMetricsCache keys on `family|size|bold|italic`); the readiness gate instead clears
 * them explicitly when a font loads, so a stale measurement never survives a font change.
 *
 * It is deliberately a single global, not per-document: font changes are rare and a
 * cross-document repaint is cheap and never wrong. A per-document epoch is a future
 * refinement if multi-editor repaint cost ever matters.
 */
let fontConfigVersion = 0;

/** The current epoch. Reuse signatures include this so they bust on a font change. */
export function getFontConfigVersion(): number {
  return fontConfigVersion;
}

/** Advance the epoch (call after a font loads or the configuration changes). */
export function bumpFontConfigVersion(): number {
  return (fontConfigVersion += 1);
}

/** Reset the epoch. Test-only; not part of the public surface. */
export function __resetFontConfigVersion(): void {
  fontConfigVersion = 0;
}
