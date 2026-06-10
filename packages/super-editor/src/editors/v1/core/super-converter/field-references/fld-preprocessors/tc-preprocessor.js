/**
 * Processes a TC (table of contents entry) instruction and creates an `sd:tableOfContentsEntry` node.
 *
 * SD-3227: `w:bookmarkStart`/`w:bookmarkEnd` runs that sit inside the TC
 * field's instruction (e.g. heading `_Toc...` targets) are lifted back out
 * as siblings of the synthesized entry. The PM `tableOfContentsEntry` node
 * is `atom: true`, so any bookmark left inside it would be invisible to
 * `buildPositionMap` and `bookmarkStartNodeToBlocks`, leaving TOC
 * navigation with no resolvable target.
 *
 * The hoist preserves each marker's original relative order. Bookmark
 * markers that appear before the first non-bookmark node go before the
 * entry; markers that appear once non-bookmark content has been seen go
 * after the entry. This keeps `w:id`-matched start/end pairs intact and
 * avoids the crossed-range corruption you'd get from bucketing all starts
 * before and all ends after the entry.
 *
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes to combine.
 * @param {string} instrText The instruction text.
 * @param {{ instructionTokens?: Array<{type: string, text?: string}> | null }} [options]
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */
export function preProcessTcInstruction(nodesToCombine, instrText, options = {}) {
  const before = [];
  const after = [];
  const entryElements = [];
  const instructionTokens = options.instructionTokens ?? null;

  let seenContent = false;
  for (const node of nodesToCombine) {
    const isBookmarkMarker = node?.name === 'w:bookmarkStart' || node?.name === 'w:bookmarkEnd';
    if (isBookmarkMarker) {
      (seenContent ? after : before).push(node);
    } else {
      seenContent = true;
      entryElements.push(node);
    }
  }
  return [
    ...before,
    {
      name: 'sd:tableOfContentsEntry',
      type: 'element',
      attributes: {
        instruction: instrText,
        ...(instructionTokens ? { instructionTokens } : {}),
      },
      elements: entryElements,
    },
    ...after,
  ];
}
