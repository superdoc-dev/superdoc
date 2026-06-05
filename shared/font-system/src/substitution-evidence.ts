/**
 * Substitution EVIDENCE: per logical font, the measured docfonts verdict behind SuperDoc's
 * logical -> physical substitution. Pure data, no imports. The resolver derives its substitute map
 * from this (see `resolver.ts`), so this file is the single source of truth for WHICH logical family
 * maps to WHICH physical substitute and HOW faithful that substitution is.
 *
 * Distinct from {@link ./bundled-manifest} (the PHYSICAL pack: which `.woff2` files ship). That is the
 * asset layer; this is the EVIDENCE layer - which proprietary font each substitute stands in for, the
 * docfonts verdict, per-face verdicts, and the worst-case advance delta that gates layout fidelity.
 *
 * VENDORED SNAPSHOT. docfonts (`@docfonts/core` + `@docfonts/registry`) is the upstream source of
 * truth: a measured, reviewed registry kept in a separate repo, not yet a build dependency of
 * SuperDoc. These rows are a hand-reviewed copy of the docfonts EvidenceRecords for the families
 * SuperDoc currently substitutes; `evidenceId` + `measurementRefs` point back to the source record. A
 * generator/import is deferred until docfonts is a dependency CI can reproduce - until then this is
 * reviewed evidence (committed, PR-reviewed), never an unsupervised generated truth source.
 *
 * Scope note: this is the DATA plus the resolver derivation only. Reports do NOT yet branch on
 * `verdict` - Cambria still resolves to Caladea and reports `bundled_substitute`; verdict-aware
 * diagnostics are a later pass. The richer fields ride along as data so that pass needs no reshape.
 */

/** docfonts fidelity verdict, best to worst. Vendored from `@docfonts/core` `Verdict`. */
export type SubstituteVerdict =
  | 'metric_safe' // advances within the DIRECT threshold (weighted-mean <= 0.5%, worst-case <= 1%)
  | 'near_metric' // LIKELY band: weighted-mean <= 1%, worst-case <= 2.5% - near-exact, a few glyphs drift
  | 'cell_width_only' // monospace cell width matches; glyph shapes do not
  | 'visual_only' // same visual category, but advances are NOT line-break safe
  | 'customer_supplied' // the real font must come from the customer
  | 'preserve_only' // keep the original name, do not substitute (e.g. math / symbol fonts)
  | 'no_substitute'; // no open candidate qualifies

/** docfonts renderer-neutral resolution action. Vendored from `@docfonts/core` `PolicyAction`. */
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
 * structured data, not free text.
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
 * The substitution evidence for every family SuperDoc currently substitutes - six rows, vendored from
 * docfonts. The resolver maps the rows whose `policyAction` is `substitute`; the verdict / per-face /
 * glyph-exception fields are carried for the later verdict-aware reporting pass and are not yet read.
 */
export const SUBSTITUTION_EVIDENCE: readonly SubstitutionEvidence[] = Object.freeze([
  {
    evidenceId: 'calibri',
    logicalFamily: 'Calibri',
    physicalFamily: 'Carlito',
    verdict: 'metric_safe',
    faces: { regular: true, bold: true, italic: true, boldItalic: true },
    advance: { meanDelta: 0, maxDelta: 0 },
    gates: { static: 'pass', metric: 'pass', layout: 'pass', ship: 'pass' },
    policyAction: 'substitute',
    measurementRefs: [
      'calibri__carlito#analytic_advance#2026-06-03',
      'calibri__carlito#face_aggregate#2026-06-03',
    ],
    candidateLicense: 'OFL-1.1',
    exportRule: 'preserve_original_name',
  },
  {
    // The QUALIFIED case. Regular/bold/italic are metric_safe, but Caladea's Bold Italic grave accent
    // (U+0060) advance diverges ~23%, so a line containing it reflows. The worst face rolls the
    // top-level verdict to `visual_only`; policyAction stays `substitute` (Caladea IS the recommended
    // substitute), which is why the resolver still maps Cambria. faceVerdicts is authoritative.
    evidenceId: 'cambria',
    logicalFamily: 'Cambria',
    physicalFamily: 'Caladea',
    verdict: 'visual_only',
    faceVerdicts: { regular: 'metric_safe', bold: 'metric_safe', italic: 'metric_safe', boldItalic: 'visual_only' },
    glyphExceptions: [
      {
        slot: 'boldItalic',
        codepoint: 0x60,
        advanceDelta: 0.231,
        note: 'Caladea Bold Italic grave accent (U+0060) advance diverges ~23% from Cambria; lines containing it reflow.',
      },
    ],
    faces: { regular: true, bold: true, italic: true, boldItalic: true },
    advance: { meanDelta: 0.0002378, maxDelta: 0.2310758 },
    gates: { static: 'pass', metric: 'pass', layout: 'not_run', ship: 'pass' },
    policyAction: 'substitute',
    measurementRefs: [
      'cambria_regular__caladea#regular#w400#d2f6cad3#analytic_advance#2026-06-04',
      'cambria_bold__caladea#bold#w700#74eda4fc#analytic_advance#2026-06-04',
      'cambria_italic__caladea#italic#w400#9c968bf6#analytic_advance#2026-06-04',
      'cambria_boldItalic__caladea#boldItalic#w700#f47a35ad#analytic_advance#2026-06-04',
    ],
    candidateLicense: 'Apache-2.0',
    exportRule: 'preserve_original_name',
  },
  {
    evidenceId: 'arial',
    logicalFamily: 'Arial',
    physicalFamily: 'Liberation Sans',
    verdict: 'metric_safe',
    faces: { regular: true, bold: true, italic: true, boldItalic: true },
    advance: { meanDelta: 0, maxDelta: 0 },
    gates: { static: 'pass', metric: 'pass', layout: 'not_run', ship: 'pass' },
    policyAction: 'substitute',
    measurementRefs: ['arial__liberation-sans#analytic_advance#2026-06-03'],
    candidateLicense: 'OFL-1.1',
    exportRule: 'preserve_original_name',
  },
  {
    evidenceId: 'times-new-roman',
    logicalFamily: 'Times New Roman',
    physicalFamily: 'Liberation Serif',
    verdict: 'metric_safe',
    faces: { regular: true, bold: true, italic: true, boldItalic: true },
    advance: { meanDelta: 0, maxDelta: 0 },
    gates: { static: 'pass', metric: 'pass', layout: 'not_run', ship: 'pass' },
    policyAction: 'substitute',
    measurementRefs: ['times-new-roman__liberation-serif#analytic_advance#2026-06-03'],
    candidateLicense: 'OFL-1.1',
    exportRule: 'preserve_original_name',
  },
  {
    evidenceId: 'courier-new',
    logicalFamily: 'Courier New',
    physicalFamily: 'Liberation Mono',
    verdict: 'metric_safe',
    faces: { regular: true, bold: true, italic: true, boldItalic: true },
    advance: { meanDelta: 0, maxDelta: 0 },
    gates: { static: 'pass', metric: 'pass', layout: 'not_run', ship: 'pass' },
    policyAction: 'substitute',
    measurementRefs: ['courier-new__liberation-mono#analytic_advance#2026-06-03'],
    candidateLicense: 'OFL-1.1',
    exportRule: 'preserve_original_name',
  },
  {
    // Same candidate and metric verdict as Arial. metric_safe from one Apple/macOS Helvetica
    // analytic-advance measurement (0.000% delta). Its static + layout gates are `not_run`, and ship
    // was `fail` in docfonts only because SuperDoc had not consumed the alias yet - a stale-until-
    // shipped gate, NOT a fidelity signal, so it never gates inclusion here (policyAction does).
    evidenceId: 'helvetica',
    logicalFamily: 'Helvetica',
    physicalFamily: 'Liberation Sans',
    verdict: 'metric_safe',
    faces: { regular: true, bold: true, italic: true, boldItalic: true },
    advance: { meanDelta: 0, maxDelta: 0 },
    gates: { static: 'not_run', metric: 'pass', layout: 'not_run', ship: 'fail' },
    policyAction: 'substitute',
    measurementRefs: ['helvetica__liberation-sans#analytic_advance#2026-06-03'],
    candidateLicense: 'OFL-1.1',
    exportRule: 'preserve_original_name',
  },
  {
    // No open Calibri Light clone: Carlito carries the Calibri letterforms but has no Light face, so it
    // renders at Regular (weight 400 vs Light 300) and reflows up to 6.6%. `category_fallback` (a family
    // fallback, NOT a metric clone), verdict `visual_only`, metric gate fails. `faces` are all false:
    // Carlito faithfully supplies none of Calibri Light's own faces - the runtime still renders Carlito
    // Regular where it is loadable, but reports it non-metric.
    evidenceId: 'calibri-light',
    logicalFamily: 'Calibri Light',
    physicalFamily: 'Carlito',
    verdict: 'visual_only',
    faces: { regular: false, bold: false, italic: false, boldItalic: false },
    advance: { meanDelta: 0.0148, maxDelta: 0.066 },
    gates: { static: 'not_run', metric: 'fail', layout: 'not_run', ship: 'fail' },
    policyAction: 'category_fallback',
    measurementRefs: ['calibri-light__carlito#analytic_advance#2026-06-05'],
    candidateLicense: 'OFL-1.1',
    exportRule: 'preserve_original_name',
  },
]);
