import { processOutputMarks } from '@converter/exporter.js';
/**
 * Creates export element for trackFormat mark
 * @param {Array} marks SD node marks.
 * @returns {Object|undefined} Properties element for trackFormat change or undefined.
 */
export const createTrackStyleMark = (marks) => {
  const trackStyleMark = marks.find((mark) => mark.type === 'trackFormat');
  if (trackStyleMark) {
    const beforeMarks = Array.isArray(trackStyleMark.attrs.before) ? trackStyleMark.attrs.before : [];
    const beforeElements = beforeMarks
      .flatMap((mark) => processOutputMarks([mark]) || [])
      .filter((element) => element && typeof element === 'object');
    const rPrElement = {
      name: 'w:rPr',
      elements: beforeElements,
    };
    return {
      type: 'element',
      name: 'w:rPrChange',
      attributes: {
        'w:id': trackStyleMark.attrs.id,
        'w:author': trackStyleMark.attrs.author,
        'w:authorEmail': trackStyleMark.attrs.authorEmail,
        'w:date': trackStyleMark.attrs.date,
      },
      elements: [rPrElement],
    };
  }
  return undefined;
};
