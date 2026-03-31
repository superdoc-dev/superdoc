import { carbonCopy } from '@core/utilities/carbonCopy.js';
import { extractMathText } from './extract-math-text.js';

/**
 * Extract justification value from m:oMathPara properties.
 * @param {object} oMathParaNode - The m:oMathPara XML node
 * @returns {string} Justification value ('center', 'centerGroup', 'left', 'right')
 */
function extractJustification(oMathParaNode) {
  const elements = oMathParaNode.elements || [];
  const paraPr = elements.find((el) => el.name === 'm:oMathParaPr');
  if (!paraPr || !Array.isArray(paraPr.elements)) return 'centerGroup';
  const jc = paraPr.elements.find((el) => el.name === 'm:jc');
  if (!jc || !jc.attributes) return 'centerGroup';
  return jc.attributes['m:val'] || 'center';
}

/**
 * Handler for m:oMathPara (display math) elements.
 * Produces a mathBlock PM node with the entire OMML subtree preserved.
 */
const handleMathPara = (params) => {
  const { nodes } = params;
  if (!nodes.length || nodes[0].name !== 'm:oMathPara') {
    return { nodes: [], consumed: 0 };
  }

  const xmlNode = nodes[0];
  const originalXml = carbonCopy(xmlNode);
  const textContent = extractMathText(xmlNode);
  const justification = extractJustification(xmlNode);
  // Use raw inline properties (not resolved) to match how regular paragraphs work.
  // The style-engine resolves them at render time via computeParagraphAttrs.
  const paragraphProperties = params.extraParams?.inlineParagraphProperties ?? null;

  return {
    nodes: [
      {
        type: 'mathBlock',
        attrs: { originalXml, textContent, justification, paragraphProperties },
        marks: [],
      },
    ],
    consumed: 1,
  };
};

/**
 * Handler for m:oMath (inline math) elements.
 * Produces a mathInline PM node with the entire OMML subtree preserved.
 */
const handleMathInline = (params) => {
  const { nodes } = params;
  if (!nodes.length || nodes[0].name !== 'm:oMath') {
    return { nodes: [], consumed: 0 };
  }

  const xmlNode = nodes[0];
  const originalXml = carbonCopy(xmlNode);
  const textContent = extractMathText(xmlNode);

  return {
    nodes: [
      {
        type: 'mathInline',
        attrs: { originalXml, textContent },
        marks: [],
      },
    ],
    consumed: 1,
  };
};

/**
 * Combined math handler. Tries m:oMathPara first (display math), then m:oMath (inline math).
 */
const handleMathNode = (params) => {
  const result = handleMathPara(params);
  if (result.consumed > 0) return result;
  return handleMathInline(params);
};

export const mathNodeHandlerEntity = {
  handlerName: 'mathNodeHandler',
  handler: handleMathNode,
};
