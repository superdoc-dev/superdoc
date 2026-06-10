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
import { BUNDLED_MANIFEST } from './bundled-manifest';
import { type CssGeneric, SUBSTITUTION_EVIDENCE, type SubstituteVerdict } from './substitution-evidence';

/** CSS generic family used to terminate an offering's fallback stack. */
export type FontGeneric = CssGeneric;

/** Which UI surface a logical font may appear on. A product decision, distinct from the verdict. */
export type OfferingClass =
  | 'default' // metric_safe + bundled: safe to advertise as a normal default toolbar option
  | 'qualified' // bundled and renderable, but with fidelity caveats (visual_only / near_metric), e.g. Georgia
  | 'category_fallback' // a usable family fallback, not a faithful clone, e.g. Calibri Light -> Carlito
  | 'requires_asset' // a candidate exists, but SuperDoc does not bundle its asset yet, e.g. Arial Narrow
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
const ADVERTISED_BUILT_IN_TOOLBAR_FAMILIES: ReadonlySet<string> = new Set([
  'Baskerville Old Face',
  'Brush Script MT',
  'Cooper Black',
  'Comic Sans MS',
  'Garamond',
  'Georgia',
  'Lucida Console',
  'Tahoma',
  'Trebuchet MS',
]);

/** Classify one evidence row by its policy action, verdict, and whether its target is bundled. */
function classifyOffering(
  policyAction: (typeof SUBSTITUTION_EVIDENCE)[number]['policyAction'],
  verdict: SubstituteVerdict,
  physicalFamily: string | null,
  bundled: boolean,
): OfferingClass {
  if (policyAction === 'preserve_only') return 'preserve_only';
  if (policyAction === 'customer_supplied' || physicalFamily == null) return 'customer_supplied';
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
      offering: classifyOffering(row.policyAction, row.verdict, row.physicalFamily, bundled),
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
 * The metric-safe, bundled-backed offerings safe to treat as clean defaults, sorted by logical family.
 * Excludes qualified rows (Cambria, Cooper Black, Georgia, Baskerville Old Face), category fallbacks
 * (Calibri Light, Tahoma, Trebuchet MS, Garamond, Comic Sans MS, Brush Script MT, Lucida Console),
 * and not-yet-bundled candidates.
 */
export function getDefaultFontOfferings(): FontOffering[] {
  return FONT_OFFERINGS.filter((o) => o.offering === 'default').sort(compareLogicalFamily);
}

/**
 * Built-in font picker options SuperDoc can render from its bundled assets. Includes clean defaults plus
 * explicitly advertised qualified/category fallbacks. Consumers that need strict metric-safe choices
 * should use {@link getDefaultFontOfferings}.
 */
export function getBuiltInToolbarFontOfferings(): FontOffering[] {
  return FONT_OFFERINGS.filter(
    (o) =>
      o.offering === 'default' ||
      (o.bundled &&
        ADVERTISED_BUILT_IN_TOOLBAR_FAMILIES.has(o.logicalFamily) &&
        (o.offering === 'qualified' || o.offering === 'category_fallback')),
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
export function getDefaultFontFamilyOptions(): readonly { label: string; value: string }[] {
  return getBuiltInToolbarFontOfferings().map((offering) => ({
    label: offering.logicalFamily,
    value: fontOfferingStack(offering),
  }));
}
