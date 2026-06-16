/**
 * Per-document "bundled font activation": which bundled substitute families a document may
 * ADVERTISE (toolbar) and RESOLVE to (substitute). The decision is config-driven, never a runtime
 * probe, and it is DOCUMENT-SCOPED - it lives in the resolver / offering / load / warning layers,
 * not in registration. The shared per-`FontFaceSet` registry still registers the full pack
 * (registration is lazy and global; filtering it would break two editors sharing one page), so a
 * document simply decides which of those faces it actually uses.
 *
 * Two states, driven by whether the consumer wired the pack:
 *  - `packConfigured: false` (no `@superdoc-dev/fonts`, no `fonts.assetBaseUrl` / `fonts.resolveAssetUrl`,
 *    no page-global pack): NO bundled family is active. The document advertises the conservative
 *    baseline and renders logical names with system fonts; nothing fetches a substitute `.woff2` that
 *    is not being served, so there is no stray 404 and no spurious warning.
 *  - `packConfigured: true`: every bundled family is active, minus `exclude` (or, with `include`,
 *    only the listed families).
 *
 * `include` / `exclude` are by LOGICAL Word family name (e.g. `"Calibri"`, never the physical
 * `"Carlito"`), matched case-insensitively after quote-stripping - the same normalization the
 * resolver and offerings use as keys. The documented way to set them is `createSuperDocFonts`.
 */
import { isBundledPackPresent } from './bundled';

/** Selection of which bundled families are active, by logical Word family name. */
export interface BundledFontSelection {
  /** Active families. When set (non-empty), ONLY these logical families resolve/advertise. */
  include?: readonly string[];
  /** Inactive families. When set, every bundled family EXCEPT these is active. */
  exclude?: readonly string[];
}

/** Inputs that decide bundled activation for a document. */
export interface BundledActivationInput extends BundledFontSelection {
  /** Whether the consumer wired the bundled pack (config presence or the CDN build). */
  packConfigured: boolean;
}

/** A resolved activation: the packConfigured flag, a per-logical-family predicate, and a signature. */
export interface BundledActivation {
  /** True when the bundled pack is wired for this document (config presence or the CDN build). */
  readonly packConfigured: boolean;
  /** Whether bundled substitution / advertising is active for this LOGICAL family (any case). */
  isActive(logicalFamily: string): boolean;
  /**
   * Deterministic identity of this activation. `''` when FULLY active (packConfigured with no
   * include/exclude) so default / full-pack documents keep sharing the measure cache and match the
   * global resolver; any narrower activation (no pack, or curated) gets a distinct, non-empty
   * signature the resolver folds into its own {@link FontResolver.signature} (the measure-cache key)
   * - so a no-pack or curated document never reuses a full-pack document's cached measures.
   */
  readonly signature: string;
}

/** Normalize a family name for keying: trim, strip surrounding quotes, lowercase. */
function normalizeKey(family: string): string {
  return family
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();
}

/** Normalized, de-duplicated, sorted list - or undefined when there is nothing usable. */
function normalizeList(families: readonly string[] | undefined): string[] | undefined {
  // Raw `fonts.bundled` is hand-written JS that may be malformed (a bare string, a number, a
  // non-array). Treat anything that is not an array of strings as "no curation" so a wrong shape
  // can never crash editor init; createSuperDocFonts is the strict path that rejects it instead.
  if (!Array.isArray(families)) return undefined;
  const out = [
    ...new Set(
      families
        .filter((f) => typeof f === 'string')
        .map(normalizeKey)
        .filter(Boolean),
    ),
  ].sort();
  return out.length > 0 ? out : undefined;
}

/**
 * Fully-active activation: every bundled family, signature `''`. The resolver's default, so the
 * module-level resolver and any `createFontResolver()` with no activation keep the prior global
 * substitution behavior (and share the measure cache).
 */
export const FULLY_ACTIVE_BUNDLED: BundledActivation = Object.freeze({
  packConfigured: true,
  isActive: () => true,
  signature: '',
});

/**
 * No-pack activation: no bundled family is active. The conservative baseline default for the STATIC
 * toolbar surfaces (the headless `DEFAULT_FONT_FAMILY_OPTIONS` / Vue `TOOLBAR_FONTS` consts, which
 * have no runtime config to read).
 */
export const BASELINE_BUNDLED: BundledActivation = Object.freeze({
  packConfigured: false,
  isActive: () => false,
  signature: JSON.stringify({ p: false }),
});

/**
 * Build a {@link BundledActivation} from config-presence plus optional include/exclude.
 *
 * `include` is the stronger intent and WINS if both are passed (they are not meant to be combined).
 * An include/exclude list with no usable entries is ignored rather than emptying the toolbar - "no
 * bundled fonts" is expressed by not configuring the pack, not by `include: []`.
 */
export function createBundledActivation(input: BundledActivationInput): BundledActivation {
  if (!input.packConfigured) return BASELINE_BUNDLED;
  // `include` is the stronger intent: when the consumer PROVIDED it at all - even malformed or empty
  // after normalize - `exclude` must not apply, or a typo'd / wrong-shaped include silently inverts
  // into an exclude. A provided-but-unusable include falls back to the full pack (ignored), per the
  // contract that "no bundled fonts" is expressed by not configuring the pack, not by `include: []`.
  const includeProvided = input.include != null;
  const include = normalizeList(input.include);
  const exclude = includeProvided ? undefined : normalizeList(input.exclude);
  if (!include && !exclude) return FULLY_ACTIVE_BUNDLED;
  if (include) {
    const set = new Set(include);
    return Object.freeze({
      packConfigured: true,
      isActive: (family: string) => set.has(normalizeKey(family)),
      signature: JSON.stringify({ p: true, i: include }),
    });
  }
  const set = new Set(exclude);
  return Object.freeze({
    packConfigured: true,
    isActive: (family: string) => !set.has(normalizeKey(family)),
    signature: JSON.stringify({ p: true, x: exclude }),
  });
}

/** Structural slice of a `fonts` config the activation needs - keeps this free of the editor type. */
export interface FontAssetConfigLike {
  resolveAssetUrl?: unknown;
  assetBaseUrl?: unknown;
  bundled?: BundledFontSelection;
}

/**
 * Derive a document's {@link BundledActivation} from its `fonts` config. The pack counts as
 * configured when the consumer set `resolveAssetUrl` (e.g. `superdocFonts`) or `assetBaseUrl`, or
 * when a host marked it present page-globally ({@link isBundledPackPresent}). Selection comes from
 * `fonts.bundled` (set via `createSuperDocFonts`).
 *
 * This is the lower-level primitive; runtime documents that may carry hand-written `fonts.bundled`
 * derive activation through `deriveBundledActivationForConfig` (in font-offerings), which sanitizes
 * unknown curation names against the known family set first.
 */
export function deriveBundledActivation(config: FontAssetConfigLike | null | undefined): BundledActivation {
  const packConfigured = !!(config?.resolveAssetUrl || config?.assetBaseUrl) || isBundledPackPresent();
  return createBundledActivation({
    packConfigured,
    include: config?.bundled?.include,
    exclude: config?.bundled?.exclude,
  });
}
