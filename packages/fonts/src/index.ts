/**
 * `@superdoc-dev/fonts` - the reviewed metric-compatible font substitutes SuperDoc renders for
 * proprietary Word fonts (Carlito for Calibri, Liberation Serif for Times New Roman, etc.).
 *
 * Optional: install it to make the bundled fallbacks load automatically in any bundler app, with
 * no copy step and no `assetBaseUrl`. The asset URLs are written as
 * `new URL('../assets/<file>', import.meta.url)`, which Vite, Webpack 5, Next, Nuxt, esbuild, and
 * Parcel detect, emit, and rewrite to the final hashed path.
 *
 * @beta This package is in preview; its surface may change before 1.0.
 */
import { BUNDLED_FONT_ASSET_URLS } from './asset-urls';
import { BUNDLED_FAMILY_NAMES } from './bundled-families';

/**
 * The full filename -> bundler-emitted URL map for every bundled face. Most consumers use
 * {@link superdocFonts} or {@link resolveBundledFontAssetUrl} instead of reading this directly.
 *
 * @beta
 */
export { BUNDLED_FONT_ASSET_URLS };

/**
 * Minimal structural shape of SuperDoc's bundled-font asset context. Kept LOCAL so this
 * package has no dependency on `@superdoc/font-system`; only `file` is read. Assignable to
 * SuperDoc's `FontAssetUrlResolver` by structural typing.
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

/**
 * Resolve a bundled substitute face filename to a bundler-emitted URL.
 *
 * Pass as SuperDoc's `fonts.resolveAssetUrl` so the reviewed fallback pack loads from THIS
 * package's emitted assets, with no manual copy step and no `assetBaseUrl`:
 *
 *     import { resolveBundledFontAssetUrl } from '@superdoc-dev/fonts';
 *     new SuperDoc({ selector: '#editor', document, fonts: { resolveAssetUrl: resolveBundledFontAssetUrl } });
 *
 * Throws on an unknown file, which signals a version mismatch between `@superdoc-dev/fonts` and
 * the `superdoc` core manifest rather than silently degrading to the logical font name.
 *
 * @beta
 */
export function resolveBundledFontAssetUrl(context: BundledFontAssetContext): string {
  const url = BUNDLED_FONT_ASSET_URLS[context.file];
  if (!url) {
    throw new Error(
      `[@superdoc-dev/fonts] no bundled asset for "${context.file}". This pack ships ` +
        `${Object.keys(BUNDLED_FONT_ASSET_URLS).length} faces; the file is unknown, so ` +
        `@superdoc-dev/fonts and superdoc are likely version-mismatched. Align their versions.`,
    );
  }
  return url;
}

/**
 * Drop-in value for SuperDoc's `fonts` config: `new SuperDoc({ fonts: superdocFonts })`.
 * Equivalent to `{ resolveAssetUrl: resolveBundledFontAssetUrl }`.
 *
 * @beta
 */
export const superdocFonts: { resolveAssetUrl: (context: BundledFontAssetContext) => string } = {
  resolveAssetUrl: resolveBundledFontAssetUrl,
};

/**
 * Choose which bundled families SuperDoc advertises and renders, by LOGICAL Word family name
 * (`"Calibri"`, never the physical `"Carlito"`).
 *
 * @beta
 */
export interface SuperDocFontsOptions {
  /** Allow-list: ONLY these logical families are active, e.g. `['Calibri', 'Cambria']`. */
  include?: string[];
  /** Block-list: every bundled family EXCEPT these, e.g. `['Cooper Black', 'Brush Script MT']`. */
  exclude?: string[];
}

/**
 * The `fonts` config {@link createSuperDocFonts} returns: the bundled-asset resolver plus the
 * curation. Structurally assignable to SuperDoc's `fonts` option.
 *
 * @beta
 */
export interface SuperDocFontsConfig {
  resolveAssetUrl: (context: BundledFontAssetContext) => string;
  bundled?: { include?: string[]; exclude?: string[] };
}

/**
 * Build a curated `fonts` config: the bundled pack, narrowed to the families you choose.
 *
 *     import { createSuperDocFonts } from '@superdoc-dev/fonts';
 *     new SuperDoc({
 *       selector: '#editor',
 *       document,
 *       fonts: createSuperDocFonts({ exclude: ['Cooper Black', 'Brush Script MT'] }),
 *     });
 *
 * Names are Word logical families. Pass neither `include` nor `exclude` for the full pack - that is
 * exactly {@link superdocFonts}. Curation governs the BUNDLED pack only; your own licensed fonts stay
 * separate (`fonts.families` / `fonts.map`).
 *
 * @beta
 */
export function createSuperDocFonts(options: SuperDocFontsOptions = {}): SuperDocFontsConfig {
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
  const config: SuperDocFontsConfig = { resolveAssetUrl: resolveBundledFontAssetUrl };
  if (include) config.bundled = { include };
  else if (exclude) config.bundled = { exclude };
  return config;
}

/** Validate and clean a curation list: an array of non-empty strings, or omitted. Throws on misuse. */
function normalizeNameList(value: string[] | undefined, field: 'include' | 'exclude'): string[] | undefined {
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
