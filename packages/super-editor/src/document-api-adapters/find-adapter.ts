import type { Editor } from '../core/Editor.js';
import type {
  FindOutput,
  Query,
  SDFindInput,
  SDFindResult,
  SDNodeResult,
  NodeAddress,
  UnknownNodeDiagnostic,
} from '@superdoc/document-api';
import { buildResolvedHandle, buildDiscoveryItem, buildDiscoveryResult } from '@superdoc/document-api';
import { DocumentApiAdapterError } from './errors.js';
import { dedupeDiagnostics } from './helpers/adapter-utils.js';
import { getBlockIndex, getInlineIndex } from './helpers/index-cache.js';
import { findInlineByAnchor } from './helpers/inline-address-resolver.js';
import { findBlockByIdStrict, findBlockByNodeIdOnly } from './helpers/node-address-resolver.js';
import { resolveIncludedNodes } from './helpers/node-info-resolver.js';
import { collectUnknownNodeDiagnostics, isInlineQuery, shouldQueryBothKinds } from './find/common.js';
import { executeBlockSelector } from './find/block-strategy.js';
import { executeDualKindSelector } from './find/dual-kind-strategy.js';
import { executeInlineSelector } from './find/inline-strategy.js';
import { executeTextSelector } from './find/text-strategy.js';
import { getRevision } from './plan-engine/revision-tracker.js';
import { buildSelectionTargetFromTextRanges, encodeV3Ref } from './plan-engine/query-match-adapter.js';
import {
  projectContentNode,
  projectInlineNode,
  projectMarkBasedInline,
  resolveTextByBlockId,
} from './helpers/sd-projection.js';

// ---------------------------------------------------------------------------
// Legacy find — returns FindOutput (used by info-adapter)
// ---------------------------------------------------------------------------

/**
 * Executes a document query against the editor's current state.
 *
 * Returns a standardized `FindOutput` discovery envelope with per-item
 * domain fields (`address`, `node`, `context`) and a real `evaluatedRevision`.
 */
export function findLegacyAdapter(editor: Editor, query: Query): FindOutput {
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
    const contextEntry = result.context?.[idx];
    const textRanges = contextEntry?.textRanges;
    const isTextContext = textRanges?.length;

    // Text matches get real V3 refs so they can be chained into mutations.
    // Node matches use the stable nodeId or a coarse indexed ref.
    let ref: string;
    let targetKind: 'text' | 'node';
    if (isTextContext && textRanges) {
      const segments = textRanges.map((tr) => ({
        blockId: tr.blockId,
        start: tr.range.start,
        end: tr.range.end,
      }));
      ref = encodeV3Ref({
        v: 3,
        rev: evaluatedRevision,
        matchId: `f:${idx}`,
        scope: 'match',
        segments,
      });
      targetKind = 'text';
    } else {
      ref = nodeId ?? `find:${idx}`;
      targetKind = 'node';
    }
    const handle = buildResolvedHandle(ref, 'ephemeral', targetKind);

    const domain: {
      address: typeof address;
      node?: typeof includedNodes extends (infer U)[] | undefined ? U : never;
      context?: typeof result.context extends (infer U)[] | undefined ? U : never;
    } = { address };
    if (includedNodes?.[idx]) domain.node = includedNodes[idx];
    if (contextEntry) {
      // Inject mutation-ready SelectionTarget into text match contexts.
      if (textRanges?.length) {
        contextEntry.target = buildSelectionTargetFromTextRanges(textRanges);
      }
      domain.context = contextEntry;
    }

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

// ---------------------------------------------------------------------------
// SDM/1 find — returns SDFindResult
// ---------------------------------------------------------------------------

/**
 * Translates an SDFindInput into the internal Query format used by the
 * find strategy engine.
 */
function translateToInternalQuery(input: SDFindInput): Query {
  if (!input || typeof input !== 'object' || !input.select || typeof input.select !== 'object' || !input.select.type) {
    throw new DocumentApiAdapterError(
      'INVALID_INPUT',
      'SDFindInput requires a "select" object with a "type" field ("text" or "node").',
      { field: 'select', value: input?.select },
    );
  }

  const { select, within, limit, offset } = input;

  // Validate within address early (actual nodeType resolution happens in sdFindAdapter)
  if (within) validateWithinAddress(within);

  // Reject legacy selector vocabulary that would otherwise be silently ignored.
  if (select.type === 'node') {
    const raw = select as unknown as Record<string, unknown>;
    if ('nodeKind' in raw && raw.nodeKind != null) {
      throw new DocumentApiAdapterError(
        'INVALID_INPUT',
        `"nodeKind" is no longer supported on node selectors. Use "nodeType" instead: ` +
          `{ type: 'node', nodeType: '${String(raw.nodeKind)}' }.`,
        { field: 'select.nodeKind', value: raw.nodeKind },
      );
    }
    if (raw.kind === 'content') {
      throw new DocumentApiAdapterError(
        'INVALID_INPUT',
        `kind: 'content' is no longer supported on node selectors. Use kind: 'block' instead.`,
        { field: 'select.kind', value: raw.kind },
      );
    }
  }

  return {
    select,
    limit,
    offset,
    // within is resolved in sdFindAdapter after block index is built
    includeNodes: true,
  };
}

/**
 * Validates a BlockNodeAddress for use as a within scope.
 *
 * Only block-kind addresses with a `nodeId` are supported for scoping.
 * Returns the validated `nodeId` and optional `nodeType` for downstream
 * verification against the live document in {@link resolveWithinAddress}.
 */
function validateWithinAddress(address: SDFindInput['within'] & object): {
  nodeId: string;
  nodeType?: import('@superdoc/document-api').BlockNodeType;
} {
  if (address.kind === 'block' && 'nodeId' in address && typeof address.nodeId === 'string') {
    return { nodeId: address.nodeId, nodeType: address.nodeType };
  }

  throw new DocumentApiAdapterError('INVALID_TARGET', '"within" scope requires a BlockNodeAddress with a nodeId.', {
    field: 'within',
    value: address,
  });
}

/**
 * Resolves a within-scope address against the live document index.
 *
 * When `expectedNodeType` is provided, uses the composite `nodeType:nodeId`
 * key via {@link findBlockByIdStrict} — this disambiguates duplicate nodeIds
 * that differ by type. Without a nodeType, falls back to
 * {@link findBlockByNodeIdOnly} which handles alias IDs (e.g. sdBlockId).
 */
function resolveWithinAddress(
  index: ReturnType<typeof getBlockIndex>,
  nodeId: string,
  expectedNodeType?: import('@superdoc/document-api').BlockNodeType,
): import('@superdoc/document-api').BlockNodeAddress {
  if (expectedNodeType) {
    const match = findBlockByIdStrict(index, { kind: 'block', nodeType: expectedNodeType, nodeId });
    return { kind: 'block', nodeType: match.nodeType, nodeId: match.nodeId };
  }

  const match = findBlockByNodeIdOnly(index, nodeId);
  return { kind: 'block', nodeType: match.nodeType, nodeId: match.nodeId };
}

/**
 * Projects a matched address into an SDNodeResult by looking up the PM node
 * in the block index (for blocks) or inline index (for inlines) and projecting
 * it to an SDM/1 node.
 *
 * Returns NodeAddress directly.
 */
function projectMatchToSDNodeResult(
  editor: Editor,
  address: NodeAddress,
  blockIndex: ReturnType<typeof getBlockIndex>,
): SDNodeResult | null {
  if (address.kind === 'block') {
    // Look up by nodeId in the byId map
    const candidate = blockIndex.byId.get(`${address.nodeType}:${address.nodeId}`);
    if (!candidate) {
      // Fallback: linear scan
      const found = blockIndex.candidates.find((c) => c.nodeType === address.nodeType && c.nodeId === address.nodeId);
      if (!found) return null;
      return {
        node: projectContentNode(found.node),
        address,
      };
    }
    return {
      node: projectContentNode(candidate.node),
      address,
    };
  }

  // For inline/text addresses, try to resolve the actual PM node via the inline
  // index so we return the correct node kind (hyperlink, image, etc.) rather
  // than always synthesizing a run.
  const inlineIndex = getInlineIndex(editor);
  const inlineCandidate = findInlineByAnchor(inlineIndex, address);
  if (inlineCandidate) {
    // Node-based inlines (image, tab, run, etc.) have a PM node reference.
    if (inlineCandidate.node) {
      return {
        node: projectInlineNode(inlineCandidate.node),
        address,
      };
    }
    // Mark-based inlines (hyperlink, comment) have mark/attrs but no node.
    const markProjected = projectMarkBasedInline(editor, inlineCandidate);
    if (markProjected) {
      return { node: markProjected, address };
    }
  }

  // Fallback for text-range matches (no discrete inline node): extract text content.
  const resolvedText = resolveTextByBlockId(editor, address.anchor);
  return {
    node: { kind: 'run', run: { text: resolvedText } },
    address,
  };
}

// resolveInlineText is now handled by resolveTextByBlockId from sd-projection.

/**
 * Executes an SDM/1 find operation against the editor's current state.
 *
 * Translates SDFindInput → internal Query, runs existing strategy code,
 * then projects results into SDNodeResult items.
 *
 * @param input.options - SDReadOptions controlling result depth.
 *   Currently accepted but reserved for future use:
 *   - `includeResolved` — include resolved style values per node
 *   - `includeProvenance` — include source provenance metadata
 *   - `includeContext` — include parent/sibling context in each SDNodeResult
 */
export function sdFindAdapter(editor: Editor, input: SDFindInput): SDFindResult {
  const query = translateToInternalQuery(input);
  const index = getBlockIndex(editor);

  // Resolve within scope after index is built — validates the caller-supplied
  // nodeType matches the actual node found in the document.
  if (input.within) {
    const { nodeId, nodeType } = validateWithinAddress(input.within);
    query.within = resolveWithinAddress(index, nodeId, nodeType);
  }

  const diagnostics: UnknownNodeDiagnostic[] = [];

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

  const items: SDNodeResult[] = [];
  for (const address of result.matches) {
    const projected = projectMatchToSDNodeResult(editor, address, index);
    if (projected) items.push(projected);
  }

  return {
    total: result.total,
    limit: input.limit ?? result.total,
    offset: input.offset ?? 0,
    items,
  };
}
