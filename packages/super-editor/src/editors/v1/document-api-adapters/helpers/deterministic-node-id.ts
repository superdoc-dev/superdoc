import type { BlockNodeType } from '@superdoc/document-api';

type FallbackEligibleBlockNodeType = 'table' | 'tableCell' | 'paragraph' | 'heading' | 'listItem';

const FALLBACK_PREFIX: Readonly<Record<FallbackEligibleBlockNodeType, string>> = {
  table: 'table-auto',
  tableCell: 'cell-auto',
  paragraph: 'para-auto',
  heading: 'heading-auto',
  listItem: 'list-auto',
};

const UUID_LIKE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Fast deterministic hash for public fallback block IDs. */
function stableHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function toFallbackEligibleBlockNodeType(nodeType: BlockNodeType): FallbackEligibleBlockNodeType | undefined {
  if (nodeType === 'table') return 'table';
  if (nodeType === 'tableCell') return 'tableCell';
  if (nodeType === 'paragraph') return 'paragraph';
  if (nodeType === 'heading') return 'heading';
  if (nodeType === 'listItem') return 'listItem';
  return undefined;
}

function serializeTraversalPath(path: readonly number[] | undefined, pos: number): string {
  if (Array.isArray(path) && path.length > 0) {
    return `path:${path.join('.')}`;
  }
  return `pos:${pos}`;
}

/**
 * Returns true when an sdBlockId looks like a runtime-generated UUID.
 *
 * Block-level sdBlockIds are frequently generated at editor startup,
 * so UUID-like values are not safe to expose as public document-api node IDs.
 */
export function isVolatileRuntimeBlockId(id: string | undefined): boolean {
  return typeof id === 'string' && UUID_LIKE_PATTERN.test(id);
}

/**
 * Builds a deterministic public fallback ID for block nodes that lack a
 * schema-valid persisted identity.
 *
 * The traversal path is preferred because it stays stable across reopen of the
 * same unchanged document while remaining independent of runtime-generated
 * `sdBlockId` UUIDs.
 */
export function buildFallbackBlockNodeId(
  nodeType: BlockNodeType,
  pos: number,
  path?: readonly number[],
): string | undefined {
  const eligibleType = toFallbackEligibleBlockNodeType(nodeType);
  if (!eligibleType) return undefined;

  const prefix = FALLBACK_PREFIX[eligibleType];
  const source = serializeTraversalPath(path, pos);
  return `${prefix}-${stableHash(`${eligibleType}:${source}`)}`;
}

/** @deprecated Use {@link buildFallbackBlockNodeId} instead. */
export const buildFallbackTableNodeId = buildFallbackBlockNodeId;
