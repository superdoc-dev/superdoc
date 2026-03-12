import { decodeRPrFromMarks } from '@converter/styles.js';
import { translator as wRPrNodeTranslator } from '@converter/v3/handlers/w/rpr/rpr-translator.js';

// Normalizes marks into a stable `{ type, attrs }` shape before sending them into the newer
// decodeRPrFromMarks + w:rPr translator pipeline.
const normalizeMark = (mark) => {
  if (!mark) return null;
  const type = typeof mark.type === 'string' ? mark.type : typeof mark.type?.name === 'string' ? mark.type.name : null;
  if (!type) return null;
  // Some snapshots only store `{ type }`; normalize to empty attrs so decodeRPrFromMarks stays safe.
  return { type, attrs: mark?.attrs || {} };
};

const toRunPropertyElements = (marks = []) =>
  (() => {
    const normalizedMarks = marks.map((mark) => normalizeMark(mark)).filter(Boolean);
    const runProperties = decodeRPrFromMarks(normalizedMarks);
    const rPrNode = wRPrNodeTranslator.decode({ node: { attrs: { runProperties } } });
    return Array.isArray(rPrNode?.elements) ? rPrNode.elements : [];
  })();
/**
 * Creates export element for trackFormat mark
 * @param {Array} marks SD node marks.
 * @returns {Object|undefined} Properties element for trackFormat change or undefined.
 */
export const createTrackStyleMark = (marks) => {
  const existingNode = marks.find((mark) => mark?.name === 'w:rPrChange');
  if (existingNode) {
    // Import path already produced a valid OOXML change node; re-use it verbatim.
    // these xml nodes come from ins-translator and del-translator
    return existingNode;
  }

  const trackStyleMark = marks.find((mark) => normalizeMark(mark)?.type === 'trackFormat');
  if (trackStyleMark) {
    const beforeElements = toRunPropertyElements(trackStyleMark.attrs?.before || []);

    return {
      type: 'element',
      name: 'w:rPrChange',
      attributes: {
        'w:id': trackStyleMark.attrs.id,
        'w:author': trackStyleMark.attrs.author,
        'w:authorEmail': trackStyleMark.attrs.authorEmail,
        'w:date': trackStyleMark.attrs.date,
      },
      elements: [
        {
          type: 'element',
          name: 'w:rPr',
          // Core fix: Word expects previous formatting inside <w:rPrChange><w:rPr>...</w:rPr></w:rPrChange>.
          elements: beforeElements,
        },
      ],
    };
  }
  return undefined;
};
