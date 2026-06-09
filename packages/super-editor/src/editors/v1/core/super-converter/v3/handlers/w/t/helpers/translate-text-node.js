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
import { appendTrackFormatChangeToRunProperties, findTrackFormatMark } from '@converter/v3/handlers/helpers.js';

function resolveExportPartPath(params = {}) {
  if (typeof params.currentPartPath === 'string' && params.currentPartPath.length > 0) return params.currentPartPath;
  if (typeof params.filename === 'string' && params.filename.length > 0) {
    return params.filename.startsWith('word/') ? params.filename : `word/${params.filename}`;
  }
  return 'word/document.xml';
}

export function getTextNodeForExport(text, marks, params) {
  const normalizedMarks = Array.isArray(marks) ? marks : [];
  const hasLeadingOrTrailingSpace = /^\s|\s$/.test(text);
  const space = hasLeadingOrTrailingSpace ? 'preserve' : null;
  const nodeAttrs = space ? { 'xml:space': space } : null;
  const textNodes = [];

  const textRunProperties = decodeRPrFromMarks(normalizedMarks);
  const parentRunProperties = params.extraParams?.runProperties || {};
  const combinedRunProperties = combineRunProperties([parentRunProperties, textRunProperties]);
  const trackFormatMark = findTrackFormatMark(normalizedMarks);
  let rPrNode = wRPrNodeTranslator.decode({ node: { attrs: { runProperties: combinedRunProperties } } });

  if (!rPrNode && trackFormatMark) {
    rPrNode = {
      type: 'element',
      name: 'w:rPr',
      elements: [],
    };
  }

  appendTrackFormatChangeToRunProperties(rPrNode, normalizedMarks, {
    wordIdAllocator: params?.converter?.wordIdAllocator || null,
    partPath: resolveExportPartPath(params),
  });

  const textValue = typeof text === 'string' ? text : '';
  // Normalize CRLF/CR to LF so Windows line endings export Word-native breaks
  // too, rather than leaving a stray carriage return inside <w:t>.
  const normalizedText = textValue.includes('\r') ? textValue.replace(/\r\n?/g, '\n') : textValue;
  if (normalizedText.includes('\n')) {
    // Export safety net: a raw newline inside <w:t> is whitespace that Word
    // collapses on open (it is not the OOXML representation of a line break),
    // while SuperDoc still renders it as a break: the SD-3278
    // divergence. Emit a Word-native <w:br/> between
    // segments instead. Everything stays inside this single run so the
    // surrounding <w:ins>/<w:del> wrappers keep wrapping exactly one run.
    const segments = normalizedText.split('\n');
    segments.forEach((segment, index) => {
      if (segment.length > 0) {
        const segmentNeedsSpace = /^\s|\s$/.test(segment);
        textNodes.push({
          name: 'w:t',
          elements: [{ text: segment, type: 'text' }],
          attributes: segmentNeedsSpace ? { 'xml:space': 'preserve' } : null,
        });
      }
      if (index < segments.length - 1) {
        textNodes.push({ name: 'w:br' });
      }
    });
  } else {
    textNodes.push({
      name: 'w:t',
      elements: [{ text: normalizedText, type: 'text' }],
      attributes: nodeAttrs,
    });
  }

  // For custom mark export, we need to add a bookmark start and end tag
  // And store attributes in the bookmark name
  if (params?.editor?.extensionService?.extensions) {
    const customMarks = params.editor.extensionService.extensions.filter((extension) => extension.isExternal === true);

    normalizedMarks.forEach((mark) => {
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
    elements: rPrNode ? [rPrNode, ...textNodes] : textNodes,
  };
}
