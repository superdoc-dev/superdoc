import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import type { BlockNodeAttributes } from '../../core/types/NodeCategories.js';
import type { BlockNodeAddress, BlockNodeType, NodeAddress, NodeType } from '@superdoc/document-api';
import type { ParagraphAttrs } from '../../extensions/types/node-attributes.js';
import { toId } from './value-utils.js';
import { resolvePublicTocNodeId } from './toc-node-id.js';
import { buildFallbackBlockNodeId, isVolatileRuntimeBlockId } from './deterministic-node-id.js';
import { DocumentApiAdapterError } from '../errors.js';
import {
  toIdentityValue,
  getBlockIdentityAttrsForType,
} from '../../core/super-converter/v2/importer/block-identity-renaming.js';

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
 * One observation of an explicit block-identity attribute value on a node.
 *
 * Collected during {@link buildBlockIndex}'s descendants pass as a side channel
 * so the runtime identity-repair planner (`repair-block-identities.ts`) does
 * not need to walk the document a second time.
 */
export type ExplicitIdentityObservation = {
  /** PM document position of the node carrying the identity attr. */
  pos: number;
  /** The identity attr names that contributed this value on this node (e.g. `paraId`, `sdBlockId`). */
  attrs: string[];
};

/**
 * Side-channel map of explicit block-identity values observed during
 * {@link buildBlockIndex}'s descendants pass.
 *
 * Keyed by the identity *value* (e.g. a `paraId` string). Each entry records
 * every node that exposes that value plus the specific identity attrs that
 * carried it. When the array length is 1, the value is unique in the doc;
 * length > 1 indicates a duplicate to be repaired.
 *
 * Consumed by `repair-block-identities.ts` to short-circuit the clean-doc
 * early-exit in O(map size) rather than walking the whole doc again.
 */
export type ExplicitIdentityMap = Map<string, ExplicitIdentityObservation[]>;

/**
 * Positional index of all block-level nodes in the document.
 *
 * Built by {@link buildBlockIndex}. The index is a snapshot — it must be
 * rebuilt after any document mutation.
 *
 * `explicitIdentities` is a side channel populated during the same descendants
 * pass for the runtime identity-repair planner; it is `undefined` only on
 * mock/test BlockIndex instances that construct the type by hand.
 */
export type BlockIndex = {
  candidates: BlockCandidate[];
  byId: Map<string, BlockCandidate>;
  ambiguous: ReadonlySet<string>;
  explicitIdentities?: ExplicitIdentityMap;
};

type TraversalPath = readonly number[];

// Keep in sync with BlockNodeType in document-api/types/node.ts
const SUPPORTED_BLOCK_NODE_TYPES: ReadonlySet<BlockNodeType> = new Set<BlockNodeType>([
  'paragraph',
  'heading',
  'listItem',
  'table',
  'tableRow',
  'tableCell',
  'tableOfContents',
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

export function mapBlockNodeType(node: ProseMirrorNode): BlockNodeType | undefined {
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
    case 'tableOfContents':
      return 'tableOfContents';
    case 'structuredContentBlock':
    case 'sdt':
      return 'sdt';
    default:
      return undefined;
  }
}

function resolveLegacyTableIdentity(attrs: BlockIdAttrs): string | undefined {
  return toId(attrs.paraId) ?? toId(attrs.blockId) ?? toId(attrs.id) ?? toId(attrs.uuid);
}

/**
 * Resolves a runtime block identity for **table-like** nodes.
 *
 * Non-volatile sdBlockId is preferred; otherwise a deterministic fallback
 * (hashed from nodeType + traversal path) is used. This is correct for tables
 * because they keep a stable nodeType across mutations — their sdBlockId may
 * change when ProseMirror replaces the node during property edits.
 */
function resolveTableRuntimeIdentity(
  nodeType: BlockNodeType,
  attrs: BlockIdAttrs,
  pos: number,
  path?: TraversalPath,
): string | undefined {
  const sdBlockId = toId(attrs.sdBlockId);
  if (sdBlockId && !isVolatileRuntimeBlockId(sdBlockId)) {
    return sdBlockId;
  }
  return buildFallbackBlockNodeId(nodeType, pos, path);
}

/**
 * Resolves a runtime block identity for **paragraph-like** nodes
 * (paragraph, heading, listItem).
 *
 * Always prefers sdBlockId — even a volatile (UUID-like) one — because the
 * deterministic fallback hashes nodeType + traversal path, both of which shift
 * during ordinary edits: sibling inserts/moves change the path, and restyles
 * (paragraph → heading/listItem) change the nodeType. The sdBlockId stays
 * stable for the session lifetime.
 */
function resolveParagraphRuntimeIdentity(
  nodeType: BlockNodeType,
  attrs: BlockIdAttrs,
  pos: number,
  path?: TraversalPath,
): string | undefined {
  return toId(attrs.sdBlockId) ?? buildFallbackBlockNodeId(nodeType, pos, path);
}

/**
 * Resolves the public document-api nodeId for a block-level ProseMirror node.
 *
 * ID resolution strategy varies by block family:
 * - **Paragraphs**: paraId → sdBlockId → deterministic fallback
 * - **Tables/cells**: legacy attrs → non-volatile sdBlockId → deterministic fallback
 * - **Other blocks**: blockId → id → paraId → uuid → sdBlockId
 *
 * @param node - The ProseMirror node.
 * @param pos - Absolute document position of the node.
 * @param nodeType - The mapped block node type.
 * @param path - Optional traversal path for deterministic fallback IDs.
 * @returns The resolved nodeId, or `undefined` if none could be determined.
 */
export function resolveBlockNodeId(
  node: ProseMirrorNode,
  pos: number,
  nodeType: BlockNodeType,
  path?: TraversalPath,
): string | undefined {
  if (node.type.name === 'paragraph') {
    const attrs = node.attrs as ParagraphAttrs | undefined;
    // paraId (imported from DOCX) is the primary identity for paragraphs —
    // preserves historical IDs across DOCX round-trips.
    return toId(attrs?.paraId) ?? resolveParagraphRuntimeIdentity(nodeType, (attrs ?? {}) as BlockIdAttrs, pos, path);
  }

  if (nodeType === 'tableOfContents') {
    return resolvePublicTocNodeId(node, pos);
  }

  const attrs = (node.attrs ?? {}) as BlockIdAttrs;
  const typeName = node.type.name;

  // Table rows legitimately carry w14:paraId in DOCX, so prefer it when
  // present and fall back to sdBlockId for newly created rows.
  if (typeName === 'tableRow') {
    return toId(attrs.paraId) ?? toId(attrs.sdBlockId) ?? toId(attrs.blockId) ?? toId(attrs.id) ?? toId(attrs.uuid);
  }

  // Older SuperDoc exports also stored paraId on tables/cells. Keep honoring
  // those legacy IDs when we encounter them. When only a runtime-generated
  // UUID sdBlockId exists, expose a deterministic fallback instead so session
  // addresses remain reusable across fresh document opens.
  if (typeName === 'table' || typeName === 'tableCell' || typeName === 'tableHeader') {
    return resolveLegacyTableIdentity(attrs) ?? resolveTableRuntimeIdentity(nodeType, attrs, pos, path);
  }

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
 * Block types whose nodes carry both a primary ID (paraId) and sdBlockId,
 * and thus need an alias entry so that lookups by either ID succeed.
 *
 * Headings and list items are PM `paragraph` nodes distinguished by
 * style/numbering attrs. Table nodes also carry both paraId (DOCX-preserved)
 * and sdBlockId (in-memory generated).
 */
const ALIAS_ELIGIBLE_TYPES: ReadonlySet<BlockNodeType> = new Set([
  'paragraph',
  'heading',
  'listItem',
  'table',
  'tableRow',
  'tableCell',
]);

/** Returns the sdBlockId for an alias-eligible node, if it differs from the primary nodeId. */
function resolveBlockAliasId(node: ProseMirrorNode, nodeType: BlockNodeType, primaryId: string): string | undefined {
  if (!ALIAS_ELIGIBLE_TYPES.has(nodeType)) return undefined;
  const attrs = (node.attrs ?? {}) as BlockIdAttrs;
  const sdBlockId = toId(attrs.sdBlockId);
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
  const pathByNode = new WeakMap<ProseMirrorNode, TraversalPath>();
  // Side channel for the runtime identity-repair planner.
  // Populated inline with the existing block walk so a clean 1000-page doc
  // pays one cheap Map lookup per block instead of a second full descendants
  // traversal in `repair-block-identities.ts`. Keyed by identity-attr value;
  // the array length acts as the "duplicates present?" signal.
  const explicitIdentities: ExplicitIdentityMap = new Map();

  pathByNode.set(editor.state.doc, []);

  function registerKey(key: string, candidate: BlockCandidate): void {
    if (byId.has(key)) {
      ambiguous.add(key);
      byId.delete(key);
    } else if (!ambiguous.has(key)) {
      byId.set(key, candidate);
    }
  }

  function recordExplicitIdentities(node: ProseMirrorNode, pos: number): void {
    const attrPriority = getBlockIdentityAttrsForType(node.type?.name);
    if (attrPriority.length === 0) return;
    const attrs = (node.attrs ?? {}) as Record<string, unknown>;

    // Group identity attrs by value at the node level so `paraId === sdBlockId`
    // contributes a single observation listing both attr names — matching the
    // grouping the renaming pass needs to rewrite both fields together.
    let nodeGroups: Map<string, string[]> | undefined;
    for (const attr of attrPriority) {
      const value = toIdentityValue(attrs[attr]);
      if (!value) continue;
      if (!nodeGroups) nodeGroups = new Map();
      const existing = nodeGroups.get(value);
      if (existing) {
        existing.push(attr);
      } else {
        nodeGroups.set(value, [attr]);
      }
    }
    if (!nodeGroups) return;

    for (const [value, attrsForValue] of nodeGroups) {
      const observations = explicitIdentities.get(value);
      const observation: ExplicitIdentityObservation = { pos, attrs: attrsForValue };
      if (observations) {
        observations.push(observation);
      } else {
        explicitIdentities.set(value, [observation]);
      }
    }
  }

  // This traversal is a hot path for adapter workflows (for example find ->
  // getNode). Keep this pure snapshot builder so a transaction-invalidated
  // cache can be layered on later without API changes.
  editor.state.doc.descendants((node, pos, parent, index) => {
    const parentPath = parent ? (pathByNode.get(parent) ?? []) : [];
    const path =
      typeof index === 'number' && Number.isInteger(index) && index >= 0 ? [...parentPath, index] : undefined;

    if (path) {
      pathByNode.set(node, path);
    }

    // Collect identity observations BEFORE the block-type gate so that the
    // repair planner sees every PM type with identity attrs — even those
    // `mapBlockNodeType` filters out (e.g., a `structuredContentBlock` is
    // mapped to `sdt`, but the identity attrs live on the raw PM node).
    recordExplicitIdentities(node, pos);

    const nodeType = mapBlockNodeType(node);
    if (!nodeType) return;
    const nodeId = resolveBlockNodeId(node, pos, nodeType, path);
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

  return { candidates, byId, ambiguous, explicitIdentities };
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
 * Looks up a block candidate by its {@link BlockNodeAddress}, throwing
 * a precise error for missing or ambiguous targets.
 *
 * @param index - The block index to search.
 * @param address - The block node address to resolve.
 * @returns The matching candidate.
 * @throws {DocumentApiAdapterError} `TARGET_NOT_FOUND` if no candidate matches.
 * @throws {DocumentApiAdapterError} `AMBIGUOUS_TARGET` if multiple candidates share the key.
 */
export function findBlockByIdStrict(index: BlockIndex, address: BlockNodeAddress): BlockCandidate {
  const key = `${address.nodeType}:${address.nodeId}`;

  if (index.ambiguous.has(key)) {
    throw new DocumentApiAdapterError('AMBIGUOUS_TARGET', `Multiple blocks share key "${key}".`, {
      target: address,
    });
  }

  const candidate = index.byId.get(key);
  if (!candidate) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Block "${key}" was not found.`, {
      target: address,
    });
  }

  return candidate;
}

/**
 * Resolves a nodeId against alias entries in the block index (e.g., sdBlockId
 * registered as an alias for a deterministic primary ID).
 *
 * @param index - The block index to search.
 * @param nodeId - The node ID to resolve via alias lookup.
 * @returns The single matching candidate, or `undefined` if no alias matches.
 * @throws {DocumentApiAdapterError} `AMBIGUOUS_TARGET` when multiple blocks share the alias.
 */
export function resolveBlockAlias(index: BlockIndex, nodeId: string): BlockCandidate | undefined {
  if (!index.byId) return undefined;

  const aliasMatches = new Map<string, BlockCandidate>();
  for (const [key, candidate] of index.byId) {
    if (!key.endsWith(`:${nodeId}`)) continue;
    aliasMatches.set(`${candidate.nodeType}:${candidate.nodeId}`, candidate);
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

  return aliasMatches.size === 1 ? Array.from(aliasMatches.values())[0] : undefined;
}

/**
 * Finds a block candidate by raw nodeId without requiring a nodeType.
 *
 * Falls back to alias resolution when no primary match exists.
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
  const alias = resolveBlockAlias(index, nodeId);
  if (alias) return alias;

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
