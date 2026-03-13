import type { Editor } from '../core/Editor.js';
import type {
  FindOutput,
  Query,
  SDFindInput,
  SDFindResult,
  SDNodeResult,
  SDAddress,
  NodeAddress,
  NodeType,
  UnknownNodeDiagnostic,
} from '@superdoc/document-api';
import { buildResolvedHandle, buildDiscoveryItem, buildDiscoveryResult } from '@superdoc/document-api';
import { DocumentApiAdapterError } from './errors.js';
import { dedupeDiagnostics } from './helpers/adapter-utils.js';
import { getBlockIndex, getInlineIndex } from './helpers/index-cache.js';
import { findInlineByAnchor } from './helpers/inline-address-resolver.js';
import { findBlockByNodeIdOnly } from './helpers/node-address-resolver.js';
import { resolveIncludedNodes } from './helpers/node-info-resolver.js';
import { collectUnknownNodeDiagnostics, isInlineQuery, shouldQueryBothKinds } from './find/common.js';
import { executeBlockSelector } from './find/block-strategy.js';
import { executeDualKindSelector } from './find/dual-kind-strategy.js';
import { executeInlineSelector } from './find/inline-strategy.js';
import { executeTextSelector } from './find/text-strategy.js';
import { getRevision } from './plan-engine/revision-tracker.js';
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

  if (select.type === 'text') {
    return {
      select: {
        type: 'text',
        pattern: select.pattern,
        ...(select.mode != null && { mode: select.mode }),
        ...(select.caseSensitive != null && { caseSensitive: select.caseSensitive }),
      },
      limit,
      offset,
      // within is resolved in sdFindAdapter after block index is built
      includeNodes: true,
    };
  }

  // SDNodeSelector → internal NodeSelector
  // Cast nodeKind (string) to NodeType — the internal engine handles unknown types gracefully.
  const nodeSelect = {
    type: 'node' as const,
    ...(select.nodeKind != null && { nodeType: select.nodeKind as NodeType }),
    ...(select.kind === 'content' && { kind: 'block' as const }),
    ...(select.kind === 'inline' && { kind: 'inline' as const }),
  };

  return {
    select: nodeSelect,
    limit,
    offset,
    // within is resolved in sdFindAdapter after block index is built
    includeNodes: true,
  };
}

/**
 * Validates an SDAddress for use as a within scope.
 *
 * Only content-kind addresses with a `nodeId` are supported for scoping.
 * The actual nodeType resolution is deferred to {@link resolveWithinNodeType}
 * which requires the block index.
 */
function validateWithinAddress(sdAddress: SDFindInput['within'] & object): { nodeId: string } {
  if (sdAddress.kind === 'content' && sdAddress.nodeId) {
    return { nodeId: sdAddress.nodeId };
  }

  throw new DocumentApiAdapterError(
    'INVALID_TARGET',
    `"within" scope requires a content-kind SDAddress with a nodeId. Got kind="${sdAddress.kind}".`,
    { field: 'within', value: sdAddress },
  );
}

/**
 * Resolves the actual nodeType for a within-scope nodeId using
 * {@link findBlockByNodeIdOnly}, which handles alias IDs (e.g. sdBlockId)
 * and throws a precise error for ambiguous or missing targets.
 */
function resolveWithinNodeType(index: ReturnType<typeof getBlockIndex>, nodeId: string): NodeAddress {
  // findBlockByNodeIdOnly checks primary candidates, then alias entries,
  // and throws AMBIGUOUS_TARGET / TARGET_NOT_FOUND as appropriate.
  const match = findBlockByNodeIdOnly(index, nodeId);
  return {
    kind: 'block',
    nodeType: match.nodeType,
    nodeId: match.nodeId,
  } as NodeAddress;
}

/**
 * Builds an SDAddress from an internal NodeAddress match result.
 */
function toSDAddress(address: NodeAddress): SDAddress {
  if (address.kind === 'block') {
    return {
      kind: 'content',
      stability: 'stable',
      nodeId: address.nodeId,
    };
  }
  return {
    kind: 'inline',
    stability: 'ephemeral',
    anchor: {
      start: { blockId: address.anchor.start.blockId, offset: address.anchor.start.offset },
      end: { blockId: address.anchor.end.blockId, offset: address.anchor.end.offset },
    },
  };
}

/**
 * Projects a matched address into an SDNodeResult by looking up the PM node
 * in the block index (for blocks) or inline index (for inlines) and projecting
 * it to an SDM/1 node.
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
        address: toSDAddress(address),
      };
    }
    return {
      node: projectContentNode(candidate.node),
      address: toSDAddress(address),
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
        address: toSDAddress(address),
      };
    }
    // Mark-based inlines (hyperlink, comment) have mark/attrs but no node.
    const markProjected = projectMarkBasedInline(editor, inlineCandidate);
    if (markProjected) {
      return { node: markProjected, address: toSDAddress(address) };
    }
  }

  // Fallback for text-range matches (no discrete inline node): extract text content.
  const resolvedText = resolveTextByBlockId(editor, address.anchor);
  return {
    node: { kind: 'run', run: { text: resolvedText } },
    address: toSDAddress(address),
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

  // Resolve within scope after index is built (SDAddress doesn't carry nodeType,
  // so we need the index to look up the actual PM node type for the nodeId).
  if (input.within) {
    const { nodeId } = validateWithinAddress(input.within);
    query.within = resolveWithinNodeType(index, nodeId);
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
