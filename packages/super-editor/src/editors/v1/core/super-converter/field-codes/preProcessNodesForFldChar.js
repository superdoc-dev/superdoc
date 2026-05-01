/**
 * @typedef {import('../v2/types/index.js').OpenXmlNode} OpenXmlNode
 */
import { getInstructionPreProcessor } from './fld-preprocessors';
import { carbonCopy } from '@core/utilities/carbonCopy.js';
import { buildFieldInstanceFromImport, readFieldFlags } from './build-field-instance.js';
import { attachFieldInstanceToFieldNodes } from './attach-field-instance.js';

const SKIP_FIELD_PROCESSING_NODE_NAMES = new Set(['w:drawing', 'w:pict']);

const shouldSkipFieldProcessing = (node) => SKIP_FIELD_PROCESSING_NODE_NAMES.has(node?.name);

/**
 * Block-level OOXML node names that cannot legally appear as inline
 * content. The unhandled-complex-field path uses this to detect when an
 * unsupported field straddles paragraph boundaries (and therefore cannot
 * be wrapped in the inline-only sd:rawField carrier).
 */
const BLOCK_LEVEL_OOXML_NAMES = new Set([
  'w:p',
  'w:tbl',
  'sd:tableOfContents',
  'sd:index',
  'sd:bibliography',
  'sd:tableOfAuthorities',
]);

/**
 * Returns true when the collected field content includes any block-level
 * element. Used by the unhandled-complex-field path to decide between
 * wrapping in sd:rawField (inline-only) and passing the raw runs through
 * unchanged for schema validity.
 *
 * @param {OpenXmlNode[]} nodes
 * @returns {boolean}
 */
const containsBlockLevelNode = (nodes) => {
  if (!Array.isArray(nodes)) return false;
  return nodes.some((node) => typeof node?.name === 'string' && BLOCK_LEVEL_OOXML_NAMES.has(node.name));
};
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
 * @param {object} [options] - Per-call options.
 * @param {import('./build-field-instance.js').BuildFieldInstanceArgs['part']} [options.part='body']
 *   The DOCX part this content originated from. Threaded into every
 *   FieldInstance built from this call so `source.part` is faithful for
 *   textboxes living in footnotes / endnotes / comments and any other
 *   non-body part. Defaults to `'body'` for the document root.
 * @returns {FldCharProcessResult} The processed nodes and whether there were unpaired begin or end fldChar nodes.
 */
export const preProcessNodesForFldChar = (nodes = [], docx, options = {}) => {
  const processedNodes = [];
  let collectedNodesStack = [];
  let rawCollectedNodesStack = [];
  let fieldRunRPrStack = [];
  let currentFieldStack = [];
  let unpairedEnd = null;
  let collecting = false;
  // importIndex is a per-call ordinal incremented each time an unknown field
  // is wrapped in sd:rawField. This is a best-effort signal until later
  // chunks of the substrate carry FieldInstance on every typed node and the
  // round-trip harness assigns a globally-stable ordering.
  let importIndex = 0;
  const FIELD_PART = options.part ?? 'body';
  const rawNodeSourceTokens = new WeakMap();

  /**
   * Wrap an unknown field's result content in a sd:rawField element and
   * stash the canonical FieldInstance payload on its attributes so the
   * encoder can forward it to the PM node and the decoder can choose
   * passthrough vs rebuild on export.
   */
  const buildRawFieldElement = ({ representation, instructionText, resultElements, originalXml, dirty, locked }) => {
    const fieldInstance = buildFieldInstanceFromImport({
      representation,
      instructionText,
      resultFragments: resultElements,
      originalXml,
      dirty,
      locked,
      part: FIELD_PART,
      importIndex: importIndex++,
    });
    return {
      name: 'sd:rawField',
      attributes: { fieldInstance },
      elements: resultElements,
    };
  };

  /**
   * Finalizes the current field. If collecting nodes, it processes them.
   * Otherwise, it means an unpaired fldCharType='end' was found which needs to be handled by a parent node.
   */
  const finalizeField = () => {
    if (collecting) {
      const collectedNodes = collectedNodesStack.pop().filter((n) => n !== null);
      const rawCollectedNodes = rawCollectedNodesStack.pop().filter((n) => n !== null);
      const fieldRunRPr = fieldRunRPrStack.pop() ?? null;
      const currentField = currentFieldStack.pop();
      // .trim() normalizes leading/trailing whitespace from the source
      // <w:instrText xml:space="preserve">. Passthrough export is unaffected
      // (it re-emits source.originalXml verbatim); rebuildEnvelope, when
      // a field has been edited, emits the trimmed form. Word is tolerant.
      const combinedResult = _processCombinedNodesForFldChar(
        collectedNodes,
        currentField.instrText.trim(),
        docx,
        currentField.instructionTokens,
        fieldRunRPr,
      );
      let outputNodes;
      if (combinedResult.handled) {
        outputNodes = combinedResult.nodes;
        // Attach the canonical FieldInstance to the typed sd:* element(s)
        // the family preprocessor emitted. Export still reads legacy typed
        // attrs in Phase 0; the substrate payload is carried alongside so
        // Phase 1 / 3 can consume it without changing the import path.
        const fieldInstance = buildFieldInstanceFromImport({
          representation: 'complex',
          instructionText: currentField.instrText.trim(),
          resultFragments: collectedNodes,
          originalXml: rawCollectedNodes,
          dirty: currentField.dirty ?? false,
          locked: currentField.locked ?? false,
          part: FIELD_PART,
          importIndex: importIndex++,
        });
        attachFieldInstanceToFieldNodes(outputNodes, fieldInstance);
      } else {
        // Unknown / unsupported field family. The default path wraps the
        // result content in a sd:rawField element holding the canonical
        // FieldInstance payload, so the exporter can passthrough verbatim
        // when nothing has been edited.
        //
        // BUT: rawField is an inline-only PM node (group: 'inline',
        // content: 'inline*'). When the field's collected content
        // straddles paragraph boundaries (e.g. a multi-paragraph IF
        // field, or any unsupported complex field that contains <w:p> or
        // <w:tbl>), wrapping it would produce an inline node holding
        // block children, which fails ProseMirror schema validation.
        // For that rare case, fall back to the pre-substrate behavior:
        // pass the raw runs through unchanged. We lose the FieldInstance
        // for this field, but the document loads and round-trips. A
        // block-level rawField carrier is future work.
        if (containsBlockLevelNode(collectedNodes)) {
          outputNodes = rawCollectedNodes;
        } else {
          outputNodes = [
            buildRawFieldElement({
              representation: 'complex',
              instructionText: currentField.instrText.trim(),
              resultElements: collectedNodes,
              originalXml: rawCollectedNodes,
              dirty: currentField.dirty ?? false,
              locked: currentField.locked ?? false,
            }),
          ];
        }
      }
      if (collectedNodesStack.length === 0) {
        // We have completed a top-level field, add the combined nodes to the output.
        processedNodes.push(...outputNodes);
      } else {
        // We are inside another field, so add the combined nodes to the parent collection.
        collectedNodesStack[collectedNodesStack.length - 1].push(...outputNodes);
        // The parent's source.originalXml capture must hold the original
        // OOXML runs, not the synthesized sd:* wrappers we just produced.
        // If the synthesized wrappers leaked into the parent's raw stack,
        // an unedited parent's passthrough export would emit literal
        // `<sd:rawField>` / `<sd:sequenceField>` / etc. as XML, breaking
        // structural fidelity. Push the inner field's begin/instr/separate/
        // result/end run sequence (rawCollectedNodes) instead.
        rawCollectedNodesStack[rawCollectedNodesStack.length - 1].push(...rawCollectedNodes);
      }
    } else {
      // An unmatched 'end' indicates a field from a parent node is closing.
      unpairedEnd = true;
    }
  };

  /**
   * Captures the original raw node at most once for the currently active field.
   * @param {OpenXmlNode} rawNode
   * @param {Set<OpenXmlNode>} capturedRawNodes
   * @param {object} rawSourceToken
   */
  const captureRawNodeForCurrentField = (rawNode, capturedRawNodes, rawSourceToken) => {
    if (rawCollectedNodesStack.length === 0) return;
    if (capturedRawNodes.has(rawNode)) return;
    const currentRawStack = rawCollectedNodesStack[rawCollectedNodesStack.length - 1];
    const lastRawNode = currentRawStack[currentRawStack.length - 1];
    const canMergeIntoLastNode =
      lastRawNode?.name === 'w:r' &&
      rawNode?.name === 'w:r' &&
      rawNodeSourceTokens.get(lastRawNode) === rawSourceToken &&
      Array.isArray(lastRawNode.elements) &&
      Array.isArray(rawNode.elements);
    if (canMergeIntoLastNode) {
      lastRawNode.elements.push(...carbonCopy(rawNode.elements));
    } else {
      currentRawStack.push(rawNode);
      rawNodeSourceTokens.set(rawNode, rawSourceToken);
    }
    capturedRawNodes.add(rawNode);
  };

  /**
   * Processes a single logical node against the fldChar state machine.
   * @param {OpenXmlNode} node
   * @param {OpenXmlNode} rawNode
   * @param {Set<OpenXmlNode>} capturedRawNodes
   * @param {object} rawSourceToken
   */
  const processNode = (node, rawNode, capturedRawNodes, rawSourceToken) => {
    collecting = collectedNodesStack.length > 0;

    if (shouldSkipFieldProcessing(node)) {
      if (collecting) {
        collectedNodesStack[collectedNodesStack.length - 1].push(node);
        captureRawNodeForCurrentField(rawNode, capturedRawNodes, rawSourceToken);
      } else {
        processedNodes.push(node);
      }
      return;
    }

    const fldCharEl = node.elements?.find((el) => el.name === 'w:fldChar');
    const fldType = fldCharEl?.attributes?.['w:fldCharType'];

    if (node.name === 'w:fldSimple') {
      const instr = node.attributes?.['w:instr'];
      if (typeof instr === 'string') {
        const instructionType = instr.trim().split(' ')[0];
        const instructionPreProcessor = getInstructionPreProcessor(instructionType);
        if (instructionPreProcessor) {
          const processed = instructionPreProcessor(node.elements ?? [], instr, docx, null);
          // Same FieldInstance attachment as the complex-field handled path.
          const { dirty: simpleDirty, locked: simpleLocked } = readFieldFlags(node);
          const fieldInstance = buildFieldInstanceFromImport({
            representation: 'simple',
            instructionText: instr,
            resultFragments: node.elements ?? [],
            originalXml: rawNode,
            dirty: simpleDirty,
            locked: simpleLocked,
            part: FIELD_PART,
            importIndex: importIndex++,
          });
          attachFieldInstanceToFieldNodes(processed, fieldInstance);
          if (collecting) {
            collectedNodesStack[collectedNodesStack.length - 1].push(...processed);
            // Push the original <w:fldSimple> run into the parent's raw
            // stack — not the synthesized sd:* wrapper. See the complex-
            // field branch for the same reasoning: passthrough on the
            // parent must emit valid OOXML, not an sd:* literal.
            rawCollectedNodesStack[rawCollectedNodesStack.length - 1].push(rawNode);
          } else {
            processedNodes.push(...processed);
          }
          return;
        }
        // Unknown / unsupported family on a simple field: wrap in sd:rawField.
        // The fldSimple element itself is the source.originalXml; result
        // content is its children, which the encoder recursively imports
        // so formatted result runs survive end-to-end.
        const { dirty, locked } = readFieldFlags(node);
        const rawElement = buildRawFieldElement({
          representation: 'simple',
          instructionText: instr,
          resultElements: node.elements ?? [],
          originalXml: rawNode,
          dirty,
          locked,
        });
        if (collecting) {
          collectedNodesStack[collectedNodesStack.length - 1].push(rawElement);
          // Push the original <w:fldSimple> run into the parent's raw
          // stack so passthrough export emits valid OOXML, not an
          // sd:rawField literal.
          rawCollectedNodesStack[rawCollectedNodesStack.length - 1].push(rawNode);
        } else {
          processedNodes.push(rawElement);
        }
        return;
      }
    }

    if (fldType === 'begin') {
      collectedNodesStack.push([]);
      const rawStack = [rawNode];
      rawCollectedNodesStack.push(rawStack);
      rawNodeSourceTokens.set(rawNode, rawSourceToken);
      capturedRawNodes.add(rawNode);
      fieldRunRPrStack.push(extractFieldRunRPr(node));
      const { dirty, locked } = readFieldFlags(fldCharEl);
      currentFieldStack.push({ instrText: '', instructionTokens: [], afterSeparate: false, dirty, locked });
      return;
    }

    // If collecting and still in instruction run, aggregate instruction tokens/text.
    if (collecting && currentFieldStack.length > 0) {
      const currentField = currentFieldStack[currentFieldStack.length - 1];
      if (!currentField.afterSeparate) {
        const instructionTokens = extractInstructionTokensFromNode(node);
        if (instructionTokens.length > 0) {
          captureRawNodeForCurrentField(rawNode, capturedRawNodes, rawSourceToken);
          const fieldRunRPr = extractFieldRunRPr(node);
          if (fieldRunRPr) {
            fieldRunRPrStack[fieldRunRPrStack.length - 1] = fieldRunRPr;
          }
          currentField.instructionTokens.push(...instructionTokens);
          // Build instrText from the ordered tokens this run produced —
          // not from `instrTextEl?.elements?.[0]?.text` (find() returns
          // only the first w:instrText) and not by appending tabs at the
          // end (tabs may sit BETWEEN instrText segments, e.g. INDEX \e
          // "<tab>"). Walking instructionTokens preserves both the
          // multi-segment and tab-position cases. The trailing space
          // separates this run's text from the next run's so consecutive
          // runs do not smash together; the final .trim() in finalizeField
          // strips outer whitespace.
          for (const token of instructionTokens) {
            if (token.type === 'tab') currentField.instrText += '\t';
            else if (typeof token.text === 'string') currentField.instrText += token.text;
          }
          currentField.instrText += ' ';
          // We can ignore instruction nodes
          return;
        }
      }
    }

    if (fldType === 'end') {
      if (collecting) {
        captureRawNodeForCurrentField(rawNode, capturedRawNodes, rawSourceToken);
      }
      finalizeField();
      return;
    } else if (fldType === 'separate') {
      if (collecting) {
        captureRawNodeForCurrentField(rawNode, capturedRawNodes, rawSourceToken);
        const fieldRunRPr = extractFieldRunRPr(node);
        if (fieldRunRPr) {
          fieldRunRPrStack[fieldRunRPrStack.length - 1] = fieldRunRPr;
        }
        const currentField = currentFieldStack[currentFieldStack.length - 1];
        if (currentField) {
          currentField.afterSeparate = true;
        }
      }
      // We can ignore the 'fldChar' nodes
      return;
    }

    if (Array.isArray(node.elements)) {
      // Recurse into child nodes for nodes that are not 'begin' or 'end' markers,
      // as they may contain nested fields too.
      const childResult = preProcessNodesForFldChar(node.elements, docx, options);
      node.elements = childResult.processedNodes;

      if (childResult.unpairedBegin) {
        // A field started in the children, so this node is part of that field.
        childResult.unpairedBegin.forEach((pendingField) => {
          currentFieldStack.push(pendingField.fieldInfo);

          // The current node should be added to the collected nodes
          collectedNodesStack.push([node]);
          const rawStack = [rawNode];
          rawCollectedNodesStack.push(rawStack);
          rawNodeSourceTokens.set(rawNode, rawSourceToken);
          capturedRawNodes.add(rawNode);
        });
      } else if (childResult.unpairedEnd) {
        // A field from this level or higher ended in the children.
        collectedNodesStack[collectedNodesStack.length - 1].push(node);
        captureRawNodeForCurrentField(rawNode, capturedRawNodes, rawSourceToken);
        finalizeField();
      } else if (collecting) {
        // This node is part of a field being collected at this level.
        collectedNodesStack[collectedNodesStack.length - 1].push(node);
        captureRawNodeForCurrentField(rawNode, capturedRawNodes, rawSourceToken);
      } else {
        // This node is not part of any field.
        processedNodes.push(node);
      }
    } else if (collecting) {
      collectedNodesStack[collectedNodesStack.length - 1].push(node);
      captureRawNodeForCurrentField(rawNode, capturedRawNodes, rawSourceToken);
    } else {
      processedNodes.push(node);
    }
  };

  for (const node of nodes) {
    const rawNode = carbonCopy(node);
    const logicalNodes = expandNodeForFieldProcessing(node);
    const rawLogicalNodes = expandNodeForFieldProcessing(rawNode);
    const capturedRawNodes = new Set();
    const rawSourceToken = {};
    logicalNodes.forEach((logicalNode, index) => {
      processNode(logicalNode, rawLogicalNodes[index] ?? rawNode, capturedRawNodes, rawSourceToken);
    });
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
 * @param {Array<{type: string, text?: string}>} [instructionTokens] - Raw instruction tokens.
 * @param {OpenXmlNode | null} [fieldRunRPr] - The w:rPr captured from field sequence runs.
 * @returns {{ nodes: OpenXmlNode[], handled: boolean }} The processed nodes and whether a preprocessor handled them.
 */
const _processCombinedNodesForFldChar = (nodesToCombine = [], instrText, docx, instructionTokens, fieldRunRPr) => {
  const instructionType = instrText.trim().split(' ')[0];
  const instructionPreProcessor = getInstructionPreProcessor(instructionType);
  if (instructionPreProcessor) {
    return {
      nodes: instructionPreProcessor(nodesToCombine, instrText, docx, instructionTokens, fieldRunRPr),
      handled: true,
    };
  }
  return { nodes: nodesToCombine, handled: false };
};

/**
 * Returns a styled w:rPr node from a field-sequence run, or null when none exists.
 * We only keep non-empty rPr nodes so empty formatting stubs do not mask later runs.
 *
 * @param {OpenXmlNode} node
 * @returns {OpenXmlNode | null}
 */
const extractFieldRunRPr = (node) => {
  const rPrNode = node?.elements?.find((el) => el.name === 'w:rPr');
  if (!rPrNode?.elements?.length) {
    return null;
  }
  return rPrNode;
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

const FIELD_CONTROL_ELEMENT_NAMES = new Set(['w:fldChar']);
const INSTRUCTION_ELEMENT_NAMES = new Set(['w:instrText', 'w:tab']);

const cloneNodeWithElements = (node, elements) => ({
  ...node,
  elements: carbonCopy(elements),
});

/**
 * Expands mixed-content runs into logical subnodes so the fldChar state machine
 * can process multiple field markers stored inside a single w:r in document order.
 *
 * @param {OpenXmlNode} node
 * @returns {OpenXmlNode[]}
 */
const expandNodeForFieldProcessing = (node) => {
  const elements = Array.isArray(node?.elements) ? node.elements : null;
  if (node?.name !== 'w:r' || !elements || elements.length === 0) {
    return [node];
  }

  const runProperties = elements.filter((el) => el?.name === 'w:rPr');
  const contentElements = elements.filter((el) => el?.name !== 'w:rPr');
  const logicalNodes = [];
  let currentKind = null;
  let currentElements = [];

  const flushCurrentGroup = () => {
    if (currentElements.length === 0) return;
    logicalNodes.push(cloneNodeWithElements(node, [...runProperties, ...currentElements]));
    currentElements = [];
    currentKind = null;
  };

  contentElements.forEach((element) => {
    if (!element?.name) {
      if (currentKind !== 'content') {
        flushCurrentGroup();
        currentKind = 'content';
      }
      currentElements.push(element);
      return;
    }

    if (FIELD_CONTROL_ELEMENT_NAMES.has(element.name)) {
      flushCurrentGroup();
      logicalNodes.push(cloneNodeWithElements(node, [...runProperties, element]));
      return;
    }

    if (INSTRUCTION_ELEMENT_NAMES.has(element.name)) {
      if (currentKind !== 'instruction') {
        flushCurrentGroup();
        currentKind = 'instruction';
      }
      currentElements.push(element);
      return;
    }

    if (currentKind !== 'content') {
      flushCurrentGroup();
      currentKind = 'content';
    }
    currentElements.push(element);
  });

  flushCurrentGroup();

  return logicalNodes.length > 1 ? logicalNodes : [node];
};
