/**
 * Resolver-independent curation + validation shared by the two entries: the bundler entry
 * (`index.ts`, asset URLs via `import.meta.url`) and the browser/IIFE entry (`cdn-entry.ts`, URLs
 * relative to its own `<script>`). Each entry supplies only its own asset-URL resolver; the
 * `include` / `exclude` validation lives here once so the two entries can never drift.
 *
 * @beta
 */
import { BUNDLED_FAMILY_NAMES, type BundledFontFamilyName } from './bundled-families.js';

/**
 * Minimal structural shape of SuperDoc's bundled-font asset context. Kept LOCAL so this package
 * has no dependency on `@superdoc/font-system`; only `file` is read. Assignable to SuperDoc's
 * `FontAssetUrlResolver` by structural typing.
 *
 * @beta
 */
export interface BundledFontAssetContext {
  /** Asset filename, e.g. `Carlito-Regular.woff2`. */
  file: string;
  family?: string;
  weight?: string;
  style?: 'normal' | 'italic';
  source?: string;
}

/** Per-face asset-URL resolver: maps a bundled face filename to a URL the browser can fetch. */
export type BundledFontAssetResolver = (context: BundledFontAssetContext) => string;

/**
 * Choose which bundled families SuperDoc advertises and renders, by LOGICAL Word family name
 * (`"Calibri"`, never the physical `"Carlito"`).
 *
 * @beta
 */
export interface SuperDocFontsOptions {
  /**
   * Allow-list: ONLY these logical families are active, e.g. `['Calibri', 'Cambria']`. Autocompletes
   * the bundled names, but also accepts any string (case- and quote-insensitive, validated at
   * runtime), so a list built from dynamic config still type-checks.
   */
  include?: readonly (BundledFontFamilyName | (string & {}))[];
  /** Block-list: every bundled family EXCEPT these, e.g. `['Cooper Black', 'Brush Script MT']`. */
  exclude?: readonly (BundledFontFamilyName | (string & {}))[];
}

/**
 * The `fonts` config the entries return: the bundled-asset resolver plus the curation.
 * Structurally assignable to SuperDoc's `fonts` option.
 *
 * @beta
 */
export interface SuperDocFontsConfig {
  resolveAssetUrl: BundledFontAssetResolver;
  bundled?: { include?: string[]; exclude?: string[] };
}

/**
 * Validate the curation options and return the `{ bundled? }` slice (no resolver). Each entry
 * spreads this into its own `{ resolveAssetUrl, ...resolveCuration(options) }`.
 */
export function resolveCuration(options: SuperDocFontsOptions = {}): {
  bundled?: { include?: string[]; exclude?: string[] };
} {
  const include = normalizeNameList(options.include, 'include');
  const exclude = normalizeNameList(options.exclude, 'exclude');
  // include and exclude are mutually exclusive intents; accepting both silently would hide which one
  // wins. Reject at the API boundary (this runs in the consumer's setup code, so it fails fast and
  // clearly) rather than picking one arbitrarily.
  if (include && exclude) {
    throw new Error(
      '[@superdoc-dev/fonts] createSuperDocFonts: pass `include` OR `exclude`, not both. ' +
        '`include` is an allow-list (only those families resolve and appear in the toolbar); ' +
        '`exclude` keeps everything but the named families.',
    );
  }
  // Reject names SuperDoc does not bundle. This runs in the consumer's setup code, so it fails fast
  // and clearly - especially for `include`, where a typo would otherwise silently hide the fonts the
  // consumer meant to keep. (Raw `fonts.bundled` set directly stays lenient and only warns.)
  if (include) assertKnownFamilies(include, 'include');
  if (exclude) assertKnownFamilies(exclude, 'exclude');
  if (include) return { bundled: { include } };
  if (exclude) return { bundled: { exclude } };
  return {};
}

/** Validate and clean a curation list: an array of non-empty strings, or omitted. Throws on misuse. */
function normalizeNameList(value: readonly string[] | undefined, field: 'include' | 'exclude'): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`[@superdoc-dev/fonts] createSuperDocFonts: \`${field}\` must be an array of Word font names.`);
  }
  const names = value.map((name) => (typeof name === 'string' ? name.trim() : '')).filter(Boolean);
  if (names.length !== value.length) {
    throw new Error(
      `[@superdoc-dev/fonts] createSuperDocFonts: \`${field}\` must contain only non-empty font name strings ` +
        `(e.g. ["Calibri", "Cambria"]).`,
    );
  }
  return names.length ? names : undefined;
}

/** Normalize a family name for matching: trim, strip surrounding quotes, lowercase. */
function normalizeKey(name: string): string {
  return name
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();
}

const KNOWN_FAMILY_KEYS: ReadonlySet<string> = new Set(BUNDLED_FAMILY_NAMES.map(normalizeKey));

/** Bounded Levenshtein distance between two short strings, for a "did you mean" hint on a typo. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i += 1) {
    const curr = [i];
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[n];
}

/** The closest bundled family within edit distance 2, or null - so a typo gets a concrete suggestion. */
function closestKnownFamily(name: string): string | null {
  const key = normalizeKey(name);
  let best: string | null = null;
  let bestDist = 3;
  for (const family of BUNDLED_FAMILY_NAMES) {
    const dist = editDistance(key, normalizeKey(family));
    if (dist < bestDist) {
      bestDist = dist;
      best = family;
    }
  }
  return best;
}

/** Throw on any curation name SuperDoc does not bundle, with a suggestion and the full valid list. */
function assertKnownFamilies(names: readonly string[], field: 'include' | 'exclude'): void {
  const unknown = names.filter((name) => !KNOWN_FAMILY_KEYS.has(normalizeKey(name)));
  if (unknown.length === 0) return;
  const hints = unknown.map((name) => {
    const suggestion = closestKnownFamily(name);
    return suggestion ? `"${name}" (did you mean "${suggestion}"?)` : `"${name}"`;
  });
  throw new Error(
    `[@superdoc-dev/fonts] createSuperDocFonts: \`${field}\` names a font SuperDoc does not bundle: ${hints.join(', ')}. ` +
      `Curate by Word family name. Bundled families: ${BUNDLED_FAMILY_NAMES.join(', ')}.`,
  );
}
