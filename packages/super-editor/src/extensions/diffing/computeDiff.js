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
      const textDiffs = getLCSdiff(oldPara.node.textContent, newPara.node.textContent, oldTextContent.resolvePosition);
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
 * Computes text-level additions and deletions between two strings using LCS, mapping back to document positions.
 * @param {string} oldText - Source text.
 * @param {string} newText - Target text.
 * @param {(index: number) => number|null} positionResolver - Maps string indices to document positions.
 * @returns {Array<object>} List of addition/deletion ranges with document positions and text content.
 */
export function getLCSdiff(oldText, newText, positionResolver) {
  const oldLen = oldText.length;
  const newLen = newText.length;

  // Build LCS length table
  const lcs = Array.from({ length: oldLen + 1 }, () => Array(newLen + 1).fill(0));
  for (let i = oldLen - 1; i >= 0; i -= 1) {
    for (let j = newLen - 1; j >= 0; j -= 1) {
      if (oldText[i] === newText[j]) {
        lcs[i][j] = lcs[i + 1][j + 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
  }

  // Reconstruct the LCS path to figure out unmatched segments
  const matches = [];
  for (let i = 0, j = 0; i < oldLen && j < newLen; ) {
    if (oldText[i] === newText[j]) {
      matches.push({ oldIdx: i, newIdx: j });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }

  const diffs = [];
  let prevOld = 0;
  let prevNew = 0;

  for (const { oldIdx, newIdx } of matches) {
    if (oldIdx > prevOld) {
      diffs.push({
        type: 'deletion',
        startIdx: positionResolver(prevOld),
        endIdx: positionResolver(oldIdx),
        text: oldText.slice(prevOld, oldIdx),
      });
    }
    if (newIdx > prevNew) {
      diffs.push({
        type: 'addition',
        startIdx: positionResolver(prevOld),
        endIdx: positionResolver(prevOld),
        text: newText.slice(prevNew, newIdx),
      });
    }
    prevOld = oldIdx + 1;
    prevNew = newIdx + 1;
  }

  if (prevOld < oldLen) {
    diffs.push({
      type: 'deletion',
      startIdx: positionResolver(prevOld),
      endIdx: positionResolver(oldLen - 1),
      text: oldText.slice(prevOld),
    });
  }
  if (prevNew < newLen) {
    diffs.push({
      type: 'addition',
      startIdx: positionResolver(prevOld),
      endIdx: positionResolver(prevOld),
      text: newText.slice(prevNew),
    });
  }

  return diffs;
}
