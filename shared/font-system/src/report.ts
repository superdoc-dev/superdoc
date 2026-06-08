import { resolveFontFamily, resolveFace, type FaceKey, type FontResolutionReason, type FontResolver } from './resolver';
import type { FontRegistry } from './registry';
import { getRenderableFallback, getRenderableFallbackForFace } from '@docfonts/fallbacks';
import type {
  FaceSlot,
  GlyphException,
  SubstituteVerdict,
  SubstitutePolicyAction,
} from './substitution-evidence';
import { isSettled, type FontLoadStatus } from './types';

/**
 * docfonts fidelity evidence for a row where SuperDoc rendered the recommended substitute. Local types
 * only (no `@docfonts/fallbacks` in the emitted `.d.ts`). `verdict` describes THIS row: the worst-face
 * top-level verdict on family rows, the per-face verdict on face rows - so a consumer never reads
 * `reason: 'bundled_substitute'` as a clean clone (Cambria -> Caladea is `visual_only` overall but
 * `metric_safe` at Regular).
 */
export interface ResolvedFontEvidence {
  /** docfonts evidence id, e.g. "cambria". */
  evidenceId: string;
  /** renderer-neutral action behind the substitution. */
  policyAction: SubstitutePolicyAction;
  /** fidelity verdict for this row (per-face on face rows; worst-face top-level on family rows). */
  verdict: SubstituteVerdict;
  /** advances preserve line breaks: metric_safe, near_metric, or monospace cell_width_only. */
  lineBreakSafe: boolean;
  /** named glyph-level divergences qualifying this row's face(s); omitted when none apply. */
  glyphExceptions?: readonly GlyphException[];
}

/** Map a runtime weight/style face to its RIBBI slot, for the face-aware docfonts lookup. */
const faceSlotFor = ({ weight, style }: FaceKey): FaceSlot => {
  const bold = weight === '700';
  const italic = style === 'italic';
  if (bold && italic) return 'boldItalic';
  if (bold) return 'bold';
  if (italic) return 'italic';
  return 'regular';
};

/** Whether a resolution reason means SuperDoc rendered the docfonts-recommended substitute. */
const isRenderedSubstitute = (reason: FontResolutionReason): boolean =>
  reason === 'bundled_substitute' || reason === 'category_fallback';

/**
 * The resolver already asset-gated against the bundle, so the report only needs docfonts' verdict
 * projection for what rendered - query with everything renderable.
 */
const RENDER_ALL = { canRenderFamily: (): boolean => true };

/**
 * Project a docfonts fallback - already verdict-/exception-scoped by `@docfonts/fallbacks` (top-level
 * for a family lookup, per-face for {@link getRenderableFallbackForFace}) - onto SuperDoc's LOCAL
 * {@link ResolvedFontEvidence}. Copies only the report-safe fields, so the package's types never enter
 * the emitted `.d.ts`. A null fallback (none renderable) becomes undefined.
 */
function toEvidence(
  fallback: ReturnType<typeof getRenderableFallback>,
): ResolvedFontEvidence | undefined {
  if (!fallback) return undefined;
  return {
    evidenceId: fallback.evidenceId,
    policyAction: fallback.policyAction,
    verdict: fallback.verdict,
    lineBreakSafe: fallback.lineBreakSafe,
    ...(fallback.glyphExceptions ? { glyphExceptions: fallback.glyphExceptions } : {}),
  };
}

/**
 * One row of the font report: what the document asked for, what SuperDoc actually
 * renders, why, whether it was ready before measurement, and what export preserves.
 *
 * This is the observable answer to "what font did SuperDoc use, and is that faithful?"
 * e.g. requested Calibri -> rendered Carlito (bundled_substitute), loaded before measure,
 * export still Calibri.
 */
export interface FontResolutionRecord {
  /** The family the document requested (e.g. "Calibri"). */
  logicalFamily: string;
  /** The physical family actually measured and painted (e.g. "Carlito"). */
  physicalFamily: string;
  /** Why the physical family differs from the logical one. */
  reason: FontResolutionReason;
  /** Load state of the physical face at report time (`loaded` = ready before measurement). */
  loadStatus: FontLoadStatus;
  /** The family export writes back - always the logical name, so intent is preserved. */
  exportFamily: string;
  /**
   * True when SuperDoc did NOT faithfully render the requested font with a metric-compatible face.
   * Two ways this happens:
   *   - a non-metric substitute rendered but is not faithful, so it is missing EVEN WHEN `loaded`:
   *     `reason: 'category_fallback'` (wrong weight / reflows, e.g. Calibri Light -> Carlito), and on
   *     face-level rows `reason: 'fallback_face_absent'` (the substitute lacks this weight/style).
   *   - the physical face settled to a state other than `loaded`: a font with no known substitute
   *     (`reason: 'as_requested'`, e.g. Aptos), or a substitute whose asset failed
   *     (`reason: 'bundled_substitute'`, `loadStatus: 'failed'`, e.g. a 404ing `assetBaseUrl`).
   * Transient states (`unloaded` / `loading`) are NOT missing, so an early `getReport()` pull before
   * the gate settles does not over-report. `reason` and `loadStatus` distinguish the cause.
   */
  missing: boolean;
  /**
   * The specific face (weight/style) this row describes, present only on FACE-level rows
   * ({@link buildFaceReport}); undefined on family-level rows ({@link buildFontReport}). A
   * face-level row with `reason: 'fallback_face_absent'` means a substitute exists for the family
   * but not for THIS face, so this face renders unsubstituted (non-metric) while other faces of the
   * same family may substitute. Optional + additive, so existing consumers are unaffected.
   */
  face?: { weight: '400' | '700'; style: 'normal' | 'italic' };
  /**
   * docfonts fidelity evidence, present ONLY when SuperDoc rendered the recommended substitute
   * (`reason` `bundled_substitute` or `category_fallback`). Lets a consumer distinguish a clean clone
   * (Calibri -> Carlito, `metric_safe`) from a qualified one (Cambria -> Caladea, `visual_only`)
   * instead of treating every `bundled_substitute` alike. Optional + additive. See {@link ResolvedFontEvidence}.
   */
  evidence?: ResolvedFontEvidence;
}

/**
 * Build the per-font resolution report for a document's logical fonts. Pure given the
 * resolver map and the registry's current load state, so it reflects exactly what was
 * resolved and loaded for the last measurement pass.
 *
 * This is the diagnostics seam: the public `superdoc.fonts.getReport()` (T7) and the
 * upgraded `onFontsResolved` payload are thin wrappers over this - they must not compute
 * resolution independently, or the report could disagree with what actually painted.
 */
export function buildFontReport(
  logicalFamilies: Iterable<string>,
  registry: FontRegistry,
  resolver?: FontResolver,
): FontResolutionRecord[] {
  const seen = new Set<string>();
  const report: FontResolutionRecord[] = [];
  for (const logical of logicalFamilies) {
    if (!logical || seen.has(logical)) continue;
    seen.add(logical);
    // Resolve through the document's resolver so the report reflects its per-document
    // `fonts.map`; fall back to the shared bundled map for callers without a context.
    const { physicalFamily, reason } = resolver ? resolver.resolveFontFamily(logical) : resolveFontFamily(logical);
    const loadStatus = registry.getStatus(physicalFamily);
    const evidence = isRenderedSubstitute(reason)
      ? toEvidence(getRenderableFallback(logical, RENDER_ALL))
      : undefined;
    report.push({
      logicalFamily: logical,
      physicalFamily,
      reason,
      loadStatus,
      exportFamily: logical,
      // `category_fallback` is a non-metric substitute (reflows / wrong weight), so it lacks a faithful
      // render the same way `fallback_face_absent` does, regardless of whether the family loaded.
      missing: reason === 'category_fallback' || (isSettled(loadStatus) && loadStatus !== 'loaded'),
      // docfonts verdict for the rendered substitute (family-level: top-level worst-face verdict).
      ...(evidence ? { evidence } : {}),
    });
  }
  return report;
}

/** One used (logical family + face) the document actually renders, for the face-level report. */
export interface UsedFace extends FaceKey {
  logicalFamily: string;
}

/**
 * Face-level resolution report: one row per (logical family, face) the document RENDERS, resolved
 * FACE-aware so a substitute that lacks a face is reported `fallback_face_absent` rather than
 * silently faux-styled. The caller passes the used faces (super-editor builds them from the load
 * planner, which carries logical family + weight/style); `registry.hasFace` is the face-availability
 * oracle. Unlike {@link buildFontReport} (one row per declared family), this explains per-face
 * fidelity, e.g. "Baskerville Regular -> Bacasime (custom_mapping); Baskerville Bold ->
 * fallback_face_absent". Deduped by logical family + weight + style.
 */
export function buildFaceReport(
  usedFaces: Iterable<UsedFace>,
  registry: FontRegistry,
  resolver?: FontResolver,
): FontResolutionRecord[] {
  const hasFace = (family: string, weight: '400' | '700', style: 'normal' | 'italic'): boolean =>
    registry.hasFace(family, weight, style);
  const seen = new Set<string>();
  const report: FontResolutionRecord[] = [];
  for (const { logicalFamily, weight, style } of usedFaces) {
    if (!logicalFamily) continue;
    const key = `${logicalFamily.toLowerCase()}|${weight}|${style}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const face: FaceKey = { weight, style };
    // Resolve through the document's resolver (so a per-document `fonts.map` is reflected); the
    // shared default for callers without one. Face-aware: a substitute that lacks this face yields
    // `fallback_face_absent` with the logical family passed through.
    const { physicalFamily, reason } = resolver
      ? resolver.resolveFace(logicalFamily, face, hasFace)
      : resolveFace(logicalFamily, face, hasFace);
    // Per-FACE load status (not the family rollup), so a failed/fallback bold face does not make a
    // loaded regular face row report missing, and vice versa.
    const loadStatus = registry.getFaceStatus({ family: physicalFamily, weight, style });
    // `missing` = SuperDoc did not faithfully render this face with a metric-compatible substitute.
    // - `fallback_face_absent` is ALWAYS missing: the substitute lacks this weight/style so the family
    //   passes through unsubstituted. That pass-through is not a registered FontFace, so it can never
    //   report `loaded` (document.fonts.load resolves only registered faces, not system fonts - it is
    //   always `fallback_used` here), which is why this is reason-based and deterministic rather than
    //   keyed on a probe.
    // - `category_fallback` is ALWAYS missing too: a non-metric family fallback (reflows / wrong weight,
    //   e.g. Calibri Light -> Carlito at Regular) renders something, but not a faithful metric match.
    // - Otherwise: missing once the load settles to anything but `loaded` (failed/timed_out/
    //   fallback_used); `loading`/`unloaded` are not yet settled, so not yet missing.
    const missing =
      reason === 'fallback_face_absent' ||
      reason === 'category_fallback' ||
      (isSettled(loadStatus) && loadStatus !== 'loaded');
    const evidence = isRenderedSubstitute(reason)
      ? toEvidence(getRenderableFallbackForFace(logicalFamily, faceSlotFor(face), RENDER_ALL))
      : undefined;
    report.push({
      logicalFamily,
      // For an embedded font, the resolved physical is a document-unique INTERNAL alias
      // (`__superdoc_embedded_*`) used only to keep render ownership in the shared FontFaceSet - the
      // load-status lookup above needs it, but the faithful physical the user sees is the real (logical)
      // family. Report the logical name for `registered_face` so the alias never leaks into the public
      // report. (`fonts.add` registered_face already has physical === logical, so this is a no-op there.)
      physicalFamily: reason === 'registered_face' ? logicalFamily : physicalFamily,
      reason,
      loadStatus,
      exportFamily: logicalFamily,
      missing,
      face,
      // docfonts verdict for the rendered substitute, scoped to THIS face (per-face verdict + only this
      // slot's glyph exceptions, so Cambria Regular never shows the Bold Italic exception).
      ...(evidence ? { evidence } : {}),
    });
  }
  return report;
}
