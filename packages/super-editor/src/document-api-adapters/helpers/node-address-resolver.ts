import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import type { BlockNodeAttributes } from '../../core/types/NodeCategories.js';
import type { BlockNodeAddress, BlockNodeType, NodeAddress, NodeType } from '@superdoc/document-api';
import type { ParagraphAttrs } from '../../extensions/types/node-attributes.js';
import { toId } from './value-utils.js';

/** Superset of all possible ID attributes across block node types. */
type BlockIdAttrs = BlockNodeAttributes & {
  blockId?: string | null;
  id?: string | null;
  paraId?: string | null;
  uuid?: string | null;
};

/** A block-level node found during document traversal, with its position and resolved identity. */
export type BlockCandidate = {
  node: ProseMirrorNode;
  pos: number;
  end: number;
  nodeType: BlockNodeType;
  nodeId: string;
};

/**
 * Positional index of all block-level nodes in the document.
 *
 * Built by {@link buildBlockIndex}. The index is a snapshot — it must be
 * rebuilt after any document mutation.
 */
export type BlockIndex = {
  candidates: BlockCandidate[];
  byId: Map<string, BlockCandidate>;
};

// Keep in sync with BlockNodeType in document-api/types/node.ts
const SUPPORTED_BLOCK_NODE_TYPES: ReadonlySet<BlockNodeType> = new Set<BlockNodeType>([
  'paragraph',
  'heading',
  'listItem',
  'table',
  'tableRow',
  'tableCell',
  'image',
  'sdt',
]);

/**
 * Returns `true` if `nodeType` is a block-level type supported by the adapter index.
 *
 * @param nodeType - A node type string (block, inline, or the literal `'text'`).
 * @returns Whether the type is a supported {@link BlockNodeType}.
 */
export function isSupportedNodeType(nodeType: NodeType | 'text'): nodeType is BlockNodeType {
  return SUPPORTED_BLOCK_NODE_TYPES.has(nodeType as BlockNodeType);
}

function isListItem(attrs: ParagraphAttrs | null | undefined): boolean {
  const numbering = attrs?.paragraphProperties?.numberingProperties;
  if (numbering && (numbering.numId != null || numbering.ilvl != null)) return true;
  const listRendering = attrs?.listRendering;
  if (listRendering?.markerText) return true;
  if (Array.isArray(listRendering?.path) && listRendering.path.length > 0) return true;
  return false;
}

/**
 * Extracts the heading level (1–6) from an OOXML styleId string.
 *
 * @param styleId - A paragraph styleId (e.g. `"Heading1"`, `"heading 3"`).
 * @returns The heading level, or `undefined` if the styleId is not a heading.
 */
export function getHeadingLevel(styleId?: string | null): number | undefined {
  if (!styleId) return undefined;
  const match = /heading\s*([1-6])/i.exec(styleId);
  if (!match) return undefined;
  return Number(match[1]);
}

function mapBlockNodeType(node: ProseMirrorNode): BlockNodeType | undefined {
  if (!node.isBlock) return undefined;
  switch (node.type.name) {
    case 'paragraph': {
      const attrs = node.attrs as ParagraphAttrs | undefined;
      const styleId = attrs?.paragraphProperties?.styleId ?? undefined;
      if (getHeadingLevel(styleId) != null) return 'heading';
      if (isListItem(attrs)) return 'listItem';
      return 'paragraph';
    }
    case 'table':
      return 'table';
    case 'tableRow':
      return 'tableRow';
    case 'tableCell':
    case 'tableHeader':
      return 'tableCell';
    case 'image':
      return 'image';
    case 'structuredContentBlock':
    case 'sdt':
      return 'sdt';
    default:
      return undefined;
  }
}

function resolveBlockNodeId(node: ProseMirrorNode): string | undefined {
  if (node.type.name === 'paragraph') {
    const attrs = node.attrs as ParagraphAttrs | undefined;
    // NOTE: Migration surface for the stable-addresses plan.
    // Today we preserve DOCX-import identity precedence (`paraId` first) for
    // paragraph nodes. Any future switch to `sdBlockId` canonical precedence
    // must be handled as an explicit compatibility migration.
    return toId(attrs?.paraId) ?? toId(attrs?.sdBlockId);
  }

  const attrs = (node.attrs ?? {}) as BlockIdAttrs;
  // NOTE: Migration surface for the stable-addresses plan.
  // Imported IDs currently win over `sdBlockId` to preserve historical
  // identity during DOCX round-trips.
  return toId(attrs.blockId) ?? toId(attrs.id) ?? toId(attrs.paraId) ?? toId(attrs.uuid) ?? toId(attrs.sdBlockId);
}

/**
 * Converts a {@link BlockCandidate} into a stable {@link NodeAddress}.
 *
 * @param candidate - The block candidate to convert.
 * @returns A block-kind node address.
 */
export function toBlockAddress(candidate: BlockCandidate): BlockNodeAddress {
  return {
    kind: 'block',
    nodeType: candidate.nodeType,
    nodeId: candidate.nodeId,
  };
}

/**
 * Walks the editor document and builds a positional index of all recognised
 * block-level nodes.
 *
 * The returned index is a **snapshot** tied to the current document state.
 * It must be rebuilt after any transaction that mutates the document.
 *
 * @param editor - The editor whose document will be indexed.
 * @returns A {@link BlockIndex} containing ordered candidates and a lookup map.
 */
export function buildBlockIndex(editor: Editor): BlockIndex {
  const candidates: BlockCandidate[] = [];
  const byId = new Map<string, BlockCandidate>();
  const ambiguous = new Set<string>();

  // This traversal is a hot path for adapter workflows (for example find ->
  // getNode). Keep this pure snapshot builder so a transaction-invalidated
  // cache can be layered on later without API changes.
  editor.state.doc.descendants((node, pos) => {
    const nodeType = mapBlockNodeType(node);
    if (!nodeType) return;
    const nodeId = resolveBlockNodeId(node);
    if (!nodeId) return;

    const candidate: BlockCandidate = {
      node,
      pos,
      end: pos + node.nodeSize,
      nodeType,
      nodeId,
    };

    candidates.push(candidate);
    const key = `${candidate.nodeType}:${candidate.nodeId}`;
    if (byId.has(key)) {
      ambiguous.add(key);
      byId.delete(key);
    } else if (!ambiguous.has(key)) {
      byId.set(key, candidate);
    }
  });

  return { candidates, byId };
}

/**
 * Looks up a block candidate by its {@link NodeAddress}.
 *
 * @param index - The block index to search.
 * @param address - The address to resolve. Non-block addresses return `undefined`.
 * @returns The matching candidate, or `undefined` if not found.
 */
export function findBlockById(index: BlockIndex, address: NodeAddress): BlockCandidate | undefined {
  if (address.kind !== 'block') return undefined;
  return index.byId.get(`${address.nodeType}:${address.nodeId}`);
}

/**
 * Returns true for block candidates that accept inline text content.
 */
export function isTextBlockCandidate(candidate: BlockCandidate): boolean {
  const node = candidate.node as unknown as { inlineContent?: boolean; isTextblock?: boolean };
  return Boolean(node?.inlineContent || node?.isTextblock);
}

/**
 * Finds a block candidate whose range contains the given position.
 *
 * Note: nested blocks (e.g. table > row > cell > paragraph) produce overlapping
 * candidates. This returns whichever the binary search lands on first, not
 * necessarily the innermost. This is sufficient for resolving a containing block
 * for match context but callers needing the most specific block should filter further.
 */
export function findBlockByPos(index: BlockIndex, pos: number): BlockCandidate | undefined {
  const candidates = index.candidates;
  let low = 0;
  let high = candidates.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const candidate = candidates[mid];
    if (pos < candidate.pos) {
      high = mid - 1;
      continue;
    }
    if (pos > candidate.end) {
      low = mid + 1;
      continue;
    }
    return candidate;
  }

  return undefined;
}
