import { processOutputMarks } from '@converter/exporter.js';

// Normalizes marks into the `{ type, attrs }` shape the exporter expects (or `null` if the type can't be inferred).
const normalizeMark = (mark) => {
  if (!mark) return null;
  const type = typeof mark.type === 'string' ? mark.type : typeof mark.type?.name === 'string' ? mark.type.name : null;
  if (!type) return null;
  return { type, attrs: mark?.attrs || {} };
};

const toRunPropertyElements = (marks = []) =>
  marks
    .map((mark) => normalizeMark(mark))
    .filter(Boolean)
    .map((mark) => processOutputMarks([mark]))
    .flat()
    .filter((element) => element && Object.keys(element).length);
/**
 * Creates export element for trackFormat mark
 * @param {Array} marks SD node marks.
 * @returns {Object|undefined} Properties element for trackFormat change or undefined.
 */
export const createTrackStyleMark = (marks) => {
  const existingNode = marks.find((mark) => mark?.name === 'w:rPrChange');
  if (existingNode) {
    // Import path already produced a valid OOXML change node; re-use it verbatim.
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
