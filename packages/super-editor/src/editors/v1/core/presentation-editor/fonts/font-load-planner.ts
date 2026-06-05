import {
  resolveFontFamily,
  type FaceKey,
  type FontFaceRequest,
  type FontResolutionReason,
  type FontResolver,
  type UsedFace,
} from '@superdoc/font-system';
import type { FlowBlock, ParagraphBlock, TableBlock, ListBlock, Run } from '@superdoc/contracts';

/**
 * Face-aware font planner.
 *
 * Walks the layout input ONCE and produces the single render font plan that drives loading,
 * diagnostics, paint/measure resolution, and cache identity:
 *  - `requiredFaces`: the exact physical FACES the load gate must await - the substitute, or the
 *    logical family when the substitute lacks that face (so a fallback face still loads/falls back),
 *    never a phantom `{substitute, 700}` for a face the substitute does not provide.
 *  - `usedFaces`: the logical faces the document renders, for the face-level report.
 *  - `effectiveSignature`: the render/measure CACHE identity (see {@link FontPlan}).
 *
 * Why face-aware: `document.fonts.load('16px "Carlito"')` loads only the regular face, and a
 * single-face substitute (or a customer `fonts.map` to one) must NOT be faux-styled onto a
 * weight/style it lacks. Resolution therefore consults `hasFace` - the registry's
 * registered-face oracle (bundled faces + `fonts.add()` faces) - via the document's resolver.
 */

/** Face-availability oracle: does the PHYSICAL family provide this face? Registry-backed. */
export type HasFace = (physicalFamily: string, weight: '400' | '700', style: 'normal' | 'italic') => boolean;

/** The single render font plan from one walk of the layout blocks. */
export interface FontPlan {
  /** Physical faces the load gate must await (resolved substitute, or logical for fallback_face_absent). */
  requiredFaces: FontFaceRequest[];
  /** Logical faces the document renders, for the face-level report (`buildFaceReport`). */
  usedFaces: UsedFace[];
  /**
   * Render/measure CACHE IDENTITY: a stable, sorted, collision-safe JSON serialization of the
   * document's resolved faces - sorted tuples `[logicalLower, weight, style, physicalLower, reason]`
   * (empty `''` when no faces are used). This (NOT `resolver.signature`, which
   * captures only the family map) is what measure/paint/layout cache keys must fold in: a
   * `fonts.add()` that makes a face available changes a face's resolution for the SAME family map, so
   * two documents with the same map but different registered faces resolve differently and must not
   * share entries in the shared (module-singleton) measure cache. Load status is intentionally
   * EXCLUDED - loading/timeout/late-load have their own invalidation and reporting paths; this
   * answers only "for this rendered face, what CSS family will measure and paint use".
   */
  effectiveSignature: string;
}

/** Anything that carries a measurable text font: a run, a list marker run, a drop cap run, etc. */
interface FontBearing {
  fontFamily?: unknown;
  bold?: unknown;
  italic?: unknown;
}

/** The bare primary family of a CSS value: "Calibri, sans-serif" -> "Calibri". */
function primaryFamily(css: string): string {
  const comma = css.indexOf(',');
  // Strip surrounding quotes like the resolver's normalizeFamilyKey, so a quoted primary
  // (`"Calibri"`) and its bare form collapse to ONE used face / report row / signature entry
  // instead of two. Case is preserved for display; the dedup key lowercases separately.
  return (comma === -1 ? css : css.slice(0, comma)).trim().replace(/^["']|["']$/g, '');
}

/** Resolve a logical family + face to its physical render family and reason, for this document. */
type ResolveFace = (logicalFamily: string, face: FaceKey) => { physicalFamily: string; reason: FontResolutionReason };

function makeResolveFace(resolver: FontResolver | undefined, hasFace: HasFace | undefined): ResolveFace {
  if (resolver && hasFace) {
    return (logical, face) => {
      const r = resolver.resolveFace(logical, face, hasFace);
      return { physicalFamily: r.physicalFamily, reason: r.reason };
    };
  }
  // No face oracle: fall back to family-level resolution (legacy behaviour, e.g. context-free tests).
  if (resolver) {
    return (logical) => {
      const r = resolver.resolveFontFamily(logical);
      return { physicalFamily: r.physicalFamily, reason: r.reason };
    };
  }
  // No resolver at all (legacy / context-free): route through the shared DEFAULT resolver so the
  // reason still reflects a bundled substitute when a clone applies, instead of a misleading
  // 'as_requested'. Family-level (no face oracle here); PE always passes the document resolver.
  return (logical) => {
    const r = resolveFontFamily(logical);
    return { physicalFamily: r.physicalFamily, reason: r.reason };
  };
}

interface Acc {
  requiredFaces: Map<string, FontFaceRequest>;
  usedFaces: Map<string, UsedFace>;
  /**
   * usedKey -> the structured resolution tuple `[logicalLower, weight, style, physicalLower, reason]`.
   * Serialized to the effective signature as JSON (NOT a delimited join): a font family is a free
   * ST_String that may contain `;`, `|`, or `=>`, so a delimited form could serialize two distinct
   * resolution sets to the same key and cause wrong cache reuse. JSON of structured tuples is
   * collision-safe, matching {@link FontResolver.signature}.
   */
  sigEntries: Map<string, [string, '400' | '700', 'normal' | 'italic', string, string]>;
}

/** Collect a face from any font-bearing object into the dedup maps + signature entries. */
function collect(acc: Acc, node: FontBearing | null | undefined, resolveFace: ResolveFace): void {
  if (!node || typeof node.fontFamily !== 'string' || !node.fontFamily) return;
  const weight: '400' | '700' = node.bold === true ? '700' : '400';
  const style: 'normal' | 'italic' = node.italic === true ? 'italic' : 'normal';
  const logicalPrimary = primaryFamily(node.fontFamily);
  if (!logicalPrimary) return;
  const usedKey = `${logicalPrimary.toLowerCase()}|${weight}|${style}`;
  if (acc.usedFaces.has(usedKey)) return; // already collected this used face
  const { physicalFamily, reason } = resolveFace(node.fontFamily, { weight, style });
  acc.usedFaces.set(usedKey, { logicalFamily: logicalPrimary, weight, style });
  acc.sigEntries.set(usedKey, [
    logicalPrimary.toLowerCase(),
    weight,
    style,
    (physicalFamily || '').toLowerCase(),
    reason,
  ]);
  if (physicalFamily) {
    const reqKey = `${physicalFamily.toLowerCase()}|${weight}|${style}`;
    if (!acc.requiredFaces.has(reqKey)) acc.requiredFaces.set(reqKey, { family: physicalFamily, weight, style });
  }
}

function collectRuns(acc: Acc, runs: Run[] | undefined, resolveFace: ResolveFace): void {
  if (!runs) return;
  // Duck-typed on fontFamily so every font-bearing run kind is covered (text, fieldAnnotation,
  // dropCap, ...) - missing one would silently measure against a fallback.
  for (const run of runs) {
    const bearing = run as unknown as FontBearing;
    // A field annotation with no explicit font is measured against 'Arial' by the measurer (its
    // buildFontString default), so plan that face rather than skip the fontless run.
    if (run.kind === 'fieldAnnotation' && (typeof bearing.fontFamily !== 'string' || !bearing.fontFamily)) {
      collect(acc, { ...bearing, fontFamily: 'Arial' }, resolveFace);
    } else {
      collect(acc, bearing, resolveFace);
    }
  }
}

function collectParagraph(acc: Acc, paragraph: ParagraphBlock | undefined, resolveFace: ResolveFace): void {
  if (!paragraph) return;
  collectRuns(acc, paragraph.runs, resolveFace);
  // The word-layout list marker glyph ("1.", "•") is measured with its OWN run font, which can be a
  // different family/weight/style than the item text - so it must be planned too.
  collect(acc, paragraph.attrs?.wordLayout?.marker?.run as FontBearing | undefined, resolveFace);
  // A drop cap is measured from attrs.dropCapDescriptor.run with its own, often large, font; the cap
  // text is moved out of `runs`, so plan it here.
  collect(acc, paragraph.attrs?.dropCapDescriptor?.run as FontBearing | undefined, resolveFace);
}

function collectTable(acc: Acc, table: TableBlock, resolveFace: ResolveFace): void {
  for (const row of table.rows) {
    for (const cell of row.cells) {
      collectParagraph(acc, cell.paragraph, resolveFace);
      if (cell.blocks) for (const b of cell.blocks) collectBlock(acc, b as FlowBlock, resolveFace);
    }
  }
}

function collectList(acc: Acc, list: ListBlock, resolveFace: ResolveFace): void {
  // collectParagraph covers the item text AND any word-layout marker font on the paragraph attrs.
  for (const item of list.items) collectParagraph(acc, item.paragraph, resolveFace);
}

function collectBlock(acc: Acc, block: FlowBlock, resolveFace: ResolveFace): void {
  switch (block.kind) {
    case 'paragraph':
      collectParagraph(acc, block, resolveFace);
      break;
    case 'table':
      collectTable(acc, block, resolveFace);
      break;
    case 'list':
      collectList(acc, block, resolveFace);
      break;
    default:
      // image/drawing/section/page/column breaks carry no measurable text font.
      break;
  }
}

/**
 * Build the single render font plan from one walk of the given layout blocks. A `resolver` (the
 * document's) + `hasFace` (its registry's oracle) make resolution face-aware; without `hasFace` it
 * falls back to family-level resolution (e.g. context-free tests). The caller passes every block
 * this render measures - body, notes, header/footer, footnotes - so each measured face is planned.
 */
export function planFontFaces(
  blocks: readonly FlowBlock[] | null | undefined,
  resolver?: FontResolver,
  hasFace?: HasFace,
): FontPlan {
  const resolveFace = makeResolveFace(resolver, hasFace);
  const acc: Acc = { requiredFaces: new Map(), usedFaces: new Map(), sigEntries: new Map() };
  if (blocks) for (const block of blocks) collectBlock(acc, block, resolveFace);
  return {
    requiredFaces: [...acc.requiredFaces.values()],
    usedFaces: [...acc.usedFaces.values()],
    // Collision-safe: sort by usedKey (deterministic, order-independent) and JSON-encode the
    // structured resolution tuples, so a family name containing a delimiter cannot forge a
    // colliding signature (see Acc.sigEntries). Empty stays '' (not '[]') so default documents keep
    // the shared-cache fast path that keys on a falsy signature.
    effectiveSignature:
      acc.sigEntries.size === 0
        ? ''
        : JSON.stringify(
            [...acc.sigEntries.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, tuple]) => tuple),
          ),
  };
}

/**
 * Back-compat: the deduped physical face requests only (family-level when no `hasFace` is given).
 * Prefer {@link planFontFaces} for the full render plan (faces + report inputs + cache identity).
 */
export function planRequiredFontFaces(
  blocks: readonly FlowBlock[] | null | undefined,
  resolver?: FontResolver,
  hasFace?: HasFace,
): FontFaceRequest[] {
  return planFontFaces(blocks, resolver, hasFace).requiredFaces;
}
