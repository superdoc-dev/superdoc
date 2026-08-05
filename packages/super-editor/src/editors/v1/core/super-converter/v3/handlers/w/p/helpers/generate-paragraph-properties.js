import { carbonCopy } from '@core/utilities/carbonCopy.js';
import { translator as wPPrNodeTranslator } from '../../pPr/pPr-translator.js';
import { createParagraphSplitInsertionElement, isParagraphSplitTrackFormatMark } from '../../../helpers.js';
import { resolveExportWordId } from '@converter/v3/handlers/helpers/resolve-export-word-id.js';

function resolveExportPartPath(params = {}) {
  if (typeof params.currentPartPath === 'string' && params.currentPartPath.length > 0) return params.currentPartPath;
  if (typeof params.filename === 'string' && params.filename.length > 0) {
    return params.filename.startsWith('word/') ? params.filename : `word/${params.filename}`;
  }
  return 'word/document.xml';
}

function findParagraphSplitTrackFormatMark(node) {
  if (!node || typeof node !== 'object') return null;

  const marks = Array.isArray(node.marks) ? node.marks : [];
  const directMark = marks.find((mark) => isParagraphSplitTrackFormatMark(mark));
  if (directMark) return directMark;

  if (typeof node.descendants === 'function') {
    let found = null;
    node.descendants((child) => {
      // A paragraph-split mark is sticky: once a descendant carries it, keep it.
      // descendants() still visits later siblings, so a later unmarked child must
      // not clear a mark already discovered on an earlier child.
      if (found) return false;
      const childMarks = Array.isArray(child?.marks) ? child.marks : [];
      const match = childMarks.find((mark) => isParagraphSplitTrackFormatMark(mark));
      if (match) found = match;
      return !found;
    });
    if (found) return found;
  }

  const content = Array.isArray(node.content) ? node.content : [];
  for (const child of content) {
    const childMark = findParagraphSplitTrackFormatMark(child);
    if (childMark) return childMark;
  }

  return null;
}

function ensureParagraphPropertiesNode(pPr) {
  return (
    pPr || {
      type: 'element',
      name: 'w:pPr',
      elements: [],
    }
  );
}

function insertRunPropertiesInOrder(pPr, runProperties) {
  // Per CT_PPr, the paragraph-mark <w:rPr> comes after normal paragraph-level
  // properties and before any terminal <w:sectPr> / <w:pPrChange>. Inserting at
  // the front produces invalid ordering when the paragraph already has
  // properties such as <w:pStyle>, <w:spacing>, or <w:jc>.
  const terminalIdx = pPr.elements.findIndex(
    (element) => element?.name === 'w:sectPr' || element?.name === 'w:pPrChange',
  );
  if (terminalIdx === -1) {
    pPr.elements.push(runProperties);
  } else {
    pPr.elements.splice(terminalIdx, 0, runProperties);
  }
}

/**
 * Write the paragraph MARK's tracked deletion into `w:pPr/w:rPr` as `<w:del>`
 * (ECMA-376 §17.13.5.14). A whole-block tracked deletion marks the runs
 * AND the paragraph mark; without this half Word reopens the file seeing only
 * struck text, and accepting leaves the empty numbered item behind.
 *
 * @param {object} pPr
 * @param {{ id?: string, sourceId?: string, author?: string, authorEmail?: string, date?: string }} markTrackChange
 * @param {string} [wordId] Allocated OOXML `w:id`; falls back to the source/internal id.
 * @returns {object} the same pPr, with the mark deletion recorded
 */
function appendParagraphMarkDeletion(pPr, markTrackChange, wordId) {
  if (!pPr || !markTrackChange) return pPr;
  if (!Array.isArray(pPr.elements)) pPr.elements = [];
  const existingRunProperties = pPr.elements.find((element) => element?.name === 'w:rPr');
  const runProperties = existingRunProperties || { type: 'element', name: 'w:rPr', elements: [] };
  if (!Array.isArray(runProperties.elements)) runProperties.elements = [];
  if (runProperties.elements.some((element) => element?.name === 'w:del')) return pPr;

  /** @type {Record<string, string>} */
  const attributes = { 'w:id': String(wordId ?? markTrackChange.sourceId ?? markTrackChange.id ?? '') };
  if (markTrackChange.author) attributes['w:author'] = markTrackChange.author;
  if (markTrackChange.authorEmail) attributes['w:authorEmail'] = markTrackChange.authorEmail;
  if (markTrackChange.date) attributes['w:date'] = markTrackChange.date;
  runProperties.elements.push({ type: 'element', name: 'w:del', attributes });

  if (!existingRunProperties) insertRunPropertiesInOrder(pPr, runProperties);
  return pPr;
}

function prependParagraphSplitInsertion(pPr, insertionElement) {
  if (!pPr || !insertionElement) return pPr;
  if (!Array.isArray(pPr.elements)) pPr.elements = [];
  const existingRunProperties = pPr.elements.find((element) => element?.name === 'w:rPr');
  const runProperties = existingRunProperties || {
    type: 'element',
    name: 'w:rPr',
    elements: [],
  };
  if (!Array.isArray(runProperties.elements)) runProperties.elements = [];
  const hasParagraphInsertion = runProperties.elements.some((element) => element?.name === 'w:ins');
  if (!hasParagraphInsertion) runProperties.elements.unshift(insertionElement);
  // Keep an existing <w:rPr> in place; only insert a freshly-created one in order.
  if (!existingRunProperties) insertRunPropertiesInOrder(pPr, runProperties);
  return pPr;
}

/**
 * Generate the w:pPr props for a paragraph node
 *
 * @param {SchemaNode} node
 * @returns {XmlReadyNode} The paragraph properties node
 */
export function generateParagraphProperties(params) {
  const { node } = params;
  const { attrs = {} } = node;

  const paragraphProperties = carbonCopy(attrs.paragraphProperties || {});

  // Final-doc export flattens tracked changes to the accepted result (like the
  // ins/del translators, which strip their wrappers when params.isFinalDoc). A
  // tracked paragraph-property revision (w:pPrChange) must NOT appear in a
  // "final" DOCX — drop the change record so only the accepted current
  // numbering/alignment (already carried on paragraphProperties) is exported.
  if (params?.isFinalDoc && paragraphProperties.change) {
    delete paragraphProperties.change;
  }

  // Only include w:rPr in pPr when the paragraph had inline rPr on import; filter to inline keys and drop if empty.
  const inlineKeys = paragraphProperties.runPropertiesInlineKeys;
  delete paragraphProperties.runPropertiesInlineKeys;
  // Only strip when we have an explicit empty allow-list. Missing runPropertiesInlineKeys (old collab /
  // legacy nodes) keeps paragraph runProperties so export still matches historical behavior.
  if (Array.isArray(inlineKeys) && inlineKeys.length === 0) {
    delete paragraphProperties.runProperties;
  } else if (Array.isArray(inlineKeys) && paragraphProperties.runProperties) {
    const filtered = Object.fromEntries(
      inlineKeys
        .filter((k) => k in paragraphProperties.runProperties)
        .map((k) => [k, paragraphProperties.runProperties[k]]),
    );
    if (Object.keys(filtered).length > 0) {
      paragraphProperties.runProperties = filtered;
    } else {
      delete paragraphProperties.runProperties;
    }
  }

  const paragraphSplitTrackFormatMark = findParagraphSplitTrackFormatMark(node);
  const paragraphSplitWordIdOptions = paragraphSplitTrackFormatMark
    ? {
        wordIdAllocator: params?.converter?.wordIdAllocator || null,
        partPath: resolveExportPartPath(params),
      }
    : null;
  let pPr = wPPrNodeTranslator.decode({
    node: { ...node, attrs: { paragraphProperties } },
    // Thread the Word revision-id allocator + part path so a tracked w:pPrChange
    // mints a doc-unique w:id via the allocator (not a collision-prone hash).
    converter: params?.converter,
    currentPartPath: resolveExportPartPath(params),
  });
  if (!params?.isFinalDoc && paragraphSplitTrackFormatMark) {
    const insertionElement = createParagraphSplitInsertionElement(
      paragraphSplitTrackFormatMark,
      paragraphSplitWordIdOptions,
    );
    if (insertionElement) {
      pPr = prependParagraphSplitInsertion(ensureParagraphPropertiesNode(pPr), insertionElement);
    }
  }
  // The paragraph mark's own tracked deletion. `isFinalDoc` strips
  // pending revisions for a clean export, so it is skipped there like the
  // paragraph-split insertion above.
  const markTrackChange = node.attrs?.markTrackChange;
  if (!params?.isFinalDoc && markTrackChange?.type === 'paragraphMarkDelete') {
    // Through the SAME allocator the run-level `w:del` uses. `w:id` is
    // ST_DecimalNumber, and the internal id is a UUID; allocating on the shared
    // logical id both keeps the value in schema and gives both halves of the
    // deletion one id, so Word reads them as a single revision.
    pPr = appendParagraphMarkDeletion(
      ensureParagraphPropertiesNode(pPr),
      markTrackChange,
      resolveExportWordId(params, markTrackChange),
    );
  }

  const sectPr = node.attrs?.paragraphProperties?.sectPr;
  if (sectPr) {
    if (!pPr) {
      pPr = {
        type: 'element',
        name: 'w:pPr',
        elements: [],
      };
    }
    // Per CT_PPr, sectPr must precede pPrChange.
    const pPrChangeIdx = pPr.elements.findIndex((el) => el.name === 'w:pPrChange');
    if (pPrChangeIdx === -1) {
      pPr.elements.push(sectPr);
    } else {
      pPr.elements.splice(pPrChangeIdx, 0, sectPr);
    }
  }
  return pPr;
}
