import { getBlockIndex } from '../../document-api-adapters/helpers/index-cache.js';
import { toBlockAddress } from '../../document-api-adapters/helpers/node-address-resolver.js';
import { syncTocBookmarks } from '../../document-api-adapters/helpers/toc-bookmark-sync.js';
import { prepareTableOfContentsInsertion } from '../../document-api-adapters/plan-engine/toc-wrappers.js';

const canInsertTableOfContentsAt = (insertPos, editor) => {
  const tocType = editor.schema?.nodes?.tableOfContents;
  const doc = editor.state?.doc;
  if (!tocType || typeof doc?.resolve !== 'function') return true;

  try {
    const $pos = doc.resolve(insertPos);
    if (typeof $pos.parent?.canReplaceWith !== 'function') return true;
    return $pos.parent.canReplaceWith($pos.index(), $pos.index(), tocType);
  } catch {
    return false;
  }
};

const canInsertTableOfContentsAfter = (candidate, editor) => {
  const pos = candidate.end ?? candidate.pos + candidate.node.nodeSize;
  return canInsertTableOfContentsAt(pos, editor);
};

const canInsertTableOfContentsBefore = (candidate, editor) => canInsertTableOfContentsAt(candidate.pos, editor);

/** @param {import('prosemirror-model').Node} doc */
const collectTopLevelCandidates = (candidates, doc) => {
  const topLevelPositions = new Set();
  let pos = 1;
  for (let i = 0; i < doc.childCount; i++) {
    topLevelPositions.add(pos);
    pos += doc.child(i).nodeSize;
  }
  return candidates.filter((candidate) => topLevelPositions.has(candidate.pos)).sort((a, b) => a.pos - b.pos);
};

const isSelectionAtDocumentStart = (editor, firstTopLevel) => {
  const from = editor.state.selection.from;
  return from <= firstTopLevel.pos + 1;
};

/**
 * Resolve `create.tableOfContents` placement from the current selection.
 * @param {import('../../core/Editor.js').Editor} editor
 * @returns {import('@superdoc/document-api').CreateTableOfContentsInput['at']}
 */
export function resolveTableOfContentsCreateLocation(editor) {
  const pos = editor.state.selection.from;
  const index = getBlockIndex(editor);
  const doc = editor.state?.doc;
  const firstTopLevel =
    doc && typeof doc.childCount === 'number' && typeof doc.child === 'function'
      ? collectTopLevelCandidates(index.candidates, doc)[0]
      : null;

  if (firstTopLevel && isSelectionAtDocumentStart(editor, firstTopLevel)) {
    if (canInsertTableOfContentsBefore(firstTopLevel, editor)) {
      return { kind: 'before', target: toBlockAddress(firstTopLevel) };
    }
  }

  const containing = index.candidates.filter((c) => pos >= c.pos && pos < (c.end ?? c.pos + c.node.nodeSize));
  const anchor =
    containing.length > 0
      ? [...containing]
          .sort((a, b) => a.node.nodeSize - b.node.nodeSize)
          .find((candidate) => canInsertTableOfContentsAfter(candidate, editor))
      : null;

  return anchor ? { kind: 'after', target: toBlockAddress(anchor) } : { kind: 'documentEnd' };
}

/**
 * Full-dispatch insert at the current selection (toolbar, shortcuts, etc.).
 * Applies the TOC transaction, then synchronously syncs heading bookmarks — same
 * orchestration as `createTableOfContentsWrapper` in toc-wrappers.ts.
 *
 * @param {import('../../core/Editor.js').Editor} editor
 * @returns {boolean}
 */
export function insertTableOfContentsAtSelection(editor) {
  let prepared;
  try {
    const at = resolveTableOfContentsCreateLocation(editor);
    prepared = prepareTableOfContentsInsertion(editor, { at });
  } catch {
    return false;
  }

  const inserted = editor.commands.insertTableOfContentsAt({
    pos: prepared.pos,
    instruction: prepared.instruction,
    sdBlockId: prepared.sdBlockId,
    content: prepared.content,
    ...(prepared.rightAlignPageNumbers !== undefined ? { rightAlignPageNumbers: prepared.rightAlignPageNumbers } : {}),
  });

  if (!inserted) {
    return false;
  }

  syncTocBookmarks(editor, prepared.sources);
  return true;
}
