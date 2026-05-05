/**
 * `ui.viewport.positionAt({ x, y })` helper. Resolves a viewport
 * coordinate to a {@link SelectionPoint} / {@link SelectionTarget}
 * pair on the routed editor's PM document. The natural pair to
 * `entityAt`: while `entityAt` answers "what entity is under this
 * point?", `positionAt` answers "what caret position is under this
 * point?" — the missing primitive that lets right-click menus offer
 * actions like "Paste here" / "Insert clause at this point" without
 * dispatching against the user's previous selection.
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { SelectionPoint, SelectionTarget, StoryLocator } from '@superdoc/document-api';
import type { Editor } from '../editors/v1/core/Editor.js';
import { pmPositionToTextOffset } from '../editors/v1/document-api-adapters/helpers/text-offset-resolver.js';
import type { ViewportPositionHit } from './types.js';

interface HostEditor {
  presentationEditor?: {
    posAtCoords?(coords: { clientX: number; clientY: number }): { pos: number; inside: number } | null;
    visibleHost?: HTMLElement;
    getActiveStoryLocator?(): StoryLocator | null;
  } | null;
}

/**
 * Resolve a viewport (x, y) coordinate to the caret position under
 * that point. Returns `null` for points outside the painted host or
 * when no editor is mounted.
 *
 * `hostEditor` is the controller's host editor (where the painted
 * host and the coord-to-position helper live). `routedEditor` is the
 * editor whose PM document the caret belongs to — for clicks inside a
 * header/footer/footnote story while focus is in that surface, the
 * routed editor is the story editor; otherwise it is the host.
 */
export function resolvePositionAt(
  hostEditor: (Editor & HostEditor) | null,
  routedEditor: Editor | null,
  x: number,
  y: number,
): ViewportPositionHit | null {
  if (!hostEditor || !routedEditor) return null;
  const presentation = hostEditor.presentationEditor;
  if (!presentation || typeof presentation.posAtCoords !== 'function') return null;

  // Scope to this controller's painted host. `posAtCoords` itself is
  // already painter-scoped (returns null for points outside the
  // layout), but checking the host upfront also avoids running the
  // coord lookup for clicks that obviously aren't ours, e.g. on a
  // sidebar that happens to overlap the painted page.
  const host = presentation.visibleHost;
  if (host && typeof document !== 'undefined') {
    const elAtPoint = document.elementFromPoint?.(x, y);
    if (elAtPoint && !host.contains(elAtPoint)) return null;
  }

  let result: { pos: number; inside: number } | null = null;
  try {
    result = presentation.posAtCoords({ clientX: x, clientY: y });
  } catch {
    return null;
  }
  if (!result) return null;

  const block = findContainingTextBlock(routedEditor.state?.doc as ProseMirrorNode | undefined, result.pos);
  if (!block) return null;

  const offset = pmPositionToTextOffset(block.node, block.pos, result.pos);
  // When the routed editor is a story (header/footer/note), the blockId
  // resolves against the story's PM doc. Without `story`, downstream
  // doc-api ops (`insert`, `replace`, etc.) default to body and fail to
  // locate the block. Mirrors the locator the host editor would use when
  // routing operations to the active story.
  const story = readActiveStoryLocator(hostEditor);
  const point: SelectionPoint = story
    ? { kind: 'text', blockId: block.blockId, offset, story }
    : { kind: 'text', blockId: block.blockId, offset };
  const target: SelectionTarget = story
    ? { kind: 'selection', start: point, end: point, story }
    : { kind: 'selection', start: point, end: point };
  return { point, target };
}

function readActiveStoryLocator(hostEditor: Editor & HostEditor): StoryLocator | null {
  const presentation = hostEditor.presentationEditor;
  if (!presentation || typeof presentation.getActiveStoryLocator !== 'function') return null;
  try {
    return presentation.getActiveStoryLocator() ?? null;
  } catch {
    return null;
  }
}

interface BlockMatch {
  node: ProseMirrorNode;
  pos: number;
  blockId: string;
}

/**
 * Walk the doc to find the textblock that contains `pmPos`. Same
 * shape `collectTextSegments` uses for selections, but specialized
 * for a single point so we don't allocate a segments array.
 */
function findContainingTextBlock(doc: ProseMirrorNode | undefined, pmPos: number): BlockMatch | null {
  if (!doc) return null;
  let match: BlockMatch | null = null;
  doc.descendants((node, pos) => {
    if (match) return false;
    if (!node.isTextblock) return true;
    const blockStart = pos;
    const blockEnd = pos + node.nodeSize;
    if (pmPos < blockStart || pmPos > blockEnd) return false;
    const blockId = readBlockId(node);
    if (!blockId) return false;
    match = { node, pos, blockId };
    return false;
  });
  return match;
}

function readBlockId(node: ProseMirrorNode): string | null {
  // Match the canonical fallback used by `selection-info-resolver.ts`:
  // paragraphs (the most common textblock) only set `sdBlockId`; reading
  // `attrs.id` alone returns null for every paragraph and silently
  // bricks `positionAt` for the bulk of click targets.
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  const id = attrs.sdBlockId ?? attrs.id ?? attrs.blockId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}
