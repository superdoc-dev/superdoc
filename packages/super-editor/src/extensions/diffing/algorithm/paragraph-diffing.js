import { myersDiff } from './myers-diff.js';
import { getTextDiff } from './text-diffing.js';
import { getAttributesDiff } from './attributes-diffing.js';
import { levenshteinDistance } from './similarity.js';

// Heuristics that prevent unrelated paragraphs from being paired as modifications.
const SIMILARITY_THRESHOLD = 0.65;
const MIN_LENGTH_FOR_SIMILARITY = 4;

/**
 * A paragraph addition diff emitted when new content is inserted.
 * @typedef {Object} AddedParagraphDiff
 * @property {'added'} type
 * @property {Node} node reference to the ProseMirror node for consumers needing schema details
 * @property {string} text textual contents of the inserted paragraph
 * @property {number} pos document position where the paragraph was inserted
 */

/**
 * A paragraph deletion diff emitted when content is removed.
 * @typedef {Object} DeletedParagraphDiff
 * @property {'deleted'} type
 * @property {Node} node reference to the original ProseMirror node
 * @property {string} oldText text that was removed
 * @property {number} pos starting document position of the original paragraph
 */

/**
 * A paragraph modification diff that carries inline text-level changes.
 * @typedef {Object} ModifiedParagraphDiff
 * @property {'modified'} type
 * @property {string} oldText text before the edit
 * @property {string} newText text after the edit
 * @property {number} pos original document position for anchoring UI
 * @property {Array<object>} textDiffs granular inline diff data returned by `getTextDiff`
 * @property {import('./attributes-diffing.js').AttributesDiff|null} attrsDiff attribute-level changes between the old and new paragraph nodes
 */

/**
 * Combined type representing every diff payload produced by `diffParagraphs`.
 * @typedef {AddedParagraphDiff|DeletedParagraphDiff|ModifiedParagraphDiff} ParagraphDiff
 */

/**
 * Runs a paragraph-level diff using Myers algorithm to align paragraphs that move, get edited, or are added/removed.
 * The extra bookkeeping around the raw diff ensures that downstream consumers can map operations back to paragraph
 * positions.
 * @param {Array<object>} oldParagraphs
 * @param {Array<object>} newParagraphs
 * @returns {Array<ParagraphDiff>}
 */
export function diffParagraphs(oldParagraphs, newParagraphs) {
  // Run Myers diff on the paragraph level to get a base set of operations.
  const rawOperations = myersDiff(oldParagraphs, newParagraphs, paragraphComparator);
  const operations = reorderParagraphOperations(rawOperations);

  // Build a step-by-step operation list with paragraph indices for easier processing.
  let oldIdx = 0;
  let newIdx = 0;
  const steps = [];
  for (const op of operations) {
    if (op === 'equal') {
      steps.push({ type: 'equal', oldIdx, newIdx });
      oldIdx += 1;
      newIdx += 1;
    } else if (op === 'delete') {
      steps.push({ type: 'delete', oldIdx });
      oldIdx += 1;
    } else if (op === 'insert') {
      steps.push({ type: 'insert', newIdx });
      newIdx += 1;
    }
  }

  // Process the operation steps into a normalized diff output.
  const diffs = [];
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];

    switch (step.type) {
      case 'equal':
        const oldPara = oldParagraphs[step.oldIdx];
        const newPara = newParagraphs[step.newIdx];
        if (
          oldPara.text !== newPara.text ||
          JSON.stringify(oldPara.node.attrs) !== JSON.stringify(newPara.node.attrs)
        ) {
          // Text or attributes changed within the same paragraph
          const diff = buildModifiedParagraphDiff(oldPara, newPara);
          if (diff) {
            diffs.push(diff);
          }
        }
        break;

      case 'delete':
        const nextStep = steps[i + 1];

        // Check if the next step is an insertion that can be paired as a modification.
        if (nextStep?.type === 'insert') {
          const oldPara = oldParagraphs[step.oldIdx];
          const newPara = newParagraphs[nextStep.newIdx];
          if (canTreatAsModification(oldPara, newPara)) {
            const diff = buildModifiedParagraphDiff(oldPara, newPara);
            if (diff) {
              diffs.push(diff);
            }
            i += 1; // Skip the next insert step as it's paired
          } else {
            // The paragraph that was deleted is significantly different from any nearby insertions; treat as a deletion.
            diffs.push(buildDeletedParagraphDiff(oldParagraphs[step.oldIdx]));
          }
        } else {
          // No matching insertion; treat as a deletion.
          diffs.push(buildDeletedParagraphDiff(oldParagraphs[step.oldIdx]));
        }
        break;

      case 'insert':
        diffs.push(buildAddedParagraphDiff(newParagraphs[step.newIdx]));
        break;
    }
  }

  return diffs;
}

/**
 * Compares two paragraphs for identity based on paraId or text content so the diff can prioritize logical matches.
 * This prevents the algorithm from treating the same paragraph as a deletion+insertion when the paraId or text proves
 * they refer to the same logical node, which in turn keeps visual diffs stable.
 * @param {{node: Node, text: string}} oldParagraph
 * @param {{node: Node, text: string}} newParagraph
 * @returns {boolean}
 */
function paragraphComparator(oldParagraph, newParagraph) {
  const oldId = oldParagraph?.node?.attrs?.paraId;
  const newId = newParagraph?.node?.attrs?.paraId;
  if (oldId && newId && oldId === newId) {
    return true;
  }
  return oldParagraph?.text === newParagraph?.text;
}

/**
 * Builds a normalized payload describing a paragraph addition, ensuring all consumers receive the same metadata shape.
 * @param {{node: Node, pos: number, text: string}} paragraph
 * @returns {AddedParagraphDiff}
 */
function buildAddedParagraphDiff(paragraph) {
  return {
    type: 'added',
    node: paragraph.node,
    text: paragraph.text,
    pos: paragraph.pos,
  };
}

/**
 * Builds a normalized payload describing a paragraph deletion so diff consumers can show removals with all context.
 * @param {{node: Node, pos: number}} paragraph
 * @returns {DeletedParagraphDiff}
 */
function buildDeletedParagraphDiff(paragraph) {
  return {
    type: 'deleted',
    node: paragraph.node,
    oldText: paragraph.text,
    pos: paragraph.pos,
  };
}

/**
 * Builds the payload for a paragraph modification, including text-level diffs, so renderers can highlight edits inline.
 * @param {{node: Node, pos: number, text: string, resolvePosition: Function}} oldParagraph
 * @param {{node: Node, pos: number, text: string, resolvePosition: Function}} newParagraph
 * @returns {ModifiedParagraphDiff}
 */
function buildModifiedParagraphDiff(oldParagraph, newParagraph) {
  const textDiffs = getTextDiff(
    oldParagraph.text,
    newParagraph.text,
    oldParagraph.resolvePosition,
    newParagraph.resolvePosition,
  );

  const attrsDiff = getAttributesDiff(oldParagraph.node.attrs, newParagraph.node.attrs);

  if (textDiffs.length === 0 && !attrsDiff) {
    return null;
  }

  return {
    type: 'modified',
    oldText: oldParagraph.text,
    newText: newParagraph.text,
    pos: oldParagraph.pos,
    textDiffs,
    attrsDiff,
  };
}

/**
 * Decides whether a delete/insert pair should be reinterpreted as a modification to minimize noisy diff output.
 * This heuristic limits the number of false-positive additions/deletions, which keeps reviewers focused on real edits.
 * @param {{node: Node, text: string}} oldParagraph
 * @param {{node: Node, text: string}} newParagraph
 * @returns {boolean}
 */
function canTreatAsModification(oldParagraph, newParagraph) {
  if (paragraphComparator(oldParagraph, newParagraph)) {
    return true;
  }

  const oldText = oldParagraph?.text ?? '';
  const newText = newParagraph?.text ?? '';
  const maxLength = Math.max(oldText.length, newText.length);
  if (maxLength < MIN_LENGTH_FOR_SIMILARITY) {
    return false;
  }

  const similarity = getTextSimilarityScore(oldText, newText);

  return similarity >= SIMILARITY_THRESHOLD;
}

/**
 * Scores the similarity between two text strings so the diff can decide if they represent the same conceptual paragraph.
 * @param {string} oldText
 * @param {string} newText
 * @returns {number}
 */
function getTextSimilarityScore(oldText, newText) {
  if (!oldText && !newText) {
    return 1;
  }

  const distance = levenshteinDistance(oldText, newText);
  const maxLength = Math.max(oldText.length, newText.length) || 1;
  return 1 - distance / maxLength;
}

/**
 * Normalizes Myers diff operations for paragraph comparisons so consecutive replacements are easier to classify.
 * Myers tends to emit all deletes before inserts when a paragraph is replaced, even if it's a one-for-one swap, and
 * that pattern would otherwise hide opportunities to treat those operations as modifications. Reordering the list here
 * ensures higher-level diff logic stays simple while avoiding side effects for other consumers of the same operations.
 * @param {Array<'equal'|'delete'|'insert'>} operations
 * @returns {Array<'equal'|'delete'|'insert'>}
 */
function reorderParagraphOperations(operations) {
  const normalized = [];

  for (let i = 0; i < operations.length; i += 1) {
    const op = operations[i];
    if (op !== 'delete') {
      normalized.push(op);
      continue;
    }

    let deleteCount = 0;
    while (i < operations.length && operations[i] === 'delete') {
      deleteCount += 1;
      i += 1;
    }

    let insertCount = 0;
    let insertCursor = i;
    while (insertCursor < operations.length && operations[insertCursor] === 'insert') {
      insertCount += 1;
      insertCursor += 1;
    }

    const pairCount = Math.min(deleteCount, insertCount);
    for (let k = 0; k < pairCount; k += 1) {
      normalized.push('delete', 'insert');
    }
    for (let k = pairCount; k < deleteCount; k += 1) {
      normalized.push('delete');
    }
    for (let k = pairCount; k < insertCount; k += 1) {
      normalized.push('insert');
    }

    i = insertCursor - 1;
  }

  return normalized;
}
