/**
 * Global font-configuration epoch.
 *
 * Increments whenever the available-font picture changes: a bundled/customer face
 * finishes loading, or a mapping is added/removed. Reuse signatures (measure and paint)
 * fold this value in so a font change busts stale reuse - a fragment measured or painted
 * before a font loaded carries the old epoch, so once the epoch bumps its signature no
 * longer matches and it is re-measured / repainted with the now-available font.
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
