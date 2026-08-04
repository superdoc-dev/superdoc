/**
 * Allocate the OOXML `w:id` for a tracked revision on export.
 *
 * Word revision ids are decimal and per-part, but internally a revision is
 * keyed by a logical UUID. The allocator maps one to the other and, because
 * the same `logicalId` always yields the same `w:id` within a part, every
 * carrier of one revision — a run `<w:del>`, the paired `<w:ins>` of a
 * replacement, the deleted paragraph MARK in `w:pPr/w:rPr` — exports under a
 * single id and Word reads them as one change.
 *
 * Writing the internal UUID straight into `w:id` instead would be out of
 * schema (ST_DecimalNumber) and would split one deletion into several
 * revisions.
 *
 * Falls back to the raw source/logical id when no allocator is bound, which is
 * what the pre-allocator round-trip path relied on.
 *
 * @param {any} params  Decoder params; carries `converter.wordIdAllocator` and the part path.
 * @param {any} attrs   Tracked attrs: `{ id: logicalId, sourceId }`.
 * @returns {string}
 */
export function resolveExportWordId(params, attrs) {
  const sourceId = attrs?.sourceId;
  /** @type {string | number | null | undefined} */
  let exportSourceId;
  if (typeof sourceId === 'string' || typeof sourceId === 'number') {
    exportSourceId = sourceId;
  } else if (sourceId === null) {
    exportSourceId = null;
  } else if (sourceId === undefined) {
    exportSourceId = undefined;
  } else {
    exportSourceId = String(sourceId);
  }
  const logicalId = typeof attrs?.id === 'string' ? attrs.id : '';
  const exportParams =
    /** @type {import('@translator').SCDecoderConfig & { converter?: { wordIdAllocator?: import('@extensions/track-changes/review-model/word-id-allocator.js').WordIdAllocator | null }, currentPartPath?: string, filename?: string }} */ (
      params
    );
  const allocator = exportParams?.converter?.wordIdAllocator;
  const partPath =
    exportParams?.currentPartPath ||
    (typeof exportParams?.filename === 'string' && exportParams.filename.length > 0
      ? `word/${exportParams.filename}`
      : 'word/document.xml');
  if (allocator) {
    return allocator.allocate({ partPath, sourceId: exportSourceId, logicalId });
  }
  return /** @type {string} */ (sourceId || logicalId);
}
