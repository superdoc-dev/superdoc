/**
 * @typedef {import('../v2/types/index.js').OpenXmlNode} OpenXmlNode
 */
import { preProcessPageInstruction } from './fld-preprocessors/page-preprocessor.js';
import { preProcessNumPagesInstruction } from './fld-preprocessors/num-pages-preprocessor.js';

const SKIP_FIELD_PROCESSING_NODE_NAMES = new Set(['w:drawing', 'w:pict']);

const shouldSkipFieldProcessing = (node) => SKIP_FIELD_PROCESSING_NODE_NAMES.has(node?.name);

/**
 * Pre-processes nodes to convert PAGE and NUMPAGES field codes for header/footer rendering.
 *
 * This function specifically handles:
 * - PAGE fields → sd:autoPageNumber (displays current page number)
 * - NUMPAGES fields → sd:totalPageNumber (displays total page count)
 *
 * Other field types (DOCPROPERTY, HYPERLINK, etc.) are preserved unchanged
 * to maintain proper round-trip export fidelity.
 *
 * @param {OpenXmlNode[]} nodes - The nodes to process.
 * @returns {{ processedNodes: OpenXmlNode[] }} The processed nodes.
 */
export const preProcessPageFieldsOnly = (nodes = [], depth = 0) => {
  const processedNodes = [];
  let i = 0;

  while (i < nodes.length) {
    const node = nodes[i];

    if (shouldSkipFieldProcessing(node)) {
      processedNodes.push(node);
      i++;
      continue;
    }

    // Check if this node starts a field (has fldChar with begin)
    const fldCharEl = node.elements?.find((el) => el.name === 'w:fldChar');
    const fldType = fldCharEl?.attributes?.['w:fldCharType'];

    // Check if this node IS a fldSimple (simple field syntax)
    // fldSimple has the instruction in an attribute, not nested elements
    if (node.name === 'w:fldSimple') {
      const instrAttr = node.attributes?.['w:instr'] || '';
      const fieldType = instrAttr.trim().split(/\s+/)[0];

      if (fieldType === 'PAGE' || fieldType === 'NUMPAGES') {
        const preprocessor = fieldType === 'PAGE' ? preProcessPageInstruction : preProcessNumPagesInstruction;

        // Extract rPr from child elements (content nodes inside fldSimple)
        const contentNodes = node.elements || [];
        let fieldRunRPr = null;
        for (const child of contentNodes) {
          const rPr = child.elements?.find((el) => el.name === 'w:rPr');
          if (rPr) {
            fieldRunRPr = rPr;
            break;
          }
        }

        const processedField = preprocessor(contentNodes, instrAttr.trim(), fieldRunRPr);
        processedNodes.push(...processedField);
        i++;
        continue;
      }
    }

    if (fldType === 'begin') {
      // Scan ahead to find the field type and end marker
      const fieldInfo = scanFieldSequence(nodes, i);

      if (fieldInfo && (fieldInfo.fieldType === 'PAGE' || fieldInfo.fieldType === 'NUMPAGES')) {
        // Process PAGE or NUMPAGES fields
        const preprocessor = fieldInfo.fieldType === 'PAGE' ? preProcessPageInstruction : preProcessNumPagesInstruction;

        // Collect nodes between separate and end for the preprocessor
        // Also pass the captured rPr from field sequence nodes (begin, instrText, separate)
        // which is where Word stores the styling for page number fields
        const contentNodes = fieldInfo.contentNodes;
        const processedField = preprocessor(contentNodes, fieldInfo.instrText, fieldInfo.fieldRunRPr);
        processedNodes.push(...processedField);

        // Skip past the entire field sequence
        i = fieldInfo.endIndex + 1;
        continue;
      } else {
        // Unknown field type - pass through all original nodes unchanged
        if (fieldInfo) {
          for (let j = i; j <= fieldInfo.endIndex; j++) {
            const passNode = nodes[j];
            // Recursively process child elements
            if (Array.isArray(passNode.elements)) {
              const childResult = preProcessPageFieldsOnly(passNode.elements, depth + 1);
              passNode.elements = childResult.processedNodes;
            }
            processedNodes.push(passNode);
          }
          i = fieldInfo.endIndex + 1;
          continue;
        }
      }
    }

    // Not a field or incomplete field - recursively process children and add
    if (Array.isArray(node.elements)) {
      const childResult = preProcessPageFieldsOnly(node.elements, depth + 1);
      node.elements = childResult.processedNodes;
    }
    processedNodes.push(node);
    i++;
  }

  return { processedNodes };
};

/**
 * Scans forward from a 'begin' fldChar to find the complete field sequence.
 *
 * @param {OpenXmlNode[]} nodes - All nodes
 * @param {number} beginIndex - Index of the 'begin' fldChar node
 * @returns {{ fieldType: string, instrText: string, contentNodes: OpenXmlNode[], fieldRunRPr: OpenXmlNode | null, endIndex: number } | null}
 */
function scanFieldSequence(nodes, beginIndex) {
  let instrText = '';
  let separateIndex = -1;
  let endIndex = -1;
  const contentNodes = [];

  // Capture the first w:rPr found in the field sequence (begin, instrText, or separate nodes)
  // Word stores styling on these nodes, not just on content between separate and end
  /** @type {OpenXmlNode | null} */
  let fieldRunRPr = null;

  // Start by checking the begin node itself for rPr
  const beginNode = nodes[beginIndex];
  const beginRPr = beginNode.elements?.find((el) => el.name === 'w:rPr');
  if (beginRPr && hasSignificantStyling(beginRPr)) {
    fieldRunRPr = beginRPr;
  }

  for (let i = beginIndex + 1; i < nodes.length; i++) {
    const node = nodes[i];
    const fldCharEl = node.elements?.find((el) => el.name === 'w:fldChar');
    const fldType = fldCharEl?.attributes?.['w:fldCharType'];
    const instrTextEl = node.elements?.find((el) => el.name === 'w:instrText');

    if (instrTextEl) {
      instrText += (instrTextEl.elements?.[0]?.text || '') + ' ';
    }

    // Capture rPr from field sequence nodes (before separate) if we don't have one yet
    // or if this one has more significant styling
    if (!fieldRunRPr || (separateIndex === -1 && fldType !== 'end')) {
      const rPrNode = node.elements?.find((el) => el.name === 'w:rPr');
      if (rPrNode && hasSignificantStyling(rPrNode)) {
        fieldRunRPr = rPrNode;
      }
    }

    if (fldType === 'separate') {
      separateIndex = i;
    } else if (fldType === 'end') {
      endIndex = i;
      break;
    } else if (separateIndex !== -1 && fldType !== 'begin') {
      // Content between separate and end
      contentNodes.push(node);
    }
  }

  if (endIndex === -1) {
    return null; // Incomplete field
  }

  const fieldType = instrText.trim().split(' ')[0];

  return {
    fieldType,
    instrText: instrText.trim(),
    contentNodes,
    fieldRunRPr,
    endIndex,
  };
}

/**
 * Checks if an rPr node has significant styling beyond just rStyle references.
 * Significant styling includes fonts, sizes, bold, italic, colors, etc.
 *
 * @param {OpenXmlNode} rPrNode - The w:rPr node to check
 * @returns {boolean} True if the node has significant styling
 */
function hasSignificantStyling(rPrNode) {
  if (!rPrNode?.elements?.length) {
    return false;
  }

  // List of elements that indicate significant styling
  const significantElements = [
    'w:rStyle', // Run style reference (Word commonly uses this for page number formatting)
    'w:rFonts', // Font family
    'w:sz', // Font size
    'w:szCs', // Complex script font size
    'w:b', // Bold
    'w:bCs', // Complex script bold
    'w:i', // Italic
    'w:iCs', // Complex script italic
    'w:u', // Underline
    'w:color', // Font color
    'w:highlight', // Highlight color
    'w:strike', // Strikethrough
    'w:dstrike', // Double strikethrough
    'w:caps', // All caps
    'w:smallCaps', // Small caps
  ];

  return rPrNode.elements.some((el) => significantElements.includes(el.name));
}
