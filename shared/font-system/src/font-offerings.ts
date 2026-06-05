/**
 * Font OFFERINGS: the product layer between the substitution evidence and the UI. It answers a
 * different question than the resolver does. The resolver answers "given a logical font a document
 * already uses, what do we render?". An offering answers "should SuperDoc advertise this logical font
 * as a choice, and on which surface?".
 *
 * Two consumers are intended (only the first ships here):
 *   1. DEFAULT toolbar options - reliable, bundled, metric-safe fonts SuperDoc can render
 *      deterministically today. Built from {@link getDefaultFontOfferings}.
 *   2. DOCUMENT-specific options (later) - whatever a given document actually uses, surfaced with a
 *      fidelity status. That is document-scoped and runtime-aware; it does NOT belong in this static
 *      module.
 *
 * Derived from `SUBSTITUTION_EVIDENCE` x `BUNDLED_MANIFEST`. Adding/retiring a font is an evidence
 * edit, never a hand-maintained toolbar list.
 */
import { SUBSTITUTION_EVIDENCE, type SubstituteVerdict } from './substitution-evidence';
import { BUNDLED_MANIFEST } from './bundled-manifest';

/** CSS generic family used to terminate an offering's fallback stack. */
export type FontGeneric = 'sans-serif' | 'serif' | 'monospace';

/** Which UI surface a logical font may appear on. A product decision, distinct from the verdict. */
export type OfferingClass =
  | 'default' // metric_safe + bundled: safe to advertise as a normal default toolbar option
  | 'qualified' // bundled and renderable, but with fidelity caveats (visual_only / near_metric), e.g. Cambria
  | 'category_fallback' // a usable family fallback, not a faithful clone, e.g. Calibri Light -> Carlito
  | 'requires_asset' // a candidate exists, but SuperDoc does not bundle its asset yet, e.g. Georgia -> Gelasio
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
   * STATIC fact: `physicalFamily` ships in the bundled pack. This is NOT runtime renderability - a
   * document's `fonts.add` faces or embedded fonts are unknown to this static module and belong to a
   * later document-scoped offering function.
   */
  bundled: boolean;
  /** docfonts fidelity verdict, carried for the later fidelity-badge layer; not read for defaults. */
  verdict: SubstituteVerdict;
  /** Provenance back to the evidence row. */
  evidenceId: string;
}

/**
 * CSS generic per bundled physical family. Neither docfonts evidence nor BUNDLED_MANIFEST carries a
 * generic category, so this is an explicit, deliberate classifier. `font-offerings.test.ts` asserts
 * every bundled family appears here, so a new bundled clone cannot silently ship without one.
 */
const PHYSICAL_GENERIC: Readonly<Record<string, FontGeneric>> = Object.freeze({
  Carlito: 'sans-serif', // Calibri
  Caladea: 'serif', // Cambria
  'Liberation Sans': 'sans-serif', // Arial, Helvetica
  'Liberation Serif': 'serif', // Times New Roman
  'Liberation Mono': 'monospace', // Courier New
});

const BUNDLED_FAMILIES: ReadonlySet<string> = new Set(BUNDLED_MANIFEST.map((f) => f.family));

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
      // Generic is only load-bearing for offerings we actually surface (all bundled); a missing entry
      // for a bundled family is a config error the test catches, so the `?? 'sans-serif'` is a guard,
      // not a default we rely on.
      generic: (row.physicalFamily && PHYSICAL_GENERIC[row.physicalFamily]) || 'sans-serif',
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

/**
 * Explicit PRODUCT order for the default toolbar - deliberately NOT the evidence/provenance order the
 * rows happen to sit in. Preserves the prior relative order of the carried-over fonts (Arial, Courier
 * New, Times New Roman) so the toolbar does not reshuffle for existing users.
 */
const DEFAULT_FONT_ORDER: readonly string[] = ['Calibri', 'Arial', 'Courier New', 'Times New Roman', 'Helvetica'];

/**
 * The metric-safe, bundled-backed offerings safe to advertise as DEFAULT toolbar choices, in product
 * order. Excludes qualified (Cambria), category fallbacks (Calibri Light), and not-yet-bundled
 * candidates (Georgia) - those reach the toolbar later as document-specific options with a status.
 */
export function getDefaultFontOfferings(): FontOffering[] {
  const rank = (name: string): number => {
    const i = DEFAULT_FONT_ORDER.indexOf(name);
    return i === -1 ? DEFAULT_FONT_ORDER.length : i; // a future default not yet ranked sorts to the end
  };
  return FONT_OFFERINGS.filter((o) => o.offering === 'default').sort(
    (a, b) => rank(a.logicalFamily) - rank(b.logicalFamily),
  );
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
 * built-in (Vue) toolbar builds its own richer `FontConfig` from {@link getDefaultFontOfferings}.
 */
export function getDefaultFontFamilyOptions(): readonly { label: string; value: string }[] {
  return getDefaultFontOfferings().map((offering) => ({
    label: offering.logicalFamily,
    value: fontOfferingStack(offering),
  }));
}
