import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import type { BlockNodeAttributes } from '../../core/types/NodeCategories.js';
import type { BlockNodeAddress, BlockNodeType, NodeAddress, NodeType } from '@superdoc/document-api';
import type { ParagraphAttrs } from '../../extensions/types/node-attributes.js';
import { toId } from './value-utils.js';
import { DocumentApiAdapterError } from '../errors.js';

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
    // paraId (imported from DOCX) is the primary identity — it's stable across
    // document opens. sdBlockId is auto-generated per open, so using it as the
    // canonical ID would break stateless CLI workflows.
    // When paraId is absent (freshly created node), sdBlockId is the fallback.
    return toId(attrs?.paraId) ?? toId(attrs?.sdBlockId);
  }

  const attrs = (node.attrs ?? {}) as BlockIdAttrs;
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
 * Block types whose nodes carry both `paraId` and `sdBlockId`, and thus need
 * an alias entry so that lookups by either ID succeed.  Headings and list
 * items are PM `paragraph` nodes distinguished by style/numbering attrs, so
 * they share the same dual-ID shape.
 */
const ALIAS_ELIGIBLE_TYPES: ReadonlySet<BlockNodeType> = new Set(['paragraph', 'heading', 'listItem']);

/** Returns the sdBlockId for an alias-eligible node, if it differs from the primary nodeId. */
function resolveBlockAliasId(node: ProseMirrorNode, nodeType: BlockNodeType, primaryId: string): string | undefined {
  if (!ALIAS_ELIGIBLE_TYPES.has(nodeType)) return undefined;
  const attrs = node.attrs as ParagraphAttrs | undefined;
  const sdBlockId = toId(attrs?.sdBlockId);
  if (sdBlockId && sdBlockId !== primaryId) return sdBlockId;
  return undefined;
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

  function registerKey(key: string, candidate: BlockCandidate): void {
    if (byId.has(key)) {
      ambiguous.add(key);
      byId.delete(key);
    } else if (!ambiguous.has(key)) {
      byId.set(key, candidate);
    }
  }

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
    registerKey(`${nodeType}:${nodeId}`, candidate);

    // For alias-eligible types (paragraph, heading, listItem), also register
    // under sdBlockId so that IDs returned by create operations remain
    // resolvable even after paraId is injected (e.g., via DOCX round-trip or
    // collaboration merge).
    const aliasId = resolveBlockAliasId(node, nodeType, nodeId);
    if (aliasId) {
      registerKey(`${nodeType}:${aliasId}`, candidate);
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
 * Finds a block candidate by raw nodeId without requiring a nodeType.
 *
 * This is needed for create operations that position relative to _any_ block type.
 *
 * @param index - The block index to search.
 * @param nodeId - The node ID to resolve.
 * @returns The single matching candidate.
 * @throws {DocumentApiAdapterError} `TARGET_NOT_FOUND` if no candidate matches.
 * @throws {DocumentApiAdapterError} `AMBIGUOUS_TARGET` if more than one candidate matches.
 */
export function findBlockByNodeIdOnly(index: BlockIndex, nodeId: string): BlockCandidate {
  const matches = index.candidates.filter((candidate) => candidate.nodeId === nodeId);

  if (matches.length === 1) return matches[0]!;

  if (matches.length > 1) {
    throw new DocumentApiAdapterError('AMBIGUOUS_TARGET', `Multiple blocks share nodeId "${nodeId}".`, {
      nodeId,
      count: matches.length,
    });
  }

  // No primary match — check alias entries (e.g., sdBlockId for paragraph-like nodes).
  const aliasMatches = new Map<string, BlockCandidate>();
  for (const [key, candidate] of index.byId) {
    if (!key.endsWith(`:${nodeId}`)) continue;
    aliasMatches.set(`${candidate.nodeType}:${candidate.nodeId}`, candidate);
  }

  if (aliasMatches.size === 1) {
    return Array.from(aliasMatches.values())[0]!;
  }

  if (aliasMatches.size > 1) {
    throw new DocumentApiAdapterError('AMBIGUOUS_TARGET', `Multiple blocks share nodeId "${nodeId}" via aliases.`, {
      nodeId,
      count: aliasMatches.size,
      matches: Array.from(aliasMatches.values()).map((candidate) => ({
        nodeType: candidate.nodeType,
        nodeId: candidate.nodeId,
      })),
    });
  }

  throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Block with nodeId "${nodeId}" was not found.`, { nodeId });
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
