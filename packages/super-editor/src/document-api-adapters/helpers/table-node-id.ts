import type { BlockNodeType } from '@superdoc/document-api';

type TableLikeBlockNodeType = 'table' | 'tableCell';

const TABLE_LIKE_PREFIX: Readonly<Record<TableLikeBlockNodeType, string>> = {
  table: 'table-auto',
  tableCell: 'cell-auto',
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

function toTableLikeBlockNodeType(nodeType: BlockNodeType): TableLikeBlockNodeType | undefined {
  if (nodeType === 'table') return 'table';
  if (nodeType === 'tableCell') return 'tableCell';
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
 * Table and table-cell sdBlockIds are frequently generated at editor startup,
 * so UUID-like values are not safe to expose as public document-api node IDs.
 */
export function isVolatileRuntimeBlockId(id: string | undefined): boolean {
  return typeof id === 'string' && UUID_LIKE_PATTERN.test(id);
}

/**
 * Builds a deterministic public fallback ID for table-like nodes that lack a
 * schema-valid persisted identity.
 *
 * The traversal path is preferred because it stays stable across reopen of the
 * same unchanged document while remaining independent of runtime-generated
 * `sdBlockId` UUIDs.
 */
export function buildFallbackTableNodeId(
  nodeType: BlockNodeType,
  pos: number,
  path?: readonly number[],
): string | undefined {
  const tableLikeType = toTableLikeBlockNodeType(nodeType);
  if (!tableLikeType) return undefined;

  const prefix = TABLE_LIKE_PREFIX[tableLikeType];
  const source = serializeTraversalPath(path, pos);
  return `${prefix}-${stableHash(`${tableLikeType}:${source}`)}`;
}
