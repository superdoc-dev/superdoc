/**
 * Shared identity for rendered footnote/endnote targets (SD-3400).
 *
 * A note painted at the page bottom is addressed by `{ storyType, noteId }`,
 * parsed from its fragment block id. These helpers were previously duplicated
 * in EditorInputManager and PresentationEditor; this module is the single
 * source of truth for the block-id ↔ note-target mapping.
 *
 * Block-id shapes:
 * - `footnote-{id}-{hash}` / `endnote-{id}-{hash}` — regular note fragments
 * - `__sd_semantic_footnote-{id}-{hash}` — semantic-flow footnote blocks
 */

import { isSemanticFootnoteBlockId } from '../semantic-flow-constants.js';

export type RenderedNoteTarget = {
  storyType: 'footnote' | 'endnote';
  noteId: string;
};

/** True when a fragment block id belongs to rendered note content. */
export function isRenderedNoteBlockId(blockId: string): boolean {
  return (
    typeof blockId === 'string' &&
    (blockId.startsWith('footnote-') || blockId.startsWith('endnote-') || isSemanticFootnoteBlockId(blockId))
  );
}

/** Parses a fragment block id into its note target, or null for non-note ids. */
export function parseRenderedNoteTarget(blockId: string): RenderedNoteTarget | null {
  if (typeof blockId !== 'string' || blockId.length === 0) {
    return null;
  }

  if (blockId.startsWith('footnote-')) {
    const noteId = blockId.slice('footnote-'.length).split('-')[0] ?? '';
    return noteId ? { storyType: 'footnote', noteId } : null;
  }

  if (blockId.startsWith('__sd_semantic_footnote-')) {
    const noteId = blockId.slice('__sd_semantic_footnote-'.length).split('-')[0] ?? '';
    return noteId ? { storyType: 'footnote', noteId } : null;
  }

  if (blockId.startsWith('endnote-')) {
    const noteId = blockId.slice('endnote-'.length).split('-')[0] ?? '';
    return noteId ? { storyType: 'endnote', noteId } : null;
  }

  return null;
}

export function isSameRenderedNoteTarget(
  left: RenderedNoteTarget | null | undefined,
  right: RenderedNoteTarget | null | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }

  return left.storyType === right.storyType && left.noteId === right.noteId;
}

/**
 * Fragment block-id prefixes that belong to a specific note target. Used to
 * match a target against painted `[data-block-id]` elements.
 */
export function renderedNoteBlockIdPrefixes(target: RenderedNoteTarget): string[] {
  return [`${target.storyType}-${target.noteId}-`, `__sd_semantic_${target.storyType}-${target.noteId}-`];
}
