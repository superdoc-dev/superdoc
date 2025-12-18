import { Node } from 'prosemirror-model';
import { v4 as uuidv4 } from 'uuid';

/**
 * Computes paragraph-level diffs between two ProseMirror documents, returning inserts, deletes and text modifications.
 * @param {Node} oldPmDoc - The previous ProseMirror document.
 * @param {Node} newPmDoc - The updated ProseMirror document.
 * @returns {Array<object>} List of diff objects describing added, deleted or modified paragraphs.
 */
export function computeDiff(oldPmDoc, newPmDoc) {
  const diffs = [];

  // 1. Extract all paragraphs from old document and create a map using their IDs
  const oldParagraphsMap = extractParagraphs(oldPmDoc);

  // 2. Extract all paragraphs from new document and create a map using their IDs
  const newParagraphsMap = extractParagraphs(newPmDoc);

  // 3. Compare paragraphs in old and new documents
  let insertPos = 0;
  newParagraphsMap.forEach((newPara, paraId) => {
    const oldPara = oldParagraphsMap.get(paraId);
    if (!oldPara) {
      diffs.push({
        type: 'added',
        paraId,
        node: newPara.node,
        text: newPara.node.textContent,
        pos: insertPos,
      });
      return;
    } else if (oldPara.node.textContent !== newPara.node.textContent) {
      const oldTextContent = getTextContent(oldPara.node, oldPara.pos);
      const newTextContent = getTextContent(newPara.node, newPara.pos);
      const textDiffs = getTextDiff(oldPara.node.textContent, newPara.node.textContent, oldTextContent.resolvePosition);
      diffs.push({
        type: 'modified',
        paraId,
        oldText: oldTextContent.text,
        newText: newTextContent.text,
        pos: oldPara.pos,
        textDiffs,
      });
    }
    insertPos = oldPara.pos + oldPara.node.nodeSize;
  });

  // 4. Identify deleted paragraphs
  oldParagraphsMap.forEach((oldPara, paraId) => {
    if (!newParagraphsMap.has(paraId)) {
      diffs.push({ type: 'deleted', paraId, node: oldPara.node, pos: oldPara.pos });
    }
  });

  return diffs;
}

/**
 * Collects paragraphs from a ProseMirror document and returns them by paragraph ID.
 * @param {Node} pmDoc - ProseMirror document to scan.
 * @returns {Map<string, {node: Node, pos: number}>} Map keyed by paraId containing paragraph nodes and positions.
 */
export function extractParagraphs(pmDoc) {
  const paragraphMap = new Map();
  pmDoc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      paragraphMap.set(node.attrs?.paraId ?? uuidv4(), { node, pos });
      return false; // Do not descend further
    }
  });
  return paragraphMap;
}

/**
 * Flattens a paragraph node into text and provides a resolver to map string indices back to document positions.
 * @param {Node} paragraph - Paragraph node to flatten.
 * @param {number} [paragraphPos=0] - Position of the paragraph in the document.
 * @returns {{text: string, resolvePosition: (index: number) => number|null}} Concatenated text and position resolver.
 */
export function getTextContent(paragraph, paragraphPos = 0) {
  let text = '';
  const segments = [];

  paragraph.nodesBetween(
    0,
    paragraph.content.size,
    (node, pos) => {
      let nodeText = '';

      if (node.isText) {
        nodeText = node.text;
      } else if (node.isLeaf && node.type.spec.leafText) {
        nodeText = node.type.spec.leafText(node);
      }

      if (!nodeText) {
        return;
      }

      const start = text.length;
      const end = start + nodeText.length;

      segments.push({ start, end, pos });
      text += nodeText;
    },
    0,
  );

  const resolvePosition = (index) => {
    if (index < 0 || index > text.length) {
      return null;
    }

    for (const segment of segments) {
      if (index >= segment.start && index < segment.end) {
        return paragraphPos + 1 + segment.pos + (index - segment.start);
      }
    }

    // If index points to the end of the string, return the paragraph end
    return paragraphPos + 1 + paragraph.content.size;
  };

  return { text, resolvePosition };
}

/**
 * Computes text-level additions and deletions between two strings using Myers diff algorithm, mapping back to document positions.
 * @param {string} oldText - Source text.
 * @param {string} newText - Target text.
 * @param {(index: number) => number|null} positionResolver - Maps string indices to document positions.
 * @returns {Array<object>} List of addition/deletion ranges with document positions and text content.
 */
export function getTextDiff(oldText, newText, positionResolver) {
  const oldLen = oldText.length;
  const newLen = newText.length;

  if (oldLen === 0 && newLen === 0) {
    return [];
  }

  // Myers diff bookkeeping: +2 padding keeps diagonal lookups in bounds.
  const max = oldLen + newLen;
  const size = 2 * max + 3;
  const offset = max + 1;
  const v = new Array(size).fill(-1);
  v[offset + 1] = 0;

  const trace = [];
  let foundPath = false;

  for (let d = 0; d <= max && !foundPath; d += 1) {
    for (let k = -d; k <= d; k += 2) {
      const index = offset + k;
      let x;

      if (k === -d || (k !== d && v[index - 1] < v[index + 1])) {
        x = v[index + 1];
      } else {
        x = v[index - 1] + 1;
      }

      let y = x - k;
      while (x < oldLen && y < newLen && oldText[x] === newText[y]) {
        x += 1;
        y += 1;
      }

      v[index] = x;

      if (x >= oldLen && y >= newLen) {
        foundPath = true;
        break;
      }
    }
    trace.push(v.slice());
  }

  const operations = backtrackMyers(trace, oldLen, newLen, offset);
  return buildDiffFromOperations(operations, oldText, newText, positionResolver);
}

/**
 * Reconstructs the shortest edit script by walking the previously recorded V vectors.
 *
 * @param {Array<number[]>} trace - Snapshot of diagonal furthest-reaching points per edit distance.
 * @param {number} oldLen - Length of the original string.
 * @param {number} newLen - Length of the target string.
 * @param {number} offset - Offset applied to diagonal indexes to keep array lookups positive.
 * @returns {Array<'equal'|'delete'|'insert'>} Concrete step-by-step operations.
 */
function backtrackMyers(trace, oldLen, newLen, offset) {
  const operations = [];
  let x = oldLen;
  let y = newLen;

  for (let d = trace.length - 1; d > 0; d -= 1) {
    const v = trace[d - 1];
    const k = x - y;
    const index = offset + k;

    let prevK;
    if (k === -d || (k !== d && v[index - 1] < v[index + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevIndex = offset + prevK;
    const prevX = v[prevIndex];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      x -= 1;
      y -= 1;
      operations.push('equal');
    }

    if (x === prevX) {
      y -= 1;
      operations.push('insert');
    } else {
      x -= 1;
      operations.push('delete');
    }
  }

  while (x > 0 && y > 0) {
    x -= 1;
    y -= 1;
    operations.push('equal');
  }

  while (x > 0) {
    x -= 1;
    operations.push('delete');
  }

  while (y > 0) {
    y -= 1;
    operations.push('insert');
  }

  return operations.reverse();
}

/**
 * Groups edit operations into contiguous additions/deletions and maps them to document positions.
 *
 * @param {Array<'equal'|'delete'|'insert'>} operations - Raw operation list produced by the backtracked Myers path.
 * @param {string} oldText - Source text.
 * @param {string} newText - Target text.
 * @param {(index: number) => number|null} positionResolver - Maps string indexes to ProseMirror positions.
 * @returns {Array<object>} Final diff payload matching the existing API surface.
 */
function buildDiffFromOperations(operations, oldText, newText, positionResolver) {
  const diffs = [];
  let run = null;
  let oldIdx = 0;
  let newIdx = 0;
  let insertionAnchor = 0;

  const flushRun = () => {
    if (!run || run.text.length === 0) {
      run = null;
      return;
    }

    if (run.type === 'delete') {
      const startIdx = positionResolver(run.startOldIdx);
      const endIdx = positionResolver(run.endOldIdx);
      diffs.push({
        type: 'deletion',
        startIdx,
        endIdx,
        text: run.text,
      });
    } else if (run.type === 'insert') {
      const startIdx = positionResolver(run.referenceOldIdx);
      const endIdx = positionResolver(run.referenceOldIdx);
      diffs.push({
        type: 'addition',
        startIdx,
        endIdx,
        text: run.text,
      });
    }

    run = null;
  };

  for (const op of operations) {
    if (op === 'equal') {
      flushRun();
      oldIdx += 1;
      newIdx += 1;
      insertionAnchor = oldIdx;
      continue;
    }

    if (!run || run.type !== op) {
      flushRun();
      if (op === 'delete') {
        run = { type: 'delete', startOldIdx: oldIdx, endOldIdx: oldIdx, text: '' };
      } else if (op === 'insert') {
        run = { type: 'insert', referenceOldIdx: insertionAnchor, text: '' };
      }
    }

    if (op === 'delete') {
      run.text += oldText[oldIdx];
      oldIdx += 1;
      run.endOldIdx = oldIdx;
    } else if (op === 'insert') {
      run.text += newText[newIdx];
      newIdx += 1;
    }
  }

  flushRun();

  return diffs;
}
