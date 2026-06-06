/**
 * Substitution EVIDENCE for SuperDoc's logical -> physical font substitution: the measured docfonts
 * verdict behind each row. The DATA is sourced from `@docfonts/fallbacks` (one upstream, measured,
 * PR-reviewed registry); the TYPE shapes are SuperDoc's own, kept LOCAL so the public facade stays
 * self-contained - re-exporting the package's types would leave `@docfonts/fallbacks` in superdoc's
 * emitted `.d.ts`, which a consumer (who does not install that package) cannot resolve.
 *
 * The const assignment at the bottom pins the package's rows to SuperDoc's {@link SubstitutionEvidence}
 * contract: if the registry's shape stops matching, this file fails to compile - a build-time drift
 * guard. docfonts owns the evidence; SuperDoc owns WHICH rows activate (asset-gated in `resolver.ts`
 * against `bundled-manifest`) and how they load, render, and report.
 */
import { SUBSTITUTION_EVIDENCE as DOCFONTS_EVIDENCE } from '@docfonts/fallbacks';

/** docfonts fidelity verdict, best to worst. */
export type SubstituteVerdict =
  | 'metric_safe' // advances within the DIRECT threshold (weighted-mean <= 0.5%, worst-case <= 1%)
  | 'near_metric' // LIKELY band: weighted-mean <= 1%, worst-case <= 2.5% - near-exact, a few glyphs drift
  | 'cell_width_only' // monospace cell width matches; glyph shapes do not
  | 'visual_only' // same visual category, but advances are NOT line-break safe
  | 'customer_supplied' // the real font must come from the customer
  | 'preserve_only' // keep the original name, do not substitute (e.g. math / symbol fonts)
  | 'no_substitute'; // no open candidate qualifies

/** docfonts renderer-neutral resolution action. */
export type SubstitutePolicyAction =
  | 'substitute' // render the named physical candidate in place of the logical font
  | 'category_fallback' // no clean candidate; fall back to a generic category (serif / sans / mono)
  | 'preserve_only' // keep the logical name + a system fallback; claim no substitute
  | 'customer_supplied'; // the customer must provide the real font

/** Derived public gate status. Diagnostic only - NOT a runtime inclusion input. */
export type SubstituteGateStatus = 'pass' | 'not_run' | 'fail';

/**
 * RIBBI face slot - the four canonical faces docfonts scores. Deliberately NOT named `StyleKey` (its
 * docfonts name) or `FaceKey` (the runtime weight/style face in `resolver.ts`): an evidence slot is a
 * coarse RIBBI bucket, not a runtime weight+style pair, and the two must not be confused.
 */
export type FaceSlot = 'regular' | 'bold' | 'italic' | 'boldItalic';

/** Advance-width divergence vs the proprietary oracle, as fractions (0 = identical advances). */
export interface AdvanceDelta {
  meanDelta: number;
  /** the worst-case delta, not the mean, is what gates line-break fidelity. */
  maxDelta: number;
}

/** Which of the four RIBBI faces the physical candidate supplies. */
export interface FaceCoverage {
  regular: boolean;
  bold: boolean;
  italic: boolean;
  boldItalic: boolean;
}

/** The four derived gate statuses behind a verdict; the proof is the referenced measurements. */
export interface SubstituteGates {
  static: SubstituteGateStatus;
  metric: SubstituteGateStatus;
  layout: SubstituteGateStatus;
  ship: SubstituteGateStatus;
}

/**
 * A named glyph-level advance divergence that qualifies one face: the honest exception behind a face
 * whose advances match everywhere EXCEPT a specific codepoint (e.g. Caladea Bold Italic vs Cambria on
 * U+0060). The full numbers live in the referenced measurement; this names the divergence publicly.
 */
export interface GlyphException {
  slot: FaceSlot;
  /** the diverging codepoint, e.g. 0x60 (grave accent). */
  codepoint: number;
  /** fractional advance divergence at this glyph (0.231 = 23.1%). */
  advanceDelta: number;
  note: string;
}

/**
 * One logical font's substitution evidence. Mirrors the renderer-relevant fields of a docfonts
 * EvidenceRecord and omits its prose (`notes`, `confidence`, measured dates): SuperDoc decides from
 * structured data, not free text. The {@link SUBSTITUTION_EVIDENCE} assignment enforces that the
 * package's rows conform to this shape.
 */
export interface SubstitutionEvidence {
  /** docfonts EvidenceRecord id - the provenance pointer back to the source record, e.g. "cambria". */
  evidenceId: string;
  /** the proprietary family the document asks for (docfonts `originalFont`), e.g. "Cambria". */
  logicalFamily: string;
  /** the physical substitute rendered in its place; null when no candidate is recommended. */
  physicalFamily: string | null;
  /** worst-face fidelity verdict (the public summary; see `faceVerdicts` when faces disagree). */
  verdict: SubstituteVerdict;
  /**
   * Per-face verdicts, AUTHORITATIVE when present - set when the faces do not share one verdict (a
   * QUALIFIED substitute). When present, the top-level `verdict` is the WORST face; a consumer showing
   * fidelity must show this breakdown, not the rolled-up verdict alone.
   */
  faceVerdicts?: Partial<Record<FaceSlot, SubstituteVerdict>>;
  /** named glyph-level divergences that qualify a face (e.g. one codepoint reflows). */
  glyphExceptions?: readonly GlyphException[];
  faces: FaceCoverage;
  advance?: AdvanceDelta;
  gates: SubstituteGates;
  /** renderer-neutral action; `substitute` is what makes the resolver map the family. */
  policyAction: SubstitutePolicyAction;
  /** proof pointers back into docfonts, by MeasurementId. */
  measurementRefs: readonly string[];
  /** SPDX id of the substitute's license. */
  candidateLicense?: string | null;
  /** SuperDoc renders substitutes but always exports the original name. Always this for now. */
  exportRule: 'preserve_original_name';
}

/**
 * The reviewed substitution evidence, sourced from `@docfonts/fallbacks` and pinned to SuperDoc's
 * {@link SubstitutionEvidence} contract (the assignment is the drift guard - see the file header). The
 * resolver activates the rows it can render (asset-gated); the verdict / per-face / glyph-exception
 * fields ride along for the later verdict-aware reporting pass and are not read for inclusion.
 */
export const SUBSTITUTION_EVIDENCE: readonly SubstitutionEvidence[] = DOCFONTS_EVIDENCE;
