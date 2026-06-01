import { carbonCopy } from '@core/utilities/carbonCopy.js';
import { translator as wPPrNodeTranslator } from '../../pPr/pPr-translator.js';
import {
  createParagraphSplitInsertionElement,
  createParagraphSplitPropertiesChange,
  isParagraphSplitTrackFormatMark,
} from '../../../helpers.js';

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
      const childMarks = Array.isArray(child?.marks) ? child.marks : [];
      found = childMarks.find((mark) => isParagraphSplitTrackFormatMark(mark)) || null;
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
  if (!existingRunProperties) pPr.elements.unshift(runProperties);
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
  if (!params?.isFinalDoc && paragraphSplitTrackFormatMark && !paragraphProperties.change) {
    const change = createParagraphSplitPropertiesChange(paragraphSplitTrackFormatMark, paragraphSplitWordIdOptions);
    if (change) paragraphProperties.change = change;
  }

  let pPr = wPPrNodeTranslator.decode({ node: { ...node, attrs: { paragraphProperties } } });
  if (!params?.isFinalDoc && paragraphSplitTrackFormatMark) {
    const insertionElement = createParagraphSplitInsertionElement(
      paragraphSplitTrackFormatMark,
      paragraphSplitWordIdOptions,
    );
    if (insertionElement) {
      pPr = prependParagraphSplitInsertion(ensureParagraphPropertiesNode(pPr), insertionElement);
    }
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
