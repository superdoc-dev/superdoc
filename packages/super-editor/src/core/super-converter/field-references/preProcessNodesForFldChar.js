/**
 * @typedef {import('../v2/types/index.js').OpenXmlNode} OpenXmlNode
 */
import { getInstructionPreProcessor } from './fld-preprocessors';
import { carbonCopy } from '@core/utilities/carbonCopy.js';

const SKIP_FIELD_PROCESSING_NODE_NAMES = new Set(['w:drawing', 'w:pict']);

const shouldSkipFieldProcessing = (node) => SKIP_FIELD_PROCESSING_NODE_NAMES.has(node?.name);
/**
 * @typedef {object} FldCharProcessResult
 * @property {OpenXmlNode[]} processedNodes - The list of nodes after processing.
 * @property {Array<{nodes: OpenXmlNode[], fieldInfo: {instrText: string, instructionTokens?: Array<{type: string, text?: string}>}}>| null} unpairedBegin - If a field 'begin' was found without a matching 'end'. Contains the current field data.
 * @property {boolean | null} unpairedEnd - If a field 'end' was found without a matching 'begin'.
 */

/**
 * Pre-processes nodes to combine nodes together where necessary (e.g., links).
 * This function recursively traverses the node tree to handle `w:fldChar` elements, which define fields like TOC, hyperlinks and page numbers.
 *
 * It operates as a state machine:
 * - On `begin` fldChar: starts collecting nodes.
 * - On `end` fldChar: processes the collected nodes.
 *
 * The function's recursive nature and state-passing through return values allow it to handle fields that span across multiple nodes or are nested.
 *
 * @param {OpenXmlNode[]} [nodes=[]] - The nodes to process.
 * @param {import('../v2/docxHelper').ParsedDocx} [docx] - The docx object.
 * @returns {FldCharProcessResult} The processed nodes and whether there were unpaired begin or end fldChar nodes.
 */
export const preProcessNodesForFldChar = (nodes = [], docx) => {
  const processedNodes = [];
  let collectedNodesStack = [];
  let rawCollectedNodesStack = [];
  let currentFieldStack = [];
  let unpairedEnd = null;
  let collecting = false;

  /**
   * Finalizes the current field. If collecting nodes, it processes them.
   * Otherwise, it means an unpaired fldCharType='end' was found which needs to be handled by a parent node.
   */
  const finalizeField = () => {
    if (collecting) {
      const collectedNodes = collectedNodesStack.pop().filter((n) => n !== null);
      const rawCollectedNodes = rawCollectedNodesStack.pop().filter((n) => n !== null);
      const currentField = currentFieldStack.pop();
      const combinedResult = _processCombinedNodesForFldChar(
        collectedNodes,
        currentField.instrText.trim(),
        docx,
        currentField.instructionTokens,
      );
      const outputNodes = combinedResult.handled ? combinedResult.nodes : rawCollectedNodes;
      if (collectedNodesStack.length === 0) {
        // We have completed a top-level field, add the combined nodes to the output.
        processedNodes.push(...outputNodes);
      } else {
        // We are inside another field, so add the combined nodes to the parent collection.
        collectedNodesStack[collectedNodesStack.length - 1].push(...outputNodes);
        rawCollectedNodesStack[rawCollectedNodesStack.length - 1].push(...outputNodes);
      }
    } else {
      // An unmatched 'end' indicates a field from a parent node is closing.
      unpairedEnd = true;
    }
  };

  for (const node of nodes) {
    const rawNode = carbonCopy(node);
    collecting = collectedNodesStack.length > 0;

    if (shouldSkipFieldProcessing(node)) {
      if (collecting) {
        collectedNodesStack[collectedNodesStack.length - 1].push(node);
        rawCollectedNodesStack[collectedNodesStack.length - 1].push(rawNode);
      } else {
        processedNodes.push(node);
      }
      continue;
    }

    const fldCharEl = node.elements?.find((el) => el.name === 'w:fldChar');
    const fldType = fldCharEl?.attributes?.['w:fldCharType'];
    const instrTextEl = node.elements?.find((el) => el.name === 'w:instrText');

    if (node.name === 'w:fldSimple') {
      const instr = node.attributes?.['w:instr'];
      if (typeof instr === 'string') {
        const instructionType = instr.trim().split(' ')[0];
        const instructionPreProcessor = getInstructionPreProcessor(instructionType);
        if (instructionPreProcessor) {
          const processed = instructionPreProcessor(node.elements ?? [], instr, docx, null);
          if (collecting) {
            collectedNodesStack[collectedNodesStack.length - 1].push(...processed);
            rawCollectedNodesStack[rawCollectedNodesStack.length - 1].push(...processed);
          } else {
            processedNodes.push(...processed);
          }
          continue;
        }
      }
    }

    if (fldType === 'begin') {
      collectedNodesStack.push([]);
      rawCollectedNodesStack.push([rawNode]);
      currentFieldStack.push({ instrText: '', instructionTokens: [], afterSeparate: false });
      continue;
    }

    // If collecting and still in instruction run, aggregate instruction tokens/text.
    if (collecting && currentFieldStack.length > 0) {
      const currentField = currentFieldStack[currentFieldStack.length - 1];
      if (!currentField.afterSeparate) {
        const instructionTokens = extractInstructionTokensFromNode(node);
        if (instructionTokens.length > 0) {
          rawCollectedNodesStack[rawCollectedNodesStack.length - 1].push(rawNode);
          currentField.instructionTokens.push(...instructionTokens);
          const instrTextValue = instrTextEl?.elements?.[0]?.text;
          if (instrTextValue != null) {
            currentField.instrText += `${instrTextValue} `;
          }
          if (instructionTokens.some((token) => token.type === 'tab')) {
            currentField.instrText += '\t';
          }
          // We can ignore instruction nodes
          continue;
        }
      }
    }

    if (fldType === 'end') {
      if (collecting) {
        rawCollectedNodesStack[rawCollectedNodesStack.length - 1].push(rawNode);
      }
      finalizeField();
      continue;
    } else if (fldType === 'separate') {
      if (collecting) {
        rawCollectedNodesStack[rawCollectedNodesStack.length - 1].push(rawNode);
        const currentField = currentFieldStack[currentFieldStack.length - 1];
        if (currentField) {
          currentField.afterSeparate = true;
        }
      }
      // We can ignore the 'fldChar' nodes
      continue;
    }

    if (Array.isArray(node.elements)) {
      // Recurse into child nodes for nodes that are not 'begin' or 'end' markers,
      // as they may contain nested fields too.
      const childResult = preProcessNodesForFldChar(node.elements, docx);
      node.elements = childResult.processedNodes;

      if (childResult.unpairedBegin) {
        // A field started in the children, so this node is part of that field.
        childResult.unpairedBegin.forEach((pendingField) => {
          currentFieldStack.push(pendingField.fieldInfo);

          // The current node should be added to the collected nodes
          collectedNodesStack.push([node]);
          rawCollectedNodesStack.push([rawNode]);
        });
      } else if (childResult.unpairedEnd) {
        // A field from this level or higher ended in the children.
        collectedNodesStack[collectedNodesStack.length - 1].push(node);
        rawCollectedNodesStack[rawCollectedNodesStack.length - 1].push(rawNode);
        finalizeField();
      } else if (collecting) {
        // This node is part of a field being collected at this level.
        collectedNodesStack[collectedNodesStack.length - 1].push(node);
        rawCollectedNodesStack[rawCollectedNodesStack.length - 1].push(rawNode);
      } else {
        // This node is not part of any field.
        processedNodes.push(node);
      }
    } else if (collecting) {
      collectedNodesStack[collectedNodesStack.length - 1].push(node);
      rawCollectedNodesStack[rawCollectedNodesStack.length - 1].push(rawNode);
    } else {
      processedNodes.push(node);
    }
  }

  let unpairedBegin = null;
  if (collectedNodesStack.length > 0) {
    unpairedBegin = [];
    // Iterate from the outermost to innermost unclosed fields
    for (let i = 0; i < collectedNodesStack.length; i++) {
      processedNodes.push(...collectedNodesStack[i].filter((n) => n !== null));
      unpairedBegin.push({
        nodes: collectedNodesStack[i],
        fieldInfo: currentFieldStack[i],
      });
    }
  }

  return { processedNodes, unpairedBegin, unpairedEnd };
};

/**
 * Processes the combined nodes for fldChar.
 *
 * @param {OpenXmlNode[]} [nodesToCombine=[]] - The nodes to combine.
 * @param {string} instrText - The instruction text associated with the field.
 * @param {import('../v2/docxHelper').ParsedDocx} [docx] - The docx object.
 * @returns {OpenXmlNode[]} The processed nodes.
 */
const _processCombinedNodesForFldChar = (nodesToCombine = [], instrText, docx, instructionTokens) => {
  const instructionType = instrText.trim().split(' ')[0];
  const instructionPreProcessor = getInstructionPreProcessor(instructionType);
  if (instructionPreProcessor) {
    return { nodes: instructionPreProcessor(nodesToCombine, instrText, docx, instructionTokens), handled: true };
  }
  return { nodes: nodesToCombine, handled: false };
};

/**
 * @typedef {Object} InstructionToken
 * @property {'text' | 'tab'} type - The token type
 * @property {string} [text] - The text content (only present for 'text' type)
 */

/**
 * Extracts instruction tokens from an OOXML run node.
 *
 * This function parses a run node to identify instruction-related elements:
 * - w:instrText elements become 'text' tokens with their content
 * - w:tab elements become 'tab' tokens (important for INDEX fields with tab separators)
 *
 * @param {OpenXmlNode} node - The OOXML node to extract tokens from
 * @returns {InstructionToken[]} Array of instruction tokens found in the node
 *
 * @example
 * // Node with instruction text
 * extractInstructionTokensFromNode({
 *   elements: [{ name: 'w:instrText', elements: [{ text: 'INDEX \\e "' }] }]
 * });
 * // Returns: [{ type: 'text', text: 'INDEX \\e "' }]
 *
 * @example
 * // Node with tab
 * extractInstructionTokensFromNode({
 *   elements: [{ name: 'w:tab' }]
 * });
 * // Returns: [{ type: 'tab' }]
 */
const extractInstructionTokensFromNode = (node) => {
  const elements = Array.isArray(node?.elements) ? node.elements : [];
  /** @type {InstructionToken[]} */
  const tokens = [];
  elements.forEach((el) => {
    if (el?.name === 'w:instrText') {
      const text = (el.elements || []).map((child) => (typeof child?.text === 'string' ? child.text : '')).join('');
      tokens.push({ type: 'text', text });
    }
    if (el?.name === 'w:tab') {
      tokens.push({ type: 'tab' });
    }
  });
  return tokens;
};
