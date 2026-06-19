/**
 * Font OFFERINGS: the product layer between the substitution evidence and the UI. It answers a
 * different question than the resolver does. The resolver answers "given a logical font a document
 * already uses, what do we render?". An offering answers "should SuperDoc advertise this logical font
 * as a choice, and on which surface?".
 *
 * Three consumers are intended:
 *   1. CLEAN defaults - reliable, bundled, metric-safe fonts SuperDoc can render deterministically.
 *      Built from {@link getDefaultFontOfferings}.
 *   2. BUILT-IN toolbar options - bundled choices SuperDoc can render, plus qualified/category rows
 *      the product has explicitly chosen to advertise. Built from {@link getBuiltInToolbarFontOfferings}.
 *   3. DOCUMENT-specific options - whatever a given document actually uses. Those are
 *      document-scoped and runtime-aware; this static module only provides the default offerings.
 *
 * Derived from `SUBSTITUTION_EVIDENCE` x `BUNDLED_MANIFEST`. Adding/retiring a font is an evidence
 * edit, never a hand-maintained toolbar list.
 */
import {
  type BundledActivation,
  type BundledFontSelection,
  type FontAssetConfigLike,
  BASELINE_BUNDLED,
  deriveBundledActivation,
} from './activation';
import { BUNDLED_MANIFEST } from './bundled-manifest';
import { type CssGeneric, SUBSTITUTION_EVIDENCE, type SubstituteVerdict } from './substitution-evidence';

/** CSS generic family used to terminate an offering's fallback stack. */
export type FontGeneric = CssGeneric;

/** Which UI surface a logical font may appear on. A product decision, distinct from the verdict. */
export type OfferingClass =
  | 'default' // metric_safe + bundled: safe to advertise as a normal default toolbar option
  | 'qualified' // bundled and renderable, but with fidelity caveats (visual_only / near_metric), e.g. Georgia
  | 'category_fallback' // a usable family fallback, not a faithful clone, e.g. Calibri Light -> Carlito
  | 'supported_alias' // renderable duplicate name, but not a built-in picker choice, e.g. Arial MT -> Arial
  | 'requires_asset' // a candidate exists, but SuperDoc does not bundle its asset yet, e.g. Arial Rounded MT Bold
  | 'customer_supplied' // no open substitute; the real font must come from the customer, e.g. Aptos
  | 'preserve_only'; // keep the name, never a default option, e.g. Cambria Math

export interface FontOffering {
  /** Word-facing logical family: the toolbar label and the value stored/exported (e.g. "Calibri"). */
  logicalFamily: string;
  /** Physical render family (e.g. "Carlito"); null when nothing renders it (customer_supplied). */
  physicalFamily: string | null;
  generic: FontGeneric;
  /** Product classification: which UI surface this font may appear on (distinct from the verdict). */
  offering: OfferingClass;
  /**
   * Static fact: `physicalFamily` ships in the bundled pack. This is NOT runtime renderability - a
   * document's `fonts.add` faces or embedded fonts are unknown to this static module and belong to a
   * later document-scoped offering function.
   */
  bundled: boolean;
  /** docfonts fidelity verdict, used to separate clean defaults from qualified/category fallbacks. */
  verdict: SubstituteVerdict;
  /** Provenance back to the evidence row. */
  evidenceId: string;
}

const BUNDLED_FAMILIES: ReadonlySet<string> = new Set(BUNDLED_MANIFEST.map((f) => f.family));
const SUPPORTED_ALIAS_FAMILIES: ReadonlySet<string> = new Set(['Arial MT', 'Courier', 'Times']);

/**
 * The conservative toolbar baseline shown when the bundled pack is NOT configured: one common
 * Word-facing font per CSS generic - Arial (sans-serif), Times New Roman (serif), Courier New
 * (monospace). Each has a metric-safe bundled clone that activates only once the pack is configured;
 * the richer set (Georgia and the rest) is pack-enabled, see {@link ADVERTISED_BUILT_IN_TOOLBAR_FAMILIES}.
 */
const BUILT_IN_TOOLBAR_BASELINE_FAMILIES: ReadonlySet<string> = new Set(['Arial', 'Courier New', 'Times New Roman']);

/**
 * The richer set advertised ON TOP of the clean defaults when the bundled pack IS configured.
 * Bundled qualified / category-fallback families the product has chosen to surface. Inert without a
 * configured pack (they would not render), and individually removable via `createSuperDocFonts`
 * curation.
 */
const ADVERTISED_BUILT_IN_TOOLBAR_FAMILIES: ReadonlySet<string> = new Set([
  'Arial Black',
  'Arial Narrow',
  'Baskerville Old Face',
  'Bookman Old Style',
  'Brush Script MT',
  'Century',
  'Century Gothic',
  'Cooper Black',
  'Comic Sans MS',
  'Garamond',
  'Georgia',
  'Gill Sans MT Condensed',
  'Lucida Console',
  'Segoe UI',
  'Tahoma',
  'Trebuchet MS',
  'Verdana',
]);

/** Classify one evidence row by its policy action, verdict, and whether its target is bundled. */
function classifyOffering(
  logicalFamily: string,
  policyAction: (typeof SUBSTITUTION_EVIDENCE)[number]['policyAction'],
  verdict: SubstituteVerdict,
  physicalFamily: string | null,
  bundled: boolean,
): OfferingClass {
  if (policyAction === 'preserve_only') return 'preserve_only';
  if (policyAction === 'customer_supplied' || physicalFamily == null) return 'customer_supplied';
  if (bundled && SUPPORTED_ALIAS_FAMILIES.has(logicalFamily)) return 'supported_alias';
  if (policyAction === 'category_fallback') return 'category_fallback';
  // policyAction === 'substitute' from here.
  if (!bundled) return 'requires_asset'; // a clone exists but SuperDoc does not ship it yet
  return verdict === 'metric_safe' ? 'default' : 'qualified';
}

function deriveOfferings(): readonly FontOffering[] {
  const offerings = SUBSTITUTION_EVIDENCE.map((row): FontOffering => {
    const bundled = row.physicalFamily != null && BUNDLED_FAMILIES.has(row.physicalFamily);
    return {
      logicalFamily: row.logicalFamily,
      physicalFamily: row.physicalFamily,
      generic: row.generic,
      offering: classifyOffering(row.logicalFamily, row.policyAction, row.verdict, row.physicalFamily, bundled),
      bundled,
      verdict: row.verdict,
      evidenceId: row.evidenceId,
    };
  });
  return Object.freeze(offerings);
}

/** Every logical font SuperDoc has evidence for, classified by offering surface. */
export const FONT_OFFERINGS: readonly FontOffering[] = deriveOfferings();

function compareLogicalFamily(a: FontOffering, b: FontOffering): number {
  return a.logicalFamily.localeCompare(b.logicalFamily, 'en', { sensitivity: 'base' });
}

/**
 * The metric-safe, bundled-backed offerings safe to treat as clean defaults, sorted by logical
 * family. Excludes redundant aliases even when they are renderable; those still resolve for
 * documents through the resolver.
 * Excludes qualified rows (Arial Black, Arial Narrow, Cambria, Century, Century Gothic,
 * Century Schoolbook, Cooper Black, Georgia, Baskerville Old Face, Bookman Old Style, ITC Bookman),
 * category fallbacks (Calibri Light, Tahoma, Trebuchet MS, Garamond, Comic Sans MS, Brush Script MT,
 * Gill Sans MT Condensed, Lucida Console, Consolas, Verdana, Segoe UI), supported aliases
 * (Arial MT, Courier, Times), and not-yet-bundled candidates.
 */
export function getDefaultFontOfferings(): FontOffering[] {
  return FONT_OFFERINGS.filter((o) => o.offering === 'default').sort(compareLogicalFamily);
}

/**
 * Built-in font picker options for a document, gated on its bundled-font {@link BundledActivation}:
 *
 *  - pack NOT configured (the default): the conservative {@link BUILT_IN_TOOLBAR_BASELINE_FAMILIES}
 *    baseline - only fonts that render acceptably with no pack served. SuperDoc does not advertise
 *    bundled fonts it would have to fetch from an unconfigured location.
 *  - pack configured: the clean defaults plus the advertised qualified / category fallbacks, minus
 *    any the consumer curated out (`createSuperDocFonts({ include / exclude })`).
 *
 * Documents still RESOLVE the full reviewed substitute table through the resolver when their pack is
 * active; this governs only what the picker ADVERTISES. Consumers that need strict metric-safe
 * choices should use {@link getDefaultFontOfferings}.
 */
export function getBuiltInToolbarFontOfferings(activation: BundledActivation = BASELINE_BUNDLED): FontOffering[] {
  if (!activation.packConfigured) {
    return FONT_OFFERINGS.filter((o) => o.bundled && BUILT_IN_TOOLBAR_BASELINE_FAMILIES.has(o.logicalFamily)).sort(
      compareLogicalFamily,
    );
  }
  return FONT_OFFERINGS.filter(
    (o) =>
      (o.offering === 'default' ||
        (o.bundled &&
          ADVERTISED_BUILT_IN_TOOLBAR_FAMILIES.has(o.logicalFamily) &&
          (o.offering === 'qualified' || o.offering === 'category_fallback'))) &&
      activation.isActive(o.logicalFamily),
  ).sort(compareLogicalFamily);
}

/** The logical CSS stack stored/applied when an offering is chosen, e.g. "Calibri, sans-serif". */
export function fontOfferingStack(offering: FontOffering): string {
  return `${offering.logicalFamily}, ${offering.generic}`;
}

/**
 * The physical render CSS stack, for an accurate dropdown preview - the row renders in the bundled
 * clone that actually paints (e.g. "Carlito, sans-serif"), not the proprietary logical name the
 * browser lacks. Falls back to the logical stack when there is no physical family.
 */
export function fontOfferingRenderStack(offering: FontOffering): string {
  return offering.physicalFamily ? `${offering.physicalFamily}, ${offering.generic}` : fontOfferingStack(offering);
}

/**
 * Default toolbar font options in the generic `{ label, value }` shape: label is the Word-facing
 * logical name (stored/exported), value is the logical CSS stack applied to the selection. The
 * built-in (Vue) toolbar builds its own richer `FontConfig` from
 * {@link getBuiltInToolbarFontOfferings}.
 */
export function getDefaultFontFamilyOptions(
  activation: BundledActivation = BASELINE_BUNDLED,
): readonly { label: string; value: string }[] {
  return getBuiltInToolbarFontOfferings(activation).map((offering) => ({
    label: offering.logicalFamily,
    value: fontOfferingStack(offering),
  }));
}

/** Normalize a family name for keying: trim, strip surrounding quotes, lowercase. */
function normalizeFamilyKey(family: string): string {
  return family
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();
}

/** Every logical Word family SuperDoc ships a bundled substitute for - the set curation can target. */
const BUNDLED_LOGICAL_FAMILIES: readonly string[] = [
  ...new Set(FONT_OFFERINGS.filter((o) => o.bundled).map((o) => o.logicalFamily)),
].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
const BUNDLED_LOGICAL_KEYS: ReadonlySet<string> = new Set(BUNDLED_LOGICAL_FAMILIES.map(normalizeFamilyKey));

/**
 * The Word family names a document can curate (`include` / `exclude`): every logical family the
 * resolver substitutes to a bundled face, including category fallbacks like Verdana. The single
 * source of truth for the curation surface - {@link warnUnknownBundledSelection} validates against it
 * and `@superdoc-dev/fonts` generates its committed list from it. Distinct from the asset manifest's
 * `replaces`, which omits category fallbacks (the reason curation keys on offerings, not `replaces`).
 */
export function getBundledFamilyNames(): string[] {
  return [...BUNDLED_LOGICAL_FAMILIES];
}

/** Bounded Levenshtein distance between two short strings, for a "did you mean" curation hint. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 3; // cannot be within the suggestion threshold
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
function closestBundledFamily(name: string): string | null {
  const key = normalizeFamilyKey(name);
  let best: string | null = null;
  let bestDist = 3;
  for (const family of BUNDLED_LOGICAL_FAMILIES) {
    const dist = editDistance(key, normalizeFamilyKey(family));
    if (dist < bestDist) {
      bestDist = dist;
      best = family;
    }
  }
  return best;
}

/**
 * Coerce a raw `fonts.bundled.include`/`exclude` value to a string array. Raw config is hand-written
 * JS that may be malformed (a bare `include: 'Calibri'`, a number, ...); a non-array is reported once
 * and dropped, so it can neither crash init nor spread a string into per-character "unknown font"
 * warnings. createSuperDocFonts is the strict path that rejects malformed curation outright.
 */
function coerceCurationList(value: unknown, field: 'include' | 'exclude'): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    console.warn(
      `[superdoc] fonts.bundled.${field} must be an array of font names; ignoring it. ` +
        'Prefer createSuperDocFonts(), which rejects malformed curation.',
    );
    return [];
  }
  return value.filter((name): name is string => typeof name === 'string');
}

/**
 * Warn (once per name) at config time when a `fonts.bundled` curation entry is not a bundled family,
 * so curating it silently does nothing - and when both `include` and `exclude` are set. The safety
 * net for `fonts.bundled` set DIRECTLY: `createSuperDocFonts` already rejects unknown names and
 * structural errors in the consumer's setup code, but a hand-written `fonts.bundled` bypasses it. Warn
 * (not throw) here because this runs at editor init, where a font-name typo must not crash the editor.
 */
export function warnUnknownBundledSelection(selection: BundledFontSelection | undefined): void {
  if (!selection) return;
  // `include` WINS whenever it is provided - even empty or malformed - matching createBundledActivation,
  // so `exclude` is then discarded at runtime. Key the warning off the same "provided" test, not off a
  // non-empty include, so a discarded exclude's names are not flagged as typos for a list the editor ignores.
  const includeProvided = selection.include != null;
  const include = coerceCurationList(selection.include, 'include');
  const exclude = coerceCurationList(selection.exclude, 'exclude');
  if (includeProvided && exclude.length > 0) {
    console.warn(
      '[superdoc] fonts.bundled: set `include` OR `exclude`, not both. ' +
        'Using `include` (the allow-list) and ignoring `exclude`. Prefer createSuperDocFonts(), which rejects this.',
    );
  }
  // Only check names on the EFFECTIVE side; the discarded side's names are moot.
  const effective = includeProvided ? include : exclude;
  const seen = new Set<string>();
  for (const name of effective) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) continue;
    const key = normalizeFamilyKey(trimmed);
    if (BUNDLED_LOGICAL_KEYS.has(key) || seen.has(key)) continue;
    seen.add(key);
    const suggestion = closestBundledFamily(trimmed);
    console.warn(
      `[superdoc] fonts.bundled: "${trimmed}" is not a bundled font, so curating it has no effect` +
        `${suggestion ? ` (did you mean "${suggestion}"?)` : ''}. ` +
        'Curate by Word family name, e.g. Calibri, Cambria, Times New Roman. ' +
        'Docs: https://docs.superdoc.dev/getting-started/fonts',
    );
  }
}

/**
 * Drop curation names that are not bundled families (keyed against the same set
 * {@link warnUnknownBundledSelection} validates), preserving the `include` / `exclude` KEYS so the
 * "include wins" precedence survives. A raw `fonts.bundled.include` that is all typos thus sanitizes
 * to an empty-but-present include, which {@link createBundledActivation} ignores back to the full pack
 * rather than emptying the toolbar. Silent: warnings are emitted once by
 * {@link warnUnknownBundledSelection}; this only cleans.
 */
export function sanitizeBundledSelection(
  selection: BundledFontSelection | undefined,
): BundledFontSelection | undefined {
  if (!selection) return selection;
  const known = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value
      .filter((n): n is string => typeof n === 'string')
      .filter((n) => BUNDLED_LOGICAL_KEYS.has(normalizeFamilyKey(n)));
  };
  const result: BundledFontSelection = {};
  if (selection.include != null) result.include = known(selection.include);
  if (selection.exclude != null) result.exclude = known(selection.exclude);
  return result;
}

/**
 * Derive a document's {@link BundledActivation} from its `fonts` config, first sanitizing raw
 * `fonts.bundled` against the known family set ({@link sanitizeBundledSelection}). Runtime documents
 * that may carry hand-written `fonts.bundled` should use this instead of the lower-level
 * {@link deriveBundledActivation}: it guarantees an all-unknown `include` cannot empty the
 * toolbar/resolver. (createSuperDocFonts validates the same names in the consumer's setup code.)
 */
export function deriveBundledActivationForConfig(config: FontAssetConfigLike | null | undefined): BundledActivation {
  if (!config) return deriveBundledActivation(config);
  return deriveBundledActivation({ ...config, bundled: sanitizeBundledSelection(config.bundled) });
}
