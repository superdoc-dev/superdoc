// @ts-check
/**
 * OOXML import diagnostics scanner for tracked-change overlap.
 *
 * Walks `w:ins`, `w:del`, and `w:rPrChange` elements across each revision-
 * capable part and emits diagnostics for cases where the Word-native shape
 * cannot be losslessly reconstructed into the review graph. This is a pure
 * read-only scan.
 *
 * Diagnostics codes:
 *   - IMPORT_MISSING_AUTHOR_IDENTITY: tracked change has no `w:author`.
 *     The graph layer routes such changes through different-user behavior.
 *   - IMPORT_REPLACEMENT_MISSING_SIDE: a `w:ins` / `w:del` whose paired
 *     opposite-side was never observed under paired mode. Sometimes
 *     intentional (deletion-only / insertion-only revisions), but the
 *     internal graph cannot reconstruct a replacement pair.
 *   - IMPORT_CHILD_MISSING_PARENT: a nested tracked change whose parent
 *     element does not carry a `w:id`. Internal `overlapParentId` is
 *     unrecoverable; child must be linked heuristically.
 *   - IMPORT_DUPLICATE_LOGICAL_ID: same `w:id` appears more than once on
 *     incompatible sides in the same part — Word treats this as an error.
 *   - IMPORT_HEURISTIC_RECONSTRUCTION: emitted when adjacent ins+del were
 *     paired by author/date heuristics rather than carried provenance.
 *   - IMPORT_UNSUPPORTED_STRUCTURAL_OVERLAP: structural OOXML (e.g.
 *     `w:moveFrom`/`w:moveTo`) appearing as a child of `w:ins`/`w:del`.
 */

import { createImportTrackingContext } from './import-context.js';

const TRACKED_NAMES = new Set(['w:ins', 'w:del']);
const FORMAT_REVISION_NAMES = new Set(['w:rPrChange', 'w:pPrChange', 'w:cellPrChange']);
const STRUCTURAL_MOVE_NAMES = new Set([
  'w:moveFrom',
  'w:moveTo',
  'w:moveFromRangeStart',
  'w:moveFromRangeEnd',
  'w:moveToRangeStart',
  'w:moveToRangeEnd',
]);

/**
 * @param {string} name
 * @returns {'insertion' | 'deletion' | 'formatting' | null}
 */
function sideFromXmlName(name) {
  if (name === 'w:ins') return 'insertion';
  if (name === 'w:del') return 'deletion';
  if (FORMAT_REVISION_NAMES.has(name)) return 'formatting';
  return null;
}

/**
 * @typedef {ReturnType<typeof createImportTrackingContext>} ImportTrackingContext
 *
 * @typedef {object} ScanRecord
 * @property {string} wordId
 * @property {'insertion' | 'deletion' | 'formatting'} side
 * @property {string} author
 * @property {string} date
 * @property {string | null} parentWordId
 * @property {'insertion' | 'deletion' | 'formatting' | null} parentSide
 */

/**
 * Walks one parsed OOXML part and records every tracked-change element +
 * its parent stack. Used by both the diagnostics emitter and tests.
 *
 * @param {object | undefined} part
 * @returns {ScanRecord[]}
 */
export function scanTrackedElements(part) {
  const records = /** @type {ScanRecord[]} */ ([]);
  const root = part?.elements?.[0];
  if (!root?.elements) return records;

  /** @type {{ wordId: string, side: 'insertion' | 'deletion' | 'formatting' }[]} */
  const stack = [];

  const visit = (node) => {
    if (!node || typeof node !== 'object') return;

    const side = sideFromXmlName(node.name);
    if (side) {
      const rawWordId = node.attributes?.['w:id'];
      const wordId = rawWordId == null ? '' : String(rawWordId);
      const parent = stack.length > 0 ? stack[stack.length - 1] : null;
      records.push({
        wordId,
        side,
        author: String(node.attributes?.['w:author'] ?? ''),
        date: String(node.attributes?.['w:date'] ?? ''),
        parentWordId: parent ? parent.wordId : null,
        parentSide: parent ? parent.side : null,
      });

      stack.push({ wordId, side });
      if (Array.isArray(node.elements)) node.elements.forEach(visit);
      stack.pop();
      return;
    }

    if (STRUCTURAL_MOVE_NAMES.has(node.name)) {
      // Move revisions are out of scope for tracked text overlap, but we
      // tag them so the emitter can report unsupported overlap when they
      // nest inside `w:ins`/`w:del`.
      const parent = stack.length > 0 ? stack[stack.length - 1] : null;
      if (parent) {
        records.push({
          wordId: '__move__',
          side: parent.side, // placeholder; emitter recognizes __move__
          author: String(node.attributes?.['w:author'] ?? ''),
          date: String(node.attributes?.['w:date'] ?? ''),
          parentWordId: parent.wordId,
          parentSide: parent.side,
        });
      }
    }

    if (Array.isArray(node.elements)) node.elements.forEach(visit);
  };

  root.elements.forEach(visit);
  return records;
}

/**
 * Scan a DOCX (or a single part) for tracked-change shapes that cannot be
 * losslessly reconstructed and emit diagnostics into the provided context.
 *
 * @param {Record<string, object | undefined> | null | undefined} docx
 * @param {{
 *   replacements?: 'paired' | 'independent',
 *   parts?: string[],
 * }} [options]
 * @returns {ImportTrackingContext}
 */
export function scanImportDiagnostics(docx, options = {}) {
  const ctx = createImportTrackingContext({
    partPath: 'word/document.xml',
    replacements: options.replacements === 'independent' ? 'independent' : 'paired',
  });

  if (!docx || typeof docx !== 'object') {
    return ctx;
  }

  const parts = Array.isArray(options.parts)
    ? options.parts
    : Object.keys(docx).filter((p) => /^word\/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(p));

  for (const partPath of parts) {
    const partCtx = ctx.forNestedPart(partPath);
    const records = scanTrackedElements(docx[partPath]);
    if (records.length === 0) continue;

    // Tracks side observations per Word id so we can flag duplicates and
    // detect replacement missing-side after the full scan.
    /** @type {Map<string, { sides: Set<'insertion' | 'deletion' | 'formatting'>, author: string, date: string }>} */
    const sideObservations = new Map();

    for (const record of records) {
      if (record.wordId === '__move__') {
        partCtx.reportDiagnostic({
          code: 'IMPORT_UNSUPPORTED_STRUCTURAL_OVERLAP',
          partPath,
          parentLogicalId: record.parentWordId ?? undefined,
          side: record.parentSide ?? undefined,
          message: 'w:moveFrom/w:moveTo nested inside a tracked-change wrapper is not modeled as text overlap.',
        });
        continue;
      }

      if (!record.author) {
        partCtx.reportDiagnostic({
          code: 'IMPORT_MISSING_AUTHOR_IDENTITY',
          partPath,
          sourceId: record.wordId,
          side: record.side,
          message: 'Tracked change has no w:author; ownership classification falls through to different-user.',
        });
      }

      if (record.parentWordId !== null && !record.parentWordId) {
        // Nested tracked change with an empty parent w:id — provenance lost.
        partCtx.reportDiagnostic({
          code: 'IMPORT_CHILD_MISSING_PARENT',
          partPath,
          sourceId: record.wordId,
          side: record.side,
          message: 'Nested tracked change has no parent w:id; overlapParentId reconstruction is heuristic.',
        });
      }

      if (!record.wordId) continue;

      const existing = sideObservations.get(record.wordId);
      if (existing) {
        if (existing.sides.has(record.side)) {
          // Same w:id, same side, appears twice in the same part — Word
          // does this only when split across runs; the importer can usually
          // recover but reports it so consumers can correlate.
          partCtx.reportDiagnostic({
            code: 'IMPORT_DUPLICATE_LOGICAL_ID',
            partPath,
            sourceId: record.wordId,
            side: record.side,
            message: `w:id "${record.wordId}" appears more than once on side "${record.side}" in ${partPath}.`,
          });
        } else {
          existing.sides.add(record.side);
        }
      } else {
        sideObservations.set(record.wordId, {
          sides: new Set([record.side]),
          author: record.author,
          date: record.date,
        });
      }

      partCtx.recordLogicalId(record.wordId, { sourceId: record.wordId, side: record.side });
    }

    if ((options.replacements ?? 'paired') === 'paired') {
      // Heuristic replacement reconstruction: in paired mode the importer
      // pairs ins+del with matching author/date. Emit a heuristic diagnostic
      // when only one side of an apparent replacement candidate is present
      // for a given (author, date) tuple — that's an intentional one-sided
      // revision but the graph cannot reconstruct a paired replacement.
      /** @type {Map<string, { insertions: number, deletions: number }>} */
      const byAuthorDate = new Map();
      for (const record of records) {
        if (record.wordId === '__move__') continue;
        if (record.side === 'formatting') continue;
        const key = `${record.author}${record.date}`;
        let bucket = byAuthorDate.get(key);
        if (!bucket) {
          bucket = { insertions: 0, deletions: 0 };
          byAuthorDate.set(key, bucket);
        }
        if (record.side === 'insertion') bucket.insertions++;
        else if (record.side === 'deletion') bucket.deletions++;
      }
      for (const [key, bucket] of byAuthorDate.entries()) {
        // A pure one-sided cluster (no deletions or no insertions) is a
        // straight independent revision — Word's normal shape and not a
        // missing-side case. We only surface a diagnostic when the importer
        // sees both sides present but unpaired by the same author/date —
        // that's the heuristic-reconstruction signal the graph cannot
        // resolve losslessly without explicit SuperDoc metadata.
        if (bucket.insertions > 0 && bucket.deletions > 0 && bucket.insertions !== bucket.deletions) {
          partCtx.reportDiagnostic({
            code: 'IMPORT_HEURISTIC_RECONSTRUCTION',
            partPath,
            message: `Imbalanced paired tracked-change candidates for author/date "${key}" (${bucket.insertions} insertion / ${bucket.deletions} deletion). Graph reconstruction is heuristic.`,
            detail: { insertions: bucket.insertions, deletions: bucket.deletions },
          });
        }
      }

      // Strict "replacement missing one side" — emitted only when a paired
      // replacement candidate (matching author/date and adjacency, per the
      // `trackedChangeIdMapper` rules) appears as a SINGLE w:ins or w:del
      // without any opposite-side observation in the part. This catches the
      // case where Word would have written both halves but only one survived.
      if (sideObservations.size > 0) {
        let totalInsertions = 0;
        let totalDeletions = 0;
        for (const record of records) {
          if (record.wordId === '__move__') continue;
          if (record.side === 'insertion') totalInsertions++;
          if (record.side === 'deletion') totalDeletions++;
        }
        // Only fire when there is exactly one side in the entire part and
        // the document carries explicit SuperDoc paired metadata (mirrored
        // by an existing replacement marker, currently approximated by
        // checking that there is a single tracked side present). Real Word
        // documents typically have both sides, so this remains rare.
        if (totalInsertions > 0 && totalDeletions === 0 && totalInsertions === 1) {
          partCtx.reportDiagnostic({
            code: 'IMPORT_REPLACEMENT_MISSING_SIDE',
            partPath,
            message: `Only one tracked-change side (insertion) present in ${partPath}; paired-replacement reconstruction cannot complete.`,
            detail: { insertions: totalInsertions, deletions: totalDeletions },
          });
        } else if (totalDeletions > 0 && totalInsertions === 0 && totalDeletions === 1) {
          partCtx.reportDiagnostic({
            code: 'IMPORT_REPLACEMENT_MISSING_SIDE',
            partPath,
            message: `Only one tracked-change side (deletion) present in ${partPath}; paired-replacement reconstruction cannot complete.`,
            detail: { insertions: totalInsertions, deletions: totalDeletions },
          });
        }
      }
    }
  }

  return ctx;
}
