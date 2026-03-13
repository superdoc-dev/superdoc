import type { Editor } from '../../core/Editor.js';
import type { Query, QueryResult, UnknownNodeDiagnostic } from '@superdoc/document-api';
import { paginate } from '../helpers/adapter-utils.js';
import type { BlockIndex } from '../helpers/node-address-resolver.js';
import { sortAddressesByPosition } from './common.js';
import { executeBlockSelector } from './block-strategy.js';
import { executeInlineSelector } from './inline-strategy.js';

/**
 * Executes a selector for node types that exist as both block and inline
 * (e.g. `sdt`, `image`). Merges and sorts results from both strategies.
 *
 * @param editor - The editor instance.
 * @param index - Pre-built block index.
 * @param query - The query to execute.
 * @param diagnostics - Mutable array to collect diagnostics into.
 * @returns Paginated query result with merged block and inline matches.
 */
export function executeDualKindSelector(
  editor: Editor,
  index: BlockIndex,
  query: Query,
  diagnostics: UnknownNodeDiagnostic[],
): QueryResult {
  const queryWithoutPagination: Query = {
    ...query,
    offset: undefined,
    limit: undefined,
  };

  const blockResult = executeBlockSelector(index, queryWithoutPagination, diagnostics);
  const inlineResult = executeInlineSelector(editor, index, queryWithoutPagination, diagnostics);

  const mergedMatches = [...blockResult.matches, ...inlineResult.matches];
  const sortedMatches = sortAddressesByPosition(editor, index, mergedMatches);
  const paged = paginate(sortedMatches, query.offset, query.limit);

  return {
    matches: paged.items,
    total: paged.total,
  };
}
