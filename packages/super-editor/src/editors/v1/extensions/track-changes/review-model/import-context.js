// @ts-check
/**
 * Importer tracking context for DOCX tracked-change overlap.
 *
 * The current `w:ins`/`w:del`/`w:rPrChange` translators receive an
 * `insideTrackChange` boolean. That's enough to decide that a nested change
 * exists, but it carries no information about the parent's logical id, side,
 * or part path. The import pipeline needs all of that to stamp `overlapParentId` and to
 * report diagnostics when the imported OOXML shape cannot reconstruct the
 * full internal graph.
 *
 * Usage:
 *   const ctx = createImportTrackingContext({
 *     partPath: 'word/document.xml',
 *     replacements: 'paired',
 *   });
 *
 *   ctx.pushParent({ logicalId, side, sourceId, author, date });
 *   // ... descend into nested element ...
 *   ctx.popParent();
 *
 *   ctx.reportDiagnostic({ code: 'IMPORT_MISSING_REPLACEMENT_SIDE', ...details });
 *
 * The context is intentionally lightweight: it does not own the PM document
 * and does not allocate ids. The translators continue to call
 * `buildTrackedChangeIdMap`; the context only adds parent-stack and
 * diagnostics surfaces that the legacy translator code lacked.
 *
 * @typedef {'paired' | 'independent'} ReplacementsMode
 * @typedef {'insertion' | 'deletion' | 'formatting'} ParentSide
 *
 * @typedef {{
 *   logicalId: string,
 *   side: ParentSide,
 *   sourceId: string,
 *   author: string,
 *   date: string,
 * }} ParentFrame
 *
 * @typedef {(
 *   | 'IMPORT_UNSUPPORTED_STRUCTURAL_OVERLAP'
 *   | 'IMPORT_MISSING_AUTHOR_IDENTITY'
 *   | 'IMPORT_HEURISTIC_RECONSTRUCTION'
 *   | 'IMPORT_REPLACEMENT_MISSING_SIDE'
 *   | 'IMPORT_CHILD_MISSING_PARENT'
 *   | 'IMPORT_DUPLICATE_LOGICAL_ID'
 *   | 'EXPORT_FALLBACK_LOSSY'
 * )} ImportDiagnosticCode
 *
 * @typedef {{
 *   code: ImportDiagnosticCode,
 *   partPath: string,
 *   logicalId?: string,
 *   parentLogicalId?: string,
 *   sourceId?: string,
 *   side?: ParentSide,
 *   message?: string,
 *   detail?: Record<string, unknown>,
 * }} ImportDiagnostic
 *
 * @typedef {{
 *   partPath: string,
 *   replacements: ReplacementsMode,
 *   parentStack: () => ReadonlyArray<ParentFrame>,
 *   currentParent: () => ParentFrame | null,
 *   pushParent: (frame: ParentFrame) => void,
 *   popParent: () => ParentFrame | null,
 *   reportDiagnostic: (d: ImportDiagnostic) => void,
 *   diagnostics: () => ReadonlyArray<ImportDiagnostic>,
 *   recordLogicalId: (id: string, source: { sourceId?: string, side?: ParentSide }) => void,
 *   hasLogicalId: (id: string) => boolean,
 *   forNestedPart: (partPath: string) => ImportTrackingContext,
 * }} ImportTrackingContext
 */

/**
 * @param {{
 *   partPath?: string,
 *   replacements?: ReplacementsMode,
 *   diagnostics?: ImportDiagnostic[],
 *   knownLogicalIds?: Map<string, { sourceId?: string, side?: ParentSide, sides?: Set<ParentSide> }>,
 * }} [options]
 * @returns {ImportTrackingContext}
 */
export function createImportTrackingContext(options = {}) {
  const partPath =
    typeof options.partPath === 'string' && options.partPath.length > 0 ? options.partPath : 'word/document.xml';
  const replacements = options.replacements === 'independent' ? 'independent' : 'paired';

  /** @type {ParentFrame[]} */
  const stack = [];

  /** @type {ImportDiagnostic[]} */
  const diagnostics = Array.isArray(options.diagnostics) ? options.diagnostics : [];

  /** @type {Map<string, { sourceId?: string, side?: ParentSide, sides?: Set<ParentSide> }>} */
  const knownLogicalIds = options.knownLogicalIds instanceof Map ? options.knownLogicalIds : new Map();

  /** @param {ImportDiagnostic} d */
  const reportDiagnostic = (d) => {
    if (!d || typeof d !== 'object' || !d.code) return;
    diagnostics.push({ ...d, partPath: d.partPath || partPath });
  };

  /** @type {ImportTrackingContext} */
  const ctx = {
    partPath,
    replacements,
    parentStack: () => stack.slice(),
    currentParent: () => (stack.length > 0 ? stack[stack.length - 1] : null),
    pushParent: (frame) => {
      if (!frame || typeof frame !== 'object' || !frame.logicalId) return;
      stack.push({
        logicalId: String(frame.logicalId),
        side: frame.side,
        sourceId: typeof frame.sourceId === 'string' ? frame.sourceId : '',
        author: typeof frame.author === 'string' ? frame.author : '',
        date: typeof frame.date === 'string' ? frame.date : '',
      });
    },
    popParent: () => (stack.length > 0 ? stack.pop() : null) ?? null,
    reportDiagnostic,
    diagnostics: () => diagnostics.slice(),
    recordLogicalId: (id, source) => {
      if (!id) return;
      const prior = knownLogicalIds.get(id);
      if (prior) {
        const priorSides = prior.sides instanceof Set ? prior.sides : new Set(prior.side ? [prior.side] : []);
        // Word paired replacements can reuse the same w:id across insertion
        // and deletion sides. Reusing the same logical id on the same side is
        // the ambiguous duplicate case this context should report.
        if (source?.side && priorSides.has(source.side)) {
          reportDiagnostic({
            code: 'IMPORT_DUPLICATE_LOGICAL_ID',
            partPath,
            logicalId: id,
            side: source.side,
          });
        }
        if (source?.side) priorSides.add(source.side);
        knownLogicalIds.set(id, {
          sourceId: prior.sourceId || source?.sourceId,
          side: prior.side || source?.side,
          sides: priorSides,
        });
        return;
      }
      knownLogicalIds.set(id, {
        sourceId: source?.sourceId,
        side: source?.side,
        sides: source?.side ? new Set([source.side]) : new Set(),
      });
    },
    hasLogicalId: (id) => Boolean(id) && knownLogicalIds.has(id),
    forNestedPart: (nestedPartPath) =>
      createImportTrackingContext({
        partPath: nestedPartPath,
        replacements,
        diagnostics,
        knownLogicalIds,
      }),
  };

  return ctx;
}

/**
 * Convenience helper that wraps a recursive descent, ensuring `popParent`
 * runs even when the body throws. Used by the tracked-change translator
 * integration helpers.
 *
 * @template T
 * @param {ImportTrackingContext} ctx
 * @param {ParentFrame} frame
 * @param {() => T} body
 * @returns {T}
 */
export function withParentFrame(ctx, frame, body) {
  ctx.pushParent(frame);
  try {
    return body();
  } finally {
    ctx.popParent();
  }
}
