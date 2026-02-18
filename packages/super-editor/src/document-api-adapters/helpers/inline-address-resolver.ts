import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import type { BlockIndex } from './node-address-resolver.js';
import type { InlineAnchor, InlineNodeType, NodeAddress, NodeType } from '@superdoc/document-api';
import { CommentMarkName } from '../../extensions/comment/comments-constants.js';

const LINK_MARK_NAME = 'link';
const COMMENT_MARK_NAME = CommentMarkName;

const SUPPORTED_INLINE_TYPES: ReadonlySet<InlineNodeType> = new Set<InlineNodeType>([
  'run',
  'bookmark',
  'comment',
  'hyperlink',
  'sdt',
  'image',
  'footnoteRef',
  'tab',
  'lineBreak',
]);

/** A single inline-level element (mark span, atom, or range marker) resolved to block-relative offsets. */
export type InlineCandidate = {
  nodeType: InlineNodeType;
  anchor: InlineAnchor;
  blockId: string;
  pos: number;
  end: number;
  node?: ProseMirrorNode;
  mark?: Mark;
  attrs?: Record<string, unknown>;
};

/** Position-sorted index of inline candidates with type and anchor lookup maps. */
export type InlineIndex = {
  candidates: InlineCandidate[];
  byType: Map<InlineNodeType, InlineCandidate[]>;
  byKey: Map<string, InlineCandidate>;
};

/**
 * Returns `true` if `nodeType` is an inline type recognised by the inline adapter.
 *
 * @param nodeType - A node type string.
 * @returns Whether the type is an {@link InlineNodeType}.
 */
export function isInlineQueryType(nodeType: NodeType): nodeType is InlineNodeType {
  return SUPPORTED_INLINE_TYPES.has(nodeType as InlineNodeType);
}

function stableStringify(value: unknown): string {
  if (value == null) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, val]) => `${key}:${stableStringify(val)}`).join(',')}}`;
}

function markKey(mark: Mark): string {
  return `${mark.type.name}:${stableStringify(mark.attrs ?? {})}`;
}

function mapInlineNodeType(node: ProseMirrorNode): InlineNodeType | undefined {
  switch (node.type.name) {
    case 'run':
      return 'run';
    case 'image':
      return 'image';
    case 'tab':
      return 'tab';
    case 'lineBreak':
    case 'hardBreak':
    case 'hard_break':
      return 'lineBreak';
    case 'footnoteReference':
      return 'footnoteRef';
    case 'structuredContent':
      return 'sdt';
    default:
      return undefined;
  }
}

function makeAnchor(blockId: string, start: number, end: number): InlineAnchor {
  return {
    start: { blockId, offset: start },
    end: { blockId, offset: end },
  };
}

function inlineKey(nodeType: InlineNodeType, anchor: InlineAnchor): string {
  return `${nodeType}:${anchor.start.blockId}:${anchor.start.offset}:${anchor.end.offset}`;
}

type ActiveMark = {
  mark: Mark;
  startOffset: number;
  startPos: number;
};

/**
 * Mutable state carried through the block-content walker.
 *
 * **Purpose**: Walks ProseMirror block content to build an index of inline
 * elements (marks, atoms, range markers) with block-relative text offsets.
 *
 * **Offset model**: Text nodes contribute their UTF-16 length. Leaf atoms
 * (images, tabs, breaks) contribute 1. Block separators (between sibling
 * blocks) contribute 1. Zero-width range delimiters (bookmarkEnd,
 * commentRangeStart, commentRangeEnd) contribute 0. This mirrors ProseMirror's
 * `textBetween(from, to, '\n', '\ufffc')` model.
 *
 * **Mark lifecycle**: `syncMarks()` opens/closes mark spans when the active
 * mark set changes between nodes. All open marks auto-close at block
 * boundaries via `closeAllMarks()`.
 *
 * **Range markers**: Bookmark and comment ranges use start/end element pairs.
 * Starts are buffered in maps (`bookmarkStarts`, `commentRangeStarts`); ends
 * close the range and emit a candidate. Unpaired starts/ends are discarded.
 *
 * **Deduplication**: Comments found via marks and via range markers are
 * deduplicated via `commentIdsWithMarks` — marks take priority.
 */
export type BlockWalkState = {
  blockId: string;
  offset: number;
  candidates: InlineCandidate[];
  activeMarks: Map<string, ActiveMark>;
  bookmarkStarts: Map<string, { offset: number; pos: number; attrs: Record<string, unknown> }>;
  commentRangeStarts: Map<string, { offset: number; pos: number; attrs: Record<string, unknown> }>;
  commentIdsWithMarks: Set<string>;
};

function createBlockWalkState(blockId: string, candidates: InlineCandidate[]): BlockWalkState {
  return {
    blockId,
    offset: 0,
    candidates,
    activeMarks: new Map(),
    bookmarkStarts: new Map(),
    commentRangeStarts: new Map(),
    commentIdsWithMarks: new Set(),
  };
}

function isInlineHost(node: ProseMirrorNode): boolean {
  return (
    Boolean((node as unknown as { inlineContent?: boolean }).inlineContent) ||
    Boolean((node as unknown as { isTextblock?: boolean }).isTextblock)
  );
}

function relevantMarks(marks: readonly Mark[] | null | undefined): Mark[] {
  if (!marks?.length) return [];
  return marks.filter((mark) => mark.type?.name === LINK_MARK_NAME || mark.type?.name === COMMENT_MARK_NAME);
}

function closeMarkSpan(state: BlockWalkState, key: string, endOffset: number, endPos: number): void {
  const active = state.activeMarks.get(key);
  if (!active) return;
  state.activeMarks.delete(key);
  if (endOffset <= active.startOffset) return;

  const markType = active.mark.type?.name;
  const nodeType: InlineNodeType | undefined =
    markType === LINK_MARK_NAME ? 'hyperlink' : markType === COMMENT_MARK_NAME ? 'comment' : undefined;
  if (!nodeType) return;

  const attrs = (active.mark.attrs ?? {}) as Record<string, unknown>;
  if (nodeType === 'comment') {
    const commentId =
      typeof attrs.commentId === 'string'
        ? attrs.commentId
        : typeof attrs.importedId === 'string'
          ? attrs.importedId
          : undefined;
    if (commentId) state.commentIdsWithMarks.add(commentId);
  }

  state.candidates.push({
    nodeType,
    anchor: makeAnchor(state.blockId, active.startOffset, endOffset),
    blockId: state.blockId,
    pos: active.startPos,
    end: endPos,
    mark: active.mark,
    attrs,
  });
}

function closeAllMarks(state: BlockWalkState, endPos: number): void {
  for (const key of Array.from(state.activeMarks.keys())) {
    closeMarkSpan(state, key, state.offset, endPos);
  }
}

function syncMarks(state: BlockWalkState, marks: readonly Mark[] | null | undefined, docPos: number): void {
  const marksOfInterest = relevantMarks(marks);
  const nextKeys = new Set<string>();
  for (const mark of marksOfInterest) {
    const key = markKey(mark);
    nextKeys.add(key);
    if (!state.activeMarks.has(key)) {
      state.activeMarks.set(key, { mark, startOffset: state.offset, startPos: docPos });
    }
  }

  for (const [key] of state.activeMarks.entries()) {
    if (!nextKeys.has(key)) {
      closeMarkSpan(state, key, state.offset, docPos);
    }
  }
}

function handleBookmarkStart(state: BlockWalkState, node: ProseMirrorNode, docPos: number): void {
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  const id = typeof attrs.id === 'string' ? attrs.id : typeof attrs.name === 'string' ? attrs.name : undefined;
  if (!id) return;
  state.bookmarkStarts.set(id, { offset: state.offset, pos: docPos, attrs });
}

function handleBookmarkEnd(state: BlockWalkState, node: ProseMirrorNode, docPos: number): void {
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  const id = typeof attrs.id === 'string' ? attrs.id : undefined;
  if (!id) return;
  const start = state.bookmarkStarts.get(id);
  if (!start) return;
  state.bookmarkStarts.delete(id);
  if (state.offset < start.offset) return;
  state.candidates.push({
    nodeType: 'bookmark',
    anchor: makeAnchor(state.blockId, start.offset, state.offset),
    blockId: state.blockId,
    pos: start.pos,
    end: docPos,
    attrs: start.attrs,
  });
}

function handleCommentRangeStart(state: BlockWalkState, node: ProseMirrorNode, docPos: number): void {
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  const id = typeof attrs['w:id'] === 'string' ? (attrs['w:id'] as string) : undefined;
  if (!id) return;
  state.commentRangeStarts.set(id, { offset: state.offset, pos: docPos, attrs });
}

function handleCommentRangeEnd(state: BlockWalkState, node: ProseMirrorNode, docPos: number): void {
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  const id = typeof attrs['w:id'] === 'string' ? (attrs['w:id'] as string) : undefined;
  if (!id) return;
  if (state.commentIdsWithMarks.has(id)) return;
  const start = state.commentRangeStarts.get(id);
  if (!start) return;
  state.commentRangeStarts.delete(id);
  if (state.offset < start.offset) return;
  state.candidates.push({
    nodeType: 'comment',
    anchor: makeAnchor(state.blockId, start.offset, state.offset),
    blockId: state.blockId,
    pos: start.pos,
    end: docPos,
    attrs: { ...start.attrs, ...attrs },
  });
}

function walkNodeContent(state: BlockWalkState, node: ProseMirrorNode, contentStart: number): void {
  let firstChild = true;
  node.forEach((child: ProseMirrorNode, childOffset: number) => {
    const childDocPos = contentStart + childOffset;
    if (child.isBlock && !firstChild) {
      closeAllMarks(state, childDocPos);
      state.offset += 1;
    }
    walkNode(state, child, childDocPos);
    firstChild = false;
  });
}

function walkNode(state: BlockWalkState, node: ProseMirrorNode, docPos: number): void {
  const isBookmarkStart = node.type?.name === 'bookmarkStart';
  if (isBookmarkStart) {
    handleBookmarkStart(state, node, docPos);
  }

  if (node.isText) {
    const text = node.text ?? '';
    syncMarks(state, node.marks, docPos);
    state.offset += text.length;
    return;
  }

  if (node.isLeaf) {
    syncMarks(state, node.marks, docPos);

    if (node.type?.name === 'bookmarkEnd') {
      handleBookmarkEnd(state, node, docPos);
      return; // Zero-width range delimiter — no text offset contribution.
    } else if (node.type?.name === 'commentRangeStart') {
      handleCommentRangeStart(state, node, docPos);
      return; // Zero-width range delimiter — no text offset contribution.
    } else if (node.type?.name === 'commentRangeEnd') {
      handleCommentRangeEnd(state, node, docPos);
      return; // Zero-width range delimiter — no text offset contribution.
    } else if (!isBookmarkStart) {
      const nodeType = mapInlineNodeType(node);
      if (nodeType) {
        state.candidates.push({
          nodeType,
          anchor: makeAnchor(state.blockId, state.offset, state.offset + 1),
          blockId: state.blockId,
          pos: docPos,
          end: docPos + node.nodeSize,
          node,
        });
      }
    }

    state.offset += 1;
    return;
  }

  if (node.isInline) {
    const nodeType = mapInlineNodeType(node);
    const startOffset = state.offset;
    const startPos = docPos;
    walkNodeContent(state, node, docPos + 1);
    const endOffset = state.offset;
    const endPos = docPos + node.nodeSize;

    if (nodeType) {
      state.candidates.push({
        nodeType,
        anchor: makeAnchor(state.blockId, startOffset, endOffset),
        blockId: state.blockId,
        pos: startPos,
        end: endPos,
        node,
      });
    }
    return;
  }

  walkNodeContent(state, node, docPos + 1);
}

function buildIndexMaps(candidates: InlineCandidate[]): InlineIndex {
  const byType = new Map<InlineNodeType, InlineCandidate[]>();
  const byKey = new Map<string, InlineCandidate>();

  for (const candidate of candidates) {
    if (!byType.has(candidate.nodeType)) {
      byType.set(candidate.nodeType, []);
    }
    byType.get(candidate.nodeType)!.push(candidate);
    byKey.set(inlineKey(candidate.nodeType, candidate.anchor), candidate);
  }

  return { candidates, byType, byKey };
}

/**
 * Walks all inline-hosting blocks and builds an index of inline-level nodes
 * (marks, atoms, and range markers).
 *
 * @param editor - The editor instance to inspect.
 * @param blockIndex - A pre-built block index to iterate over.
 * @returns An {@link InlineIndex} with sorted candidates and lookup maps.
 */
export function buildInlineIndex(editor: Editor, blockIndex: BlockIndex): InlineIndex {
  const candidates: InlineCandidate[] = [];

  for (const block of blockIndex.candidates) {
    if (!isInlineHost(block.node)) continue;

    const state = createBlockWalkState(block.nodeId, candidates);
    walkNodeContent(state, block.node, block.pos + 1);
    closeAllMarks(state, block.pos + block.node.nodeSize);
  }

  candidates.sort((a, b) => (a.pos === b.pos ? a.end - b.end : a.pos - b.pos));
  return buildIndexMaps(candidates);
}

/**
 * Looks up an inline candidate by its {@link NodeAddress} anchor.
 *
 * @param index - The inline index to search.
 * @param address - The inline address to resolve.
 * @returns The matching candidate, or `undefined` if not found.
 */
export function findInlineByAnchor(index: InlineIndex, address: NodeAddress): InlineCandidate | undefined {
  if (address.kind !== 'inline') return undefined;
  if (address.anchor.start.blockId !== address.anchor.end.blockId) return undefined;
  const nodeType = address.nodeType as InlineNodeType;
  return index.byKey.get(inlineKey(nodeType, address.anchor));
}

/**
 * Returns all inline candidates matching a given type, or all candidates if no type is specified.
 *
 * @param index - The inline index to search.
 * @param nodeType - Optional inline node type to filter by.
 * @returns Matching inline candidates.
 */
export function findInlineByType(index: InlineIndex, nodeType?: InlineNodeType): InlineCandidate[] {
  if (!nodeType) return index.candidates;
  return index.byType.get(nodeType) ?? [];
}
