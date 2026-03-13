import type { Editor } from '../../core/Editor.js';
import type { InlineNodeType, NodeAddress, Query, QueryResult, UnknownNodeDiagnostic } from '@superdoc/document-api';
import { getInlineIndex } from '../helpers/index-cache.js';
import { findInlineByType, isInlineQueryType, type InlineCandidate } from '../helpers/inline-address-resolver.js';
import { addDiagnostic, paginate, resolveWithinScope, scopeByRange } from '../helpers/adapter-utils.js';
import type { BlockIndex } from '../helpers/node-address-resolver.js';

function toInlineAddress(candidate: InlineCandidate, nodeTypeOverride?: InlineNodeType): NodeAddress {
  return {
    kind: 'inline',
    nodeType: nodeTypeOverride ?? candidate.nodeType,
    anchor: candidate.anchor,
  };
}

/**
 * Executes an inline-level node selector against the inline index.
 *
 * @param editor - The editor instance.
 * @param index - Pre-built block index (used for within-scope resolution).
 * @param query - The query with an inline node selector.
 * @param diagnostics - Mutable array to collect diagnostics into.
 * @returns Paginated query result containing inline-kind matches.
 */
export function executeInlineSelector(
  editor: Editor,
  index: BlockIndex,
  query: Query,
  diagnostics: UnknownNodeDiagnostic[],
): QueryResult {
  const scope = resolveWithinScope(index, query, diagnostics);
  if (!scope.ok) return { matches: [], total: 0 };

  const inlineIndex = getInlineIndex(editor);
  const select = query.select;
  let requestedType: InlineNodeType | undefined;
  let addressType: InlineNodeType | undefined;

  if (select.type === 'node') {
    if (select.kind && select.kind !== 'inline') {
      addDiagnostic(diagnostics, 'Only inline nodes are supported by the current inline adapter.');
      return { matches: [], total: 0 };
    }
    if (select.nodeType) {
      if (!isInlineQueryType(select.nodeType)) {
        addDiagnostic(diagnostics, `Node type "${select.nodeType}" is not an inline type.`);
        return { matches: [], total: 0 };
      }
      requestedType = select.nodeType;
      addressType = select.nodeType;
    }
  } else {
    // text selectors are handled by text-strategy, not inline
    return { matches: [], total: 0 };
  }

  let candidates = requestedType ? findInlineByType(inlineIndex, requestedType) : inlineIndex.candidates;
  candidates = scopeByRange(candidates, scope.range);

  const addresses = candidates.map((candidate) => toInlineAddress(candidate, addressType));
  const paged = paginate(addresses, query.offset, query.limit);

  return {
    matches: paged.items,
    total: paged.total,
  };
}
