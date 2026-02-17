import type { Editor } from '../core/Editor.js';
import type { Query, QueryResult, UnknownNodeDiagnostic } from '@superdoc/document-api';
import { dedupeDiagnostics } from './helpers/adapter-utils.js';
import { getBlockIndex } from './helpers/index-cache.js';
import { resolveIncludedNodes } from './helpers/node-info-resolver.js';
import { collectUnknownNodeDiagnostics, isInlineQuery, shouldQueryBothKinds } from './find/common.js';
import { executeBlockSelector } from './find/block-strategy.js';
import { executeDualKindSelector } from './find/dual-kind-strategy.js';
import { executeInlineSelector } from './find/inline-strategy.js';
import { executeTextSelector } from './find/text-strategy.js';

/**
 * Executes a document query against the editor's current state.
 *
 * Supports block-node selectors (by type) and text selectors (literal/regex)
 * with optional `within` scoping and offset/limit pagination.
 *
 * @param editor - The editor instance to query.
 * @param query - The query specifying what to find.
 * @returns Query result with matches, total count, and any diagnostics.
 * @throws {Error} If the editor's search command is unavailable (text queries only).
 */
export function findAdapter(editor: Editor, query: Query): QueryResult {
  const diagnostics: UnknownNodeDiagnostic[] = [];
  const index = getBlockIndex(editor);
  if (query.includeUnknown) {
    collectUnknownNodeDiagnostics(editor, index, diagnostics);
  }

  const isInlineSelector = query.select.type !== 'text' && isInlineQuery(query.select);
  const isDualKindSelector = query.select.type !== 'text' && shouldQueryBothKinds(query.select);

  const result =
    query.select.type === 'text'
      ? executeTextSelector(editor, index, query, diagnostics)
      : isDualKindSelector
        ? executeDualKindSelector(editor, index, query, diagnostics)
        : isInlineSelector
          ? executeInlineSelector(editor, index, query, diagnostics)
          : executeBlockSelector(index, query, diagnostics);

  const uniqueDiagnostics = dedupeDiagnostics(diagnostics);
  const includedNodes = query.includeNodes ? resolveIncludedNodes(editor, index, result.matches) : undefined;

  return {
    ...result,
    nodes: includedNodes?.length ? includedNodes : undefined,
    diagnostics: uniqueDiagnostics.length ? uniqueDiagnostics : undefined,
  };
}
