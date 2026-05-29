// @ts-check
import { v4 as uuidv4 } from 'uuid';

/**
 * @typedef {'paired' | 'independent'} TrackChangesReplacements
 * @typedef {{ type: string, author: string, date: string, internalId?: string }} TrackedChangeEntry
 * @typedef {{ beforeLastTrackedChange: TrackedChangeEntry | null, lastTrackedChange: TrackedChangeEntry | null, replacements: TrackChangesReplacements }} WalkContext
 */

const TRACKED_CHANGE_NAMES = new Set(['w:ins', 'w:del']);

/**
 * Non-content marker elements that can appear between the two halves of a Word
 * replacement without breaking the pairing. These are range/annotation markers
 * that carry no document content.
 *
 * Any element NOT in this set (e.g. w:r, w:hyperlink, w:sdt) is treated as
 * content and resets the pairing state so unrelated revisions in the same
 * paragraph are never falsely linked.
 */
const PAIRING_TRANSPARENT_NAMES = new Set([
  'w:commentRangeStart',
  'w:commentRangeEnd',
  'w:bookmarkStart',
  'w:bookmarkEnd',
  'w:proofErr',
  'w:permStart',
  'w:permEnd',
  'w:moveFromRangeStart',
  'w:moveFromRangeEnd',
  'w:moveToRangeStart',
  'w:moveToRangeEnd',
]);

/**
 * Two adjacent tracked changes form a Word replacement pair when they are
 * opposite types (delete vs insert) from the same author at the same timestamp.
 *
 * @param {TrackedChangeEntry} previous
 * @param {{ type: string, author: string, date: string }} current
 * @returns {boolean}
 */
function isReplacementPair(previous, current) {
  return previous.type !== current.type && previous.author === current.author && previous.date === current.date;
}

/**
 * @param {object} element
 * @returns {TrackedChangeEntry}
 */
function trackedChangeEntryFromElement(element) {
  return {
    type: element.name,
    author: element.attributes?.['w:author'] ?? '',
    date: element.attributes?.['w:date'] ?? '',
  };
}

/**
 * Returns the next sibling tracked-change element, skipping only non-content
 * markers. Content-bearing elements terminate the sibling check because they
 * break Word replacement adjacency.
 *
 * @param {Array} elements
 * @param {number} startIndex
 * @returns {TrackedChangeEntry | null}
 */
function findNextSiblingTrackedChange(elements, startIndex) {
  if (!Array.isArray(elements)) return null;

  for (let i = startIndex; i < elements.length; i += 1) {
    const element = elements[i];
    if (TRACKED_CHANGE_NAMES.has(element?.name)) {
      return trackedChangeEntryFromElement(element);
    }
    if (!PAIRING_TRANSPARENT_NAMES.has(element?.name)) {
      return null;
    }
  }

  return null;
}

/**
 * Word serializes a replacement selected inside another author's deletion as
 * child insertion/deletion sides surrounded by the parent deletion fragments.
 * In paired mode the generic adjacent-replacement heuristic would otherwise
 * collapse the child sides into one replacement. Keep them independent when
 * either side of the candidate pair touches a different-author deletion.
 *
 * @param {TrackedChangeEntry | null} beforePrevious
 * @param {TrackedChangeEntry} previous
 * @param {TrackedChangeEntry} current
 * @param {TrackedChangeEntry | null} next
 * @returns {boolean}
 */
function isChildReplacementInsideDeletion(beforePrevious, previous, current, next) {
  if (!isReplacementPair(previous, current)) return false;

  const touchesDifferentAuthorDeletionBefore =
    beforePrevious?.type === 'w:del' && beforePrevious.author !== previous.author;
  const touchesDifferentAuthorDeletionAfter = next?.type === 'w:del' && next.author !== previous.author;

  return touchesDifferentAuthorDeletionBefore || touchesDifferentAuthorDeletionAfter;
}

/**
 * Assigns an internal UUID to a tracked change element. In paired mode,
 * adjacent replacement halves (w:del + w:ins with matching author/date)
 * share the same UUID.
 *
 * @param {object} element  XML element (w:ins or w:del)
 * @param {Map<string, string>} idMap  Accumulates Word ID → internal UUID
 * @param {WalkContext} context  Mutable walk state for replacement pairing
 * @param {boolean} insideTrackedChange  Whether this element is nested in another tracked change
 * @param {TrackedChangeEntry | null} nextTrackedChange
 */
function assignInternalId(element, idMap, context, insideTrackedChange, nextTrackedChange = null) {
  const wordId = String(element.attributes?.['w:id'] ?? '');
  if (!wordId) return;

  // Nested tracked changes get their own UUID but are never paired.
  if (insideTrackedChange) {
    if (!idMap.has(wordId)) {
      idMap.set(wordId, uuidv4());
    }
    return;
  }

  const current = trackedChangeEntryFromElement(element);

  const shouldPair = context.replacements === 'paired';
  const shouldKeepChildSides =
    context.lastTrackedChange &&
    isChildReplacementInsideDeletion(
      context.beforeLastTrackedChange,
      context.lastTrackedChange,
      current,
      nextTrackedChange,
    );

  if (
    shouldPair &&
    context.lastTrackedChange &&
    !shouldKeepChildSides &&
    isReplacementPair(context.lastTrackedChange, current)
  ) {
    // Second half of a replacement — share the first half's UUID, but only
    // if this w:id hasn't already been mapped. A reused id that was already
    // part of an earlier pair must keep its original mapping.
    if (!idMap.has(wordId)) {
      idMap.set(wordId, context.lastTrackedChange.internalId);
    }
    context.lastTrackedChange = null;
    context.beforeLastTrackedChange = null;
  } else {
    // Reuse an existing mapping when the same w:id appears more than once
    // (Word reuses tracked-change ids across the document). Minting a fresh
    // UUID here would overwrite the earlier entry and break any replacement
    // pair that was already recorded for this id.
    const internalId = idMap.get(wordId) ?? uuidv4();
    idMap.set(wordId, internalId);
    context.beforeLastTrackedChange = context.lastTrackedChange;
    context.lastTrackedChange = { ...current, internalId };
  }
}

/**
 * Recursively walks XML elements, assigning internal UUIDs to every tracked
 * change and pairing adjacent replacements.
 *
 * @param {Array} elements
 * @param {Map<string, string>} idMap
 * @param {WalkContext} context
 * @param {boolean} [insideTrackedChange]
 */
function walkElements(elements, idMap, context, insideTrackedChange = false) {
  if (!Array.isArray(elements)) return;

  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index];
    if (TRACKED_CHANGE_NAMES.has(element.name)) {
      const nextTrackedChange = findNextSiblingTrackedChange(elements, index + 1);
      assignInternalId(element, idMap, context, insideTrackedChange, nextTrackedChange);

      if (element.elements) {
        // Descend with an isolated context so content inside a tracked change
        // cannot clear the outer replacement candidate. Inherit `replacements`
        // so nested changes honor the caller's choice if pairing ever applies.
        walkElements(
          element.elements,
          idMap,
          { beforeLastTrackedChange: null, lastTrackedChange: null, replacements: context.replacements },
          /* insideTrackedChange */ true,
        );
      }
    } else {
      // Content-bearing elements break replacement pairing. Only non-content
      // markers (comment/bookmark/permission ranges) are transparent.
      if (!PAIRING_TRANSPARENT_NAMES.has(element.name)) {
        context.lastTrackedChange = null;
        context.beforeLastTrackedChange = null;
      }

      if (element.elements) {
        walkElements(element.elements, idMap, context, insideTrackedChange);
      }
    }
  }
}

/**
 * Scan a single OOXML part and return a fresh `w:id → internal UUID` map.
 *
 * The scan assumes the top-level element is a document / hdr / ftr / footnotes
 * / endnotes root. Returns an empty map when the part is absent or malformed.
 *
 * @param {object | undefined} part Parsed OOXML part (from SuperConverter).
 * @param {{ replacements?: TrackChangesReplacements }} [options]
 * @returns {Map<string, string>}
 */
function buildTrackedChangeIdMapForPart(part, options = {}) {
  const root = part?.elements?.[0];
  if (!root?.elements) return new Map();

  const replacements = options.replacements === 'independent' ? 'independent' : 'paired';
  const idMap = new Map();
  walkElements(root.elements, idMap, { beforeLastTrackedChange: null, lastTrackedChange: null, replacements });
  return idMap;
}

/**
 * Builds a map from OOXML `w:id` values to stable internal UUIDs by scanning
 * `word/document.xml`.
 *
 * When `replacements` is `'paired'` (the default), Word tracked replacements
 * are detected as adjacent opposite-type changes with matching author and
 * date, and both halves map to the same internal UUID so the editor can
 * resolve them as one logical change. When `replacements` is `'independent'`,
 * each `w:id` maps to its own UUID — matching the ECMA-376 §17.13.5 model
 * where every `<w:ins>` and `<w:del>` is an independent revision.
 *
 * Must run before comment import so all consumers — translators, comment
 * helpers, and the tracked-change resolver — see a fully populated map.
 *
 * @param {object} docx  Parsed DOCX package
 * @param {{ replacements?: TrackChangesReplacements }} [options]
 * @returns {Map<string, string>}  Word `w:id` → internal UUID
 */
export function buildTrackedChangeIdMap(docx, options = {}) {
  return buildTrackedChangeIdMapForPart(docx?.['word/document.xml'], options);
}

/**
 * Builds per-part `w:id → internal UUID` maps for every revision-capable
 * content part in the DOCX package.
 *
 * Word revision IDs are not globally unique across parts, so each part keeps
 * its own isolated `w:id` namespace.
 *
 * @param {Record<string, object | undefined> | null | undefined} docx
 * @param {{ replacements?: TrackChangesReplacements }} [options]
 * @returns {Map<string, Map<string, string>>}
 */
export function buildTrackedChangeIdMapsByPart(docx, options = {}) {
  /** @type {Map<string, Map<string, string>>} */
  const mapsByPart = new Map();
  if (!docx || typeof docx !== 'object') return mapsByPart;

  /** @type {Record<string, object | undefined>} */
  const parts = /** @type {Record<string, object | undefined>} */ (docx);

  mapsByPart.set('word/document.xml', buildTrackedChangeIdMapForPart(parts['word/document.xml'], options));

  for (const partPath of Object.keys(parts)) {
    if (!/^word\/(?:header|footer)\d+\.xml$/.test(partPath)) continue;
    mapsByPart.set(partPath, buildTrackedChangeIdMapForPart(parts[partPath], options));
  }

  if (parts['word/footnotes.xml']) {
    mapsByPart.set('word/footnotes.xml', buildTrackedChangeIdMapForPart(parts['word/footnotes.xml'], options));
  }
  if (parts['word/endnotes.xml']) {
    mapsByPart.set('word/endnotes.xml', buildTrackedChangeIdMapForPart(parts['word/endnotes.xml'], options));
  }

  return mapsByPart;
}
