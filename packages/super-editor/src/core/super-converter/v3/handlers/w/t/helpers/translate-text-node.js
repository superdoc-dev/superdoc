/**
 * Helper function to be used for text node translation
 * Also used for transforming text annotations for the final submit
 *
 * @param {String} text Text node's content
 * @param {Object[]} marks The marks to add to the run properties
 * @returns {XmlReadyNode} The translated text node
 */
import { translator as wRPrNodeTranslator } from '../../rpr/rpr-translator.js';
import { combineRunProperties, decodeRPrFromMarks } from '@converter/styles.js';
import { createTrackStyleMark } from '@converter/v3/handlers/helpers.js';

export function getTextNodeForExport(text, marks, params) {
  const hasLeadingOrTrailingSpace = /^\s|\s$/.test(text);
  const space = hasLeadingOrTrailingSpace ? 'preserve' : null;
  const nodeAttrs = space ? { 'xml:space': space } : null;
  const textNodes = [];

  // Attach tracked formatting change metadata to the run so export keeps it open (not pre-accepted).
  const trackedStyleChange = createTrackStyleMark(marks || []);
  const textRunProperties = decodeRPrFromMarks(marks || []);
  const parentRunProperties = params.extraParams?.runProperties || {};
  const combinedRunProperties = combineRunProperties([parentRunProperties, textRunProperties]);
  const rPrNode = wRPrNodeTranslator.decode({ node: { attrs: { runProperties: combinedRunProperties } } });
  const hasRunProperties = Array.isArray(rPrNode?.elements) && rPrNode.elements.length > 0;
  const hasStyleChange = Boolean(trackedStyleChange);
  const resolvedRunProperties =
    hasRunProperties || hasStyleChange
      ? {
          name: 'w:rPr',
          elements: [
            ...(hasRunProperties ? rPrNode.elements : []),
            // Without this merge, standalone trackFormat marks were dropped during DOCX export.
            ...(hasStyleChange ? [trackedStyleChange] : []),
          ],
        }
      : null;

  textNodes.push({
    name: 'w:t',
    elements: [{ text, type: 'text' }],
    attributes: nodeAttrs,
  });

  // For custom mark export, we need to add a bookmark start and end tag
  // And store attributes in the bookmark name
  if (params) {
    const { editor } = params;
    const customMarks = editor.extensionService.extensions.filter((e) => e.isExternal === true);

    marks.forEach((mark) => {
      const isCustomMark = customMarks.some((customMark) => {
        const customMarkName = customMark.name;
        return mark.type === customMarkName;
      });

      if (!isCustomMark) return;

      let attrsString = '';
      Object.entries(mark.attrs).forEach(([key, value]) => {
        if (value) {
          attrsString += `${key}=${value};`;
        }
      });

      if (isCustomMark) {
        textNodes.unshift({
          type: 'element',
          name: 'w:bookmarkStart',
          attributes: {
            'w:id': '5000',
            'w:name': mark.type + ';' + attrsString,
          },
        });
        textNodes.push({
          type: 'element',
          name: 'w:bookmarkEnd',
          attributes: {
            'w:id': '5000',
          },
        });
      }
    });
  }

  return {
    name: 'w:r',
    elements: resolvedRunProperties ? [resolvedRunProperties, ...textNodes] : textNodes,
  };
}
