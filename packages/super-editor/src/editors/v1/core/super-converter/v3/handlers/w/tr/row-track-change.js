// @ts-check
import {
  resolveTrackedChangeImportIds,
  stampImportTrackingAttrs,
} from '../../../../v2/importer/importTrackingContext.js';

/**
 * Read a structural tracked-change revision from a row's `<w:trPr>`.
 *
 * A whole inserted/deleted table is encoded in OOXML as `<w:ins>` / `<w:del>`
 * inside each row's `<w:trPr>` (ECMA-376 §17.13.5.16 / §17.13.5.13). Unlike
 * inline text revisions, the marker carries no content — the `<w:trPr>` wrapper
 * alone conveys that the row was inserted or deleted.
 *
 * The id is normalized through the same import context as inline `w:ins`/`w:del`
 * so a structural revision pairs correctly with its source `w:id` on export.
 *
 * @param {{ name: string, elements?: Array<{ name: string, attributes?: Record<string, string> }> }} [trPr] - The parsed `w:trPr` element.
 * @param {import('@translator').SCEncoderConfig} [params] - Encoder params (carries the import tracking context).
 * @returns {import('@extensions/table-row/table-row.js').TableRowTrackChange | null}
 */
export function readRowTrackChange(trPr, params = /** @type {any} */ ({})) {
  const marker = trPr?.elements?.find((el) => el.name === 'w:ins' || el.name === 'w:del');
  if (!marker) return null;

  const side = marker.name === 'w:ins' ? 'insertion' : 'deletion';
  const attributes = marker.attributes || {};

  const { sourceId, logicalId } = resolveTrackedChangeImportIds(params, attributes['w:id']);

  /** @type {import('@extensions/table-row/table-row.js').TableRowTrackChange} */
  const trackChange = {
    type: side === 'insertion' ? 'rowInsert' : 'rowDelete',
    id: logicalId,
    sourceId,
    author: attributes['w:author'] || '',
    authorEmail: attributes['w:authorEmail'] || '',
    date: attributes['w:date'] || '',
    importedAuthor: `${attributes['w:author'] || ''} (imported)`,
  };

  // Register the logical id with the import context so structural revisions
  // share the same id space as inline text revisions.
  stampImportTrackingAttrs({ params, attrs: trackChange, side, sourceId });

  return trackChange;
}

/**
 * Reconstruct the `<w:ins>` / `<w:del>` revision marker for `<w:trPr>` on export
 * from a row's `trackChange` attr. The `w:id` is mapped back through the export
 * id resolver so the structural revision pairs with its source `w:id`, matching
 * inline `w:ins`/`w:del` round-trip behavior.
 *
 * @param {import('@extensions/table-row/table-row.js').TableRowTrackChange | null | undefined} trackChange
 * @param {import('@translator').SCDecoderConfig} [params] - Decoder params (carries the export id allocator).
 * @returns {{ name: 'w:ins' | 'w:del', attributes: Record<string, string> } | null}
 */
export function buildRowTrackChangeElement(trackChange, params = /** @type {any} */ ({})) {
  if (!trackChange || (trackChange.type !== 'rowInsert' && trackChange.type !== 'rowDelete')) {
    return null;
  }

  const name = trackChange.type === 'rowInsert' ? 'w:ins' : 'w:del';
  const wId = resolveExportRowWordId(params, trackChange);

  /** @type {Record<string, string>} */
  const attributes = { 'w:id': wId };
  if (trackChange.author) attributes['w:author'] = trackChange.author;
  if (trackChange.authorEmail) attributes['w:authorEmail'] = trackChange.authorEmail;
  if (trackChange.date) attributes['w:date'] = trackChange.date;

  return { name, attributes };
}

/**
 * Resolve the `w:id` to write for a structural row revision. Mirrors the inline
 * `ins`/`del` translators: uses the converter's Word revision id allocator when
 * installed, else falls back to `sourceId || id`.
 *
 * @param {import('@translator').SCDecoderConfig} params
 * @param {import('@extensions/table-row/table-row.js').TableRowTrackChange} trackChange
 * @returns {string}
 */
function resolveExportRowWordId(params, trackChange) {
  const sourceId = trackChange.sourceId;
  const logicalId = typeof trackChange.id === 'string' ? trackChange.id : '';
  const exportParams = /** @type {any} */ (params);
  const allocator = exportParams?.converter?.wordIdAllocator;
  const partPath =
    exportParams?.currentPartPath ||
    (typeof exportParams?.filename === 'string' && exportParams.filename.length > 0
      ? `word/${exportParams.filename}`
      : 'word/document.xml');
  if (allocator) {
    return allocator.allocate({
      partPath,
      sourceId: sourceId === undefined ? undefined : sourceId === null ? null : String(sourceId),
      logicalId,
    });
  }
  return String(sourceId || logicalId || '');
}
