import type { Query, QueryResult, UnknownNodeDiagnostic } from '@superdoc/document-api';
import { addDiagnostic, paginate, resolveWithinScope, scopeByRange } from '../helpers/adapter-utils.js';
import type { BlockCandidate, BlockIndex } from '../helpers/node-address-resolver.js';

/**
 * Executes a block-level node selector against the block index.
 *
 * @param index - Pre-built block index to search.
 * @param query - The query with a node selector and optional pagination/scope.
 * @param diagnostics - Mutable array to collect diagnostics into.
 * @returns Paginated query result containing block-kind matches.
 */
export function executeBlockSelector(
  index: BlockIndex,
  query: Query,
  diagnostics: UnknownNodeDiagnostic[],
): QueryResult {
  const scope = resolveWithinScope(index, query, diagnostics);
  if (!scope.ok) return { matches: [], total: 0 };

  const scoped = scopeByRange(index.candidates, scope.range);
  const select = query.select;
  let filtered: BlockCandidate[] = [];

  if (select.type === 'node') {
    if (select.kind && select.kind !== 'block') {
      addDiagnostic(diagnostics, 'Only block nodes are supported by the current adapter.');
    } else {
      filtered = scoped.filter((candidate) => {
        if (select.nodeType) {
          if (candidate.nodeType !== select.nodeType) return false;
        }
        return true;
      });
    }
  }
  // text selectors are handled by text-strategy, not block

  const addresses = filtered.map((candidate) => ({
    kind: 'block' as const,
    nodeType: candidate.nodeType,
    nodeId: candidate.nodeId,
  }));
  const paged = paginate(addresses, query.offset, query.limit);

  return {
    matches: paged.items,
    total: paged.total,
  };
}
