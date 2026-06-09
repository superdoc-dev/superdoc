// @ts-check
import { createImportTrackingContext, withParentFrame } from '@extensions/track-changes/review-model/import-context.js';

const contextsByConverter = new WeakMap();

/**
 * @typedef {{
 *   trackedChangeIdMapsByPart?: Map<string, Map<string, string>>,
 *   trackedChangeIdMap?: Map<string, string>,
 *   trackedChangeSourceIdMapByPart?: Map<string, Map<string, string>>,
 *   trackedChangesOptions?: { replacements?: 'paired' | 'independent' },
 * }} ConverterLike
 *
 * @typedef {Record<string, unknown> & {
 *   converter?: ConverterLike,
 *   currentPartPath?: string,
 *   filename?: string,
 *   importTrackingContext?: import('@extensions/track-changes/review-model/import-context.js').ImportTrackingContext,
 * }} ImportTrackingParams
 */

/**
 * @param {ImportTrackingParams} [params]
 * @returns {string}
 */
export function resolveTrackedChangePartPath(params = {}) {
  const currentPartPath = params.currentPartPath;
  if (typeof currentPartPath === 'string' && currentPartPath.length > 0) return currentPartPath;

  const filename = params.filename;
  if (typeof filename === 'string' && filename.length > 0) {
    return filename.startsWith('word/') ? filename : `word/${filename}`;
  }

  return 'word/document.xml';
}

/**
 * @param {ImportTrackingParams} [params]
 * @param {string} [partPath]
 */
export function getTrackedChangeIdMapForPart(params = {}, partPath = resolveTrackedChangePartPath(params)) {
  const converter = params.converter;
  if (!converter || typeof converter !== 'object') return null;

  const mapsByPart = converter.trackedChangeIdMapsByPart;
  return mapsByPart?.get?.(partPath) ?? converter.trackedChangeIdMap ?? null;
}

/**
 * @param {ImportTrackingParams} [params]
 * @param {string} [partPath]
 * @param {string} [wordId]
 */
function getTrackedChangeSourceIdForPart(params = {}, partPath = resolveTrackedChangePartPath(params), wordId = '') {
  const converter = params.converter;
  if (!converter || typeof converter !== 'object') return null;

  const sourceIdsByPart = converter.trackedChangeSourceIdMapByPart;
  const restored = sourceIdsByPart?.get?.(partPath)?.get?.(wordId);
  return typeof restored === 'string' && restored.length > 0 ? restored : null;
}

/**
 * @param {ImportTrackingParams} [params]
 * @param {string} sourceId
 * @returns {{ partPath: string, sourceId: string, logicalId: string }}
 */
export function resolveTrackedChangeImportIds(params = {}, sourceId = '') {
  const partPath = resolveTrackedChangePartPath(params);
  const id = typeof sourceId === 'string' ? sourceId : String(sourceId || '');
  const restoredSourceId = getTrackedChangeSourceIdForPart(params, partPath, id) ?? id;
  const trackedChangeIdMap = getTrackedChangeIdMapForPart(params, partPath);
  return {
    partPath,
    sourceId: restoredSourceId,
    logicalId: id && trackedChangeIdMap?.has(id) ? (trackedChangeIdMap.get(id) ?? id) : id,
  };
}

/**
 * @param {ImportTrackingParams} [params]
 * @param {string} [partPath]
 * @returns {import('@extensions/track-changes/review-model/import-context.js').ImportTrackingContext | null}
 */
export function getOrCreateImportTrackingContext(params = {}, partPath = resolveTrackedChangePartPath(params)) {
  const supplied = params.importTrackingContext;
  if (supplied?.forNestedPart) {
    return supplied.partPath === partPath ? supplied : supplied.forNestedPart(partPath);
  }

  const converter = params.converter;
  const trackedChangesOptions =
    converter && typeof converter === 'object' && converter.trackedChangesOptions
      ? converter.trackedChangesOptions
      : null;

  if (!converter || typeof converter !== 'object') {
    return createImportTrackingContext({
      partPath,
      replacements: trackedChangesOptions?.replacements ?? 'paired',
    });
  }

  let contextsByPart = contextsByConverter.get(converter);
  if (!contextsByPart) {
    contextsByPart = new Map();
    contextsByConverter.set(converter, contextsByPart);
  }

  let context = contextsByPart.get(partPath);
  if (!context) {
    context = createImportTrackingContext({
      partPath,
      replacements: trackedChangesOptions?.replacements ?? 'paired',
    });
    contextsByPart.set(partPath, context);
  }

  return context;
}

/**
 * @param {{
 *   params?: ImportTrackingParams,
 *   attrs: Record<string, unknown>,
 *   side: 'insertion' | 'deletion' | 'formatting',
 *   sourceId?: string,
 *   partPath?: string,
 * }} input
 * @returns {{ context: import('@extensions/track-changes/review-model/import-context.js').ImportTrackingContext | null, frame: import('@extensions/track-changes/review-model/import-context.js').ParentFrame | null }}
 */
export function stampImportTrackingAttrs(input) {
  const { params = {}, attrs, side, sourceId = '', partPath = resolveTrackedChangePartPath(params) } = input;
  const context = getOrCreateImportTrackingContext(params, partPath);
  if (!context) {
    return { context: null, frame: null };
  }

  const logicalId = typeof attrs.id === 'string' ? attrs.id : String(attrs.id || '');
  const parent = context.currentParent();
  if (parent?.logicalId) {
    attrs.overlapParentId = parent.logicalId;
  }
  if (logicalId) {
    context.recordLogicalId(logicalId, { sourceId, side });
  }

  return {
    context,
    frame: logicalId
      ? {
          logicalId,
          side,
          sourceId,
          author: typeof attrs.author === 'string' ? attrs.author : '',
          date: typeof attrs.date === 'string' ? attrs.date : '',
        }
      : null,
  };
}

export { withParentFrame };
