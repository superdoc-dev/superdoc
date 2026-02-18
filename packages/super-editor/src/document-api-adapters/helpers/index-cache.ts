import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import { buildInlineIndex, type InlineIndex } from './inline-address-resolver.js';
import { buildBlockIndex, type BlockIndex } from './node-address-resolver.js';

type CacheEntry = {
  doc: ProseMirrorNode;
  blockIndex: BlockIndex;
  inlineIndex: InlineIndex | null;
};

const cacheByEditor = new WeakMap<Editor, CacheEntry>();

function createCacheEntry(editor: Editor): CacheEntry {
  return {
    doc: editor.state.doc,
    blockIndex: buildBlockIndex(editor),
    inlineIndex: null,
  };
}

function getCacheEntry(editor: Editor): CacheEntry {
  const doc = editor.state.doc;
  const existing = cacheByEditor.get(editor);
  if (existing && existing.doc === doc) return existing;

  const next = createCacheEntry(editor);
  cacheByEditor.set(editor, next);
  return next;
}

/**
 * Returns the cached block index for the editor's current document.
 * Rebuilds automatically when the document snapshot changes.
 *
 * @param editor - The editor instance.
 * @returns The block-level positional index.
 */
export function getBlockIndex(editor: Editor): BlockIndex {
  return getCacheEntry(editor).blockIndex;
}

/**
 * Returns the cached inline index for the editor's current document.
 * Lazily built on first access; rebuilt when the document snapshot changes.
 *
 * @param editor - The editor instance.
 * @returns The inline-level positional index.
 */
export function getInlineIndex(editor: Editor): InlineIndex {
  const entry = getCacheEntry(editor);
  if (!entry.inlineIndex) {
    entry.inlineIndex = buildInlineIndex(editor, entry.blockIndex);
  }
  return entry.inlineIndex;
}

/**
 * Removes cached indexes for the given editor instance.
 *
 * @param editor - The editor whose cache entry should be cleared.
 */
export function clearIndexCache(editor: Editor): void {
  cacheByEditor.delete(editor);
}
