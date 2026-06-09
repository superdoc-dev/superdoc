// @ts-check
/**
 * Word revision id allocator for DOCX export.
 *
 * Word stores tracked-change revision ids (`w:id` on `<w:ins>`, `<w:del>`,
 * `<w:rPrChange>`) as decimal strings whose namespace is per-part: document,
 * each header, each footer, footnotes, and endnotes are independent. The
 * allocator preserves imported raw Word ids (carried on the SuperDoc mark as
 * `sourceId`) and mints fresh part-local decimal ids for native revisions and
 * successor fragments whose `sourceId` is empty or non-decimal.
 *
 * The allocator only assigns `w:id` values. It does NOT replace the internal
 * SuperDoc logical id (`id`, a UUID) — internal graph metadata stays on PM
 * marks; only the Word-native `w:id` attribute is decimal.
 *
 * Two phases:
 *   1) `reserveAll(allMarks)` walks every tracked mark and reserves every
 *      decimal `sourceId` value found.
 *   2) `allocate({ partPath, sourceId, logicalId })` returns the `w:id` to
 *      write into OOXML for a single mark. Same `logicalId` returns the same
 *      `w:id` within the same part, so paired replacement halves stay linked.
 *
 * @typedef {{
 *   reserve: (partPath: string, sourceId: string | number | null | undefined) => void,
 *   reserveAll: (entries: Iterable<{ partPath: string, sourceId: string | number | null | undefined }>) => void,
 *   allocate: (input: { partPath: string, sourceId?: string | number | null, logicalId?: string | null }) => string,
 *   isDecimal: (value: unknown) => boolean,
 *   getSourceIdMap: () => Record<string, Record<string, string>>,
 *   __snapshot: () => Record<string, { reservedDecimal: number[], nextDecimal: number }>,
 * }} WordIdAllocator
 *
 * @typedef {{
 *   reservedDecimal: Set<number>,
 *   nextDecimal: number,
 *   assignedByLogicalId: Map<string, number>,
 *   sourceIdByWordId: Map<string, string>,
 * }} PartWordIdState
 */

const DECIMAL = /^\d+$/;

export const TRACKED_CHANGE_SOURCE_ID_MAP_PROPERTY = 'SuperdocTrackedChangeSourceIds';

/**
 * Returns true when the given value, after coercion to a trimmed string, is
 * a base-10 integer Word would accept as `w:id`.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isDecimalWordId(value) {
  if (value == null) return false;
  const str = String(value).trim();
  if (!str) return false;
  return DECIMAL.test(str);
}

/**
 * @returns {WordIdAllocator}
 */
export function createWordIdAllocator() {
  /** @type {Map<string, PartWordIdState>} */
  const stateByPart = new Map();

  /**
   * @param {string} partPath
   * @returns {PartWordIdState}
   */
  const ensureState = (partPath) => {
    const key = typeof partPath === 'string' && partPath.length > 0 ? partPath : 'word/document.xml';
    let state = stateByPart.get(key);
    if (!state) {
      state = {
        reservedDecimal: new Set(),
        nextDecimal: 1,
        assignedByLogicalId: new Map(),
        sourceIdByWordId: new Map(),
      };
      stateByPart.set(key, state);
    }
    return state;
  };

  /**
   * @param {PartWordIdState} state
   * @param {string | number | null | undefined} sourceId
   * @param {number} wordId
   */
  const recordSourceIdRewrite = (state, sourceId, wordId) => {
    if (sourceId == null) return;
    const source = String(sourceId).trim();
    if (!source || isDecimalWordId(source)) return;
    state.sourceIdByWordId.set(String(wordId), source);
  };

  /** @type {WordIdAllocator['reserve']} */
  const reserve = (partPath, sourceId) => {
    if (!isDecimalWordId(sourceId)) return;
    const state = ensureState(partPath);
    const n = Number(String(sourceId).trim());
    if (!Number.isFinite(n) || n < 0) return;
    state.reservedDecimal.add(n);
  };

  /** @type {WordIdAllocator['reserveAll']} */
  const reserveAll = (entries) => {
    if (!entries) return;
    for (const entry of entries) {
      reserve(entry?.partPath, entry?.sourceId);
    }
  };

  /** @type {WordIdAllocator['allocate']} */
  const allocate = ({ partPath, sourceId, logicalId }) => {
    const state = ensureState(partPath);

    // Preserve imported decimal w:id values verbatim. Word reuses tracked-
    // change ids across the document, so we trust the imported value over
    // any allocator state.
    if (isDecimalWordId(sourceId)) {
      const asString = String(sourceId).trim();
      const n = Number(asString);
      state.reservedDecimal.add(n);
      if (logicalId) state.assignedByLogicalId.set(logicalId, n);
      return asString;
    }

    // Repeat hits for the same logical id within the same part share the
    // newly-minted id. Paired replacement halves carry the same logical id
    // so both sides emit the same `w:id` on export, matching Word's pairing
    // convention.
    if (logicalId && state.assignedByLogicalId.has(logicalId)) {
      const assigned = state.assignedByLogicalId.get(logicalId);
      if (typeof assigned === 'number') {
        recordSourceIdRewrite(state, sourceId, assigned);
        return String(assigned);
      }
    }

    let n = state.nextDecimal;
    while (state.reservedDecimal.has(n)) n++;
    state.reservedDecimal.add(n);
    state.nextDecimal = n + 1;
    if (logicalId) state.assignedByLogicalId.set(logicalId, n);
    recordSourceIdRewrite(state, sourceId, n);
    return String(n);
  };

  const getSourceIdMap = () => {
    /** @type {Record<string, Record<string, string>>} */
    const out = {};
    for (const [part, state] of stateByPart.entries()) {
      if (state.sourceIdByWordId.size === 0) continue;
      out[part] = Object.fromEntries([...state.sourceIdByWordId.entries()].sort(([a], [b]) => a.localeCompare(b)));
    }
    return out;
  };

  const __snapshot = () => {
    /** @type {Record<string, { reservedDecimal: number[], nextDecimal: number }>} */
    const out = {};
    for (const [part, state] of stateByPart.entries()) {
      out[part] = {
        reservedDecimal: [...state.reservedDecimal].sort((a, b) => a - b),
        nextDecimal: state.nextDecimal,
      };
    }
    return out;
  };

  return {
    reserve,
    reserveAll,
    allocate,
    isDecimal: isDecimalWordId,
    getSourceIdMap,
    __snapshot,
  };
}
