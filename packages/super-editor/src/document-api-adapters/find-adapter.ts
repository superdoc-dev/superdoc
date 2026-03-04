import type { Editor } from '../core/Editor.js';
import type { FindOutput, Query, UnknownNodeDiagnostic } from '@superdoc/document-api';
import { buildResolvedHandle, buildDiscoveryItem, buildDiscoveryResult } from '@superdoc/document-api';
import { dedupeDiagnostics } from './helpers/adapter-utils.js';
import { getBlockIndex } from './helpers/index-cache.js';
import { resolveIncludedNodes } from './helpers/node-info-resolver.js';
import { collectUnknownNodeDiagnostics, isInlineQuery, shouldQueryBothKinds } from './find/common.js';
import { executeBlockSelector } from './find/block-strategy.js';
import { executeDualKindSelector } from './find/dual-kind-strategy.js';
import { executeInlineSelector } from './find/inline-strategy.js';
import { executeTextSelector } from './find/text-strategy.js';
import { getRevision } from './plan-engine/revision-tracker.js';

/**
 * Executes a document query against the editor's current state.
 *
 * Returns a standardized `FindOutput` discovery envelope with per-item
 * domain fields (`address`, `node`, `context`) and a real `evaluatedRevision`.
 *
 * @param editor - The editor instance to query.
 * @param query - The query specifying what to find.
 * @returns A `FindOutput` discovery envelope.
 * @throws {Error} If the editor's search command is unavailable (text queries only).
 */
export function findAdapter(editor: Editor, query: Query): FindOutput {
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
  const evaluatedRevision = getRevision(editor);

  // Merge parallel arrays into per-item FindItemDomain entries.
  const items = result.matches.map((address, idx) => {
    const nodeId = 'nodeId' in address ? (address as { nodeId: string }).nodeId : undefined;
    const isTextContext = result.context?.[idx]?.textRanges?.length;
    const ref = nodeId ?? `find:${idx}`;
    const targetKind = isTextContext ? ('text' as const) : ('node' as const);
    const handle = buildResolvedHandle(ref, 'ephemeral', targetKind);

    const domain: {
      address: typeof address;
      node?: typeof includedNodes extends (infer U)[] | undefined ? U : never;
      context?: typeof result.context extends (infer U)[] | undefined ? U : never;
    } = { address };
    if (includedNodes?.[idx]) domain.node = includedNodes[idx];
    if (result.context?.[idx]) domain.context = result.context[idx];

    return buildDiscoveryItem(ref, handle, domain);
  });

  return {
    ...buildDiscoveryResult({
      evaluatedRevision,
      total: result.total,
      items,
      page: {
        limit: query.limit ?? result.total,
        offset: query.offset ?? 0,
        returned: items.length,
      },
    }),
    diagnostics: uniqueDiagnostics.length ? uniqueDiagnostics : undefined,
  };
}
