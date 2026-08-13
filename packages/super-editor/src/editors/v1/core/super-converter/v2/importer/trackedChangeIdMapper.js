// @ts-check
import { v4 as uuidv4 } from 'uuid';

/**
 * @typedef {'paired' | 'independent'} TrackChangesReplacements
 * @typedef {{
 *   type: string,
 *   author: string,
 *   date: string,
 *   internalId?: string,
 *   chained?: boolean,
 *   chainable?: boolean,
 * }} TrackedChangeEntry
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
 * Word frequently splits a single logical insertion/deletion into several
 * adjacent same-type `<w:ins>`/`<w:del>` XML elements purely because of run-
 * boundary mechanics (a formatting change, a `w:noBreakHyphen` atom starting a
 * new run, etc.) — Word's own UI still shows this as one revision. This is a
 * distinct concept from `isReplacementPair` (opposite-type pairing per
 * ECMA-376 §17.13.5) and is intentionally NOT gated by the `replacements`
 * ('paired' | 'independent') option: that option only governs whether Word
 * replacement halves are treated as one logical change or two independent
 * ones, a question that doesn't apply to a same-type run split.
 *
 * @param {TrackedChangeEntry} previous
 * @param {{ type: string, author: string, date: string }} current
 * @returns {boolean}
 */
function isSameTypeChainContinuation(previous, current) {
  return previous.type === current.type && previous.author === current.author && previous.date === current.date;
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

  const canPair =
    shouldPair &&
    context.lastTrackedChange &&
    // A chained tail (the 2nd+ link of a same-type chain) shares its whole
    // chain's id — pairing it into a NEW opposite-type replacement would
    // silently fuse every earlier same-type link into that replacement too.
    // Restrict pairing to a genuinely standalone previous element.
    !context.lastTrackedChange.chained &&
    !shouldKeepChildSides &&
    isReplacementPair(context.lastTrackedChange, current);

  const canChain =
    !canPair &&
    context.lastTrackedChange &&
    // Only a still-"chainable" previous link may be extended — see the
    // `!wasAlreadyMapped` note below for why a poisoned link clears this.
    context.lastTrackedChange.chainable !== false &&
    isSameTypeChainContinuation(context.lastTrackedChange, current) &&
    // A wordId that already has a mapping came from an unrelated, earlier
    // position in the document (Word reuses tracked-change ids). Chaining it
    // onto the live chain here would retroactively fuse that unrelated
    // earlier revision into this one — and, worse, propagate that borrowed
    // id forward onto later chain links via `context.lastTrackedChange`.
    !idMap.has(wordId);

  if (canPair) {
    // Second half of a replacement — share the first half's UUID, but only
    // if this w:id hasn't already been mapped. A reused id that was already
    // part of an earlier pair must keep its original mapping.
    if (!idMap.has(wordId)) {
      idMap.set(wordId, context.lastTrackedChange.internalId);
    }
    // A replacement pair is fully "consumed" by this match — the next
    // sibling starts a fresh candidate, unlike same-type chaining below.
    context.lastTrackedChange = null;
    context.beforeLastTrackedChange = null;
  } else if (canChain) {
    // Another link in the same-type chain — share the chain's UUID and keep
    // the chain alive (do NOT reset) so a 3rd, 4th, ... sibling can still
    // extend it.
    const internalId = context.lastTrackedChange.internalId;
    idMap.set(wordId, internalId);
    context.beforeLastTrackedChange = context.lastTrackedChange;
    context.lastTrackedChange = { ...current, internalId, chained: true, chainable: true };
  } else {
    // Reuse an existing mapping when the same w:id appears more than once
    // (Word reuses tracked-change ids across the document). Minting a fresh
    // UUID here would overwrite the earlier entry and break any replacement
    // pair that was already recorded for this id.
    const wasAlreadyMapped = idMap.has(wordId);
    const internalId = idMap.get(wordId) ?? uuidv4();
    idMap.set(wordId, internalId);
    context.beforeLastTrackedChange = context.lastTrackedChange;
    // A wordId that was already mapped elsewhere carries a borrowed,
    // possibly-unrelated identity — mark it non-chainable so it can't drag a
    // following same-type sibling onto that unrelated id (see `canChain`).
    context.lastTrackedChange = { ...current, internalId, chainable: !wasAlreadyMapped };
  }
}

/**
 * A paragraph break is itself a tracked change when its mark is recorded as
 * `<w:ins>`/`<w:del>` inside `w:pPr/w:rPr`. Returns that element, or null if
 * the paragraph's mark isn't tracked.
 *
 * @param {object} pElement  A `w:p` XML element
 * @returns {object | null}
 */
function getParagraphMarkTrackedChangeElement(pElement) {
  if (pElement?.name !== 'w:p') return null;
  const pPr = pElement.elements?.find((el) => el.name === 'w:pPr');
  const rPr = pPr?.elements?.find((el) => el.name === 'w:rPr');
  return rPr?.elements?.find((el) => TRACKED_CHANGE_NAMES.has(el.name)) ?? null;
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
    } else if (element.name === 'w:p' && !insideTrackedChange) {
      // A paragraph boundary normally breaks any live chain (below). But when
      // the paragraph break itself is a tracked change matching the live
      // chain (same type/author/date), Word treats it as a continuation, not
      // a break — nothing "final" separates the two sides. Bridge the chain
      // across the boundary instead of resetting.
      const paragraphMarkElement = getParagraphMarkTrackedChangeElement(element);
      const bridges =
        paragraphMarkElement &&
        context.lastTrackedChange &&
        isSameTypeChainContinuation(context.lastTrackedChange, trackedChangeEntryFromElement(paragraphMarkElement));

      if (!bridges) {
        context.lastTrackedChange = null;
        context.beforeLastTrackedChange = null;
        if (element.elements) walkElements(element.elements, idMap, context, insideTrackedChange);
      } else {
        const pPr = element.elements.find((el) => el.name === 'w:pPr');
        const rPr = pPr?.elements?.find((el) => el.name === 'w:rPr');

        // Fold the paragraph-mark revision into the live chain exactly like
        // an ordinary same-type sibling.
        assignInternalId(paragraphMarkElement, idMap, context, /* insideTrackedChange */ false, null);

        // Walk pPr's OTHER properties (numPr, jc, spacing, ...) and rPr's
        // other run properties in an isolated, throwaway context so they
        // cannot reset the now-bridged chain — mirrors the existing
        // nested-tracked-change isolation used when descending into a
        // w:ins/w:del's own children above.
        if (pPr?.elements) {
          const pPrRest = pPr.elements.filter((el) => el !== rPr);
          walkElements(
            pPrRest,
            idMap,
            { beforeLastTrackedChange: null, lastTrackedChange: null, replacements: context.replacements },
            insideTrackedChange,
          );
          if (rPr?.elements) {
            const rPrRest = rPr.elements.filter((el) => el !== paragraphMarkElement);
            walkElements(
              rPrRest,
              idMap,
              { beforeLastTrackedChange: null, lastTrackedChange: null, replacements: context.replacements },
              insideTrackedChange,
            );
          }
        }

        // Walk the paragraph body (everything except pPr) with the live,
        // now-bridged context so the paragraph's own runs continue the chain.
        const bodyElements = element.elements.filter((el) => el !== pPr);
        walkElements(bodyElements, idMap, context, insideTrackedChange);
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
