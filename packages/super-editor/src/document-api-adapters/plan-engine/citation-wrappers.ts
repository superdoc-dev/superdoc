/**
 * Citation plan-engine wrappers — bridge citations.*, citations.sources.*,
 * and citations.bibliography.* operations.
 */

import type { Editor } from '../../core/Editor.js';
import type {
  CitationListInput,
  CitationGetInput,
  CitationInsertInput,
  CitationUpdateInput,
  CitationRemoveInput,
  CitationInfo,
  CitationMutationResult,
  CitationAddress,
  CitationSourceListInput,
  CitationSourceGetInput,
  CitationSourceInsertInput,
  CitationSourceUpdateInput,
  CitationSourceRemoveInput,
  CitationSourceInfo,
  CitationSourceMutationResult,
  CitationSourceAddress,
  BibliographyGetInput,
  BibliographyInsertInput,
  BibliographyConfigureInput,
  BibliographyRebuildInput,
  BibliographyRemoveInput,
  BibliographyInfo,
  BibliographyMutationResult,
  BibliographyAddress,
  MutationOptions,
  ReceiptFailureCode,
  CitationSourceDomain,
  CitationSourceType,
} from '@superdoc/document-api';
import { buildDiscoveryResult, buildDiscoveryItem, buildResolvedHandle } from '@superdoc/document-api';
import {
  findAllCitations,
  resolveCitationTarget,
  extractCitationInfo,
  buildCitationDiscoveryItem,
  findAllBibliographies,
  resolveBibliographyTarget,
  extractBibliographyInfo,
  buildBibliographyDiscoveryItem,
  getSourcesFromConverter,
  resolveSourceTarget,
  type CitationSourceRecord,
} from '../helpers/citation-resolver.js';
import { paginate, resolveInlineInsertPosition, resolveBlockCreatePosition } from '../helpers/adapter-utils.js';
import { getRevision } from './revision-tracker.js';
import { executeDomainCommand } from './plan-wrappers.js';
import { rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { clearIndexCache } from '../helpers/index-cache.js';
import { executeOutOfBandMutation } from '../out-of-band-mutation.js';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

function citationSuccess(address: CitationAddress): CitationMutationResult {
  return { success: true, citation: address };
}

function citationFailure(code: ReceiptFailureCode, message: string): CitationMutationResult {
  return { success: false, failure: { code, message } };
}

function sourceSuccess(address: CitationSourceAddress): CitationSourceMutationResult {
  return { success: true, source: address };
}

function sourceFailure(code: ReceiptFailureCode, message: string): CitationSourceMutationResult {
  return { success: false, failure: { code, message } };
}

function bibSuccess(address: BibliographyAddress): BibliographyMutationResult {
  return { success: true, bibliography: address };
}

function bibFailure(code: ReceiptFailureCode, message: string): BibliographyMutationResult {
  return { success: false, failure: { code, message } };
}

function receiptApplied(receipt: ReturnType<typeof executeDomainCommand>): boolean {
  return receipt.steps[0]?.effect === 'changed';
}

// ---------------------------------------------------------------------------
// Citation inline reads
// ---------------------------------------------------------------------------

export function citationsListWrapper(editor: Editor, query?: CitationListInput) {
  const doc = editor.state.doc;
  const revision = getRevision(editor);
  const citations = findAllCitations(doc);

  const allItems = citations.map((c) => buildCitationDiscoveryItem(doc, c, revision));
  const { total, items: paged } = paginate(allItems, query?.offset, query?.limit);
  const effectiveLimit = query?.limit ?? total;

  return buildDiscoveryResult({
    evaluatedRevision: revision,
    total,
    items: paged,
    page: { limit: effectiveLimit, offset: query?.offset ?? 0, returned: paged.length },
  });
}

export function citationsGetWrapper(editor: Editor, input: CitationGetInput): CitationInfo {
  const resolved = resolveCitationTarget(editor.state.doc, input.target);
  return extractCitationInfo(editor.state.doc, resolved);
}

// ---------------------------------------------------------------------------
// Citation inline mutations
// ---------------------------------------------------------------------------

export function citationsInsertWrapper(
  editor: Editor,
  input: CitationInsertInput,
  options?: MutationOptions,
): CitationMutationResult {
  rejectTrackedMode('citations.insert', options);

  const dummyAddress: CitationAddress = {
    kind: 'inline',
    nodeType: 'citation',
    anchor: { start: { blockId: '', offset: 0 }, end: { blockId: '', offset: 0 } },
  };

  if (options?.dryRun) return citationSuccess(dummyAddress);

  const citationType = editor.schema.nodes.citation;
  if (!citationType) {
    throw new DocumentApiAdapterError('CAPABILITY_UNAVAILABLE', 'citations.insert: citation node type not in schema.');
  }

  const resolved = resolveInlineInsertPosition(editor, input.at, 'citations.insert');

  const receipt = executeDomainCommand(
    editor,
    (): boolean => {
      const instruction = buildCitationInstruction(input.sourceIds);
      const node = citationType.create({
        instruction,
        sourceIds: input.sourceIds,
        resolvedText: '',
      });
      const { tr } = editor.state;
      tr.insert(resolved.from, node);
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return citationFailure('NO_OP', 'Insert produced no change.');

  const insertedAddress = resolveInsertedCitationAddress(editor.state.doc, resolved.from, input.sourceIds);
  return citationSuccess(insertedAddress);
}

export function citationsUpdateWrapper(
  editor: Editor,
  input: CitationUpdateInput,
  options?: MutationOptions,
): CitationMutationResult {
  rejectTrackedMode('citations.update', options);

  const resolved = resolveCitationTarget(editor.state.doc, input.target);
  const address = extractCitationInfo(editor.state.doc, resolved).address;

  if (options?.dryRun) return citationSuccess(address);

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      const newAttrs = { ...resolved.node.attrs };
      if (input.patch?.sourceIds) newAttrs.sourceIds = input.patch.sourceIds;
      if (input.patch?.sourceIds) {
        newAttrs.instruction = buildCitationInstruction((newAttrs.sourceIds as string[]) ?? []);
      }
      tr.setNodeMarkup(resolved.pos, undefined, newAttrs);
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return citationFailure('NO_OP', 'Update produced no change.');
  return citationSuccess(address);
}

export function citationsRemoveWrapper(
  editor: Editor,
  input: CitationRemoveInput,
  options?: MutationOptions,
): CitationMutationResult {
  rejectTrackedMode('citations.remove', options);

  const resolved = resolveCitationTarget(editor.state.doc, input.target);
  const address = extractCitationInfo(editor.state.doc, resolved).address;

  if (options?.dryRun) return citationSuccess(address);

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      tr.delete(resolved.pos, resolved.pos + resolved.node.nodeSize);
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return citationFailure('NO_OP', 'Remove produced no change.');
  return citationSuccess(address);
}

// ---------------------------------------------------------------------------
// Source operations (out-of-band — modify converter bibliography state)
// ---------------------------------------------------------------------------

export function citationSourcesListWrapper(editor: Editor, query?: CitationSourceListInput) {
  const revision = getRevision(editor);
  const sources = getSourcesFromConverter(editor);

  const allItems = sources.map((s) => {
    const domain: CitationSourceDomain = {
      address: { kind: 'entity', entityType: 'citationSource', sourceId: s.tag },
      sourceId: s.tag,
      tag: s.tag,
      type: s.type as CitationSourceType,
      fields: s.fields as CitationSourceDomain['fields'],
    };
    const handle = buildResolvedHandle(s.tag, 'stable', 'node');
    return buildDiscoveryItem(`source:${s.tag}:${revision}`, handle, domain);
  });

  const { total, items: paged } = paginate(allItems, query?.offset, query?.limit);
  const effectiveLimit = query?.limit ?? total;

  return buildDiscoveryResult({
    evaluatedRevision: revision,
    total,
    items: paged,
    page: { limit: effectiveLimit, offset: query?.offset ?? 0, returned: paged.length },
  });
}

export function citationSourcesGetWrapper(editor: Editor, input: CitationSourceGetInput): CitationSourceInfo {
  const source = resolveSourceTarget(editor, input.target);
  return {
    address: { kind: 'entity', entityType: 'citationSource', sourceId: source.tag },
    sourceId: source.tag,
    tag: source.tag,
    type: source.type as CitationSourceType,
    fields: source.fields as CitationSourceInfo['fields'],
  };
}

export function citationSourcesInsertWrapper(
  editor: Editor,
  input: CitationSourceInsertInput,
  options?: MutationOptions,
): CitationSourceMutationResult {
  rejectTrackedMode('citations.sources.insert', options);

  const sourceId = `source-${Date.now()}`;
  const address: CitationSourceAddress = { kind: 'entity', entityType: 'citationSource', sourceId };

  const payload = executeOutOfBandMutation(
    editor,
    (dryRun) => {
      const sources = getSourcesFromConverter(editor);
      if (sources.some((s) => s.tag === sourceId)) {
        return { changed: false, payload: 'duplicate' as const };
      }
      if (!dryRun) {
        sources.push({
          tag: sourceId,
          type: input.type,
          fields: (input.fields ?? {}) as Record<string, unknown>,
        });
      }
      return { changed: true, payload: 'inserted' as const };
    },
    { dryRun: options?.dryRun ?? false, expectedRevision: options?.expectedRevision },
  );

  if (payload === 'duplicate') return sourceFailure('NO_OP', `Source with id "${sourceId}" already exists.`);
  return sourceSuccess(address);
}

export function citationSourcesUpdateWrapper(
  editor: Editor,
  input: CitationSourceUpdateInput,
  options?: MutationOptions,
): CitationSourceMutationResult {
  rejectTrackedMode('citations.sources.update', options);

  const source = resolveSourceTarget(editor, input.target);
  const address: CitationSourceAddress = { kind: 'entity', entityType: 'citationSource', sourceId: source.tag };

  executeOutOfBandMutation(
    editor,
    (dryRun) => {
      if (!dryRun && input.patch) {
        Object.assign(source.fields, input.patch);
      }
      return { changed: true, payload: undefined };
    },
    { dryRun: options?.dryRun ?? false, expectedRevision: options?.expectedRevision },
  );

  return sourceSuccess(address);
}

export function citationSourcesRemoveWrapper(
  editor: Editor,
  input: CitationSourceRemoveInput,
  options?: MutationOptions,
): CitationSourceMutationResult {
  rejectTrackedMode('citations.sources.remove', options);

  const source = resolveSourceTarget(editor, input.target);
  const address: CitationSourceAddress = { kind: 'entity', entityType: 'citationSource', sourceId: source.tag };

  executeOutOfBandMutation(
    editor,
    (dryRun) => {
      if (!dryRun) {
        const sources = getSourcesFromConverter(editor);
        const idx = sources.findIndex((s) => s.tag === source.tag);
        if (idx >= 0) sources.splice(idx, 1);
      }
      return { changed: true, payload: undefined };
    },
    { dryRun: options?.dryRun ?? false, expectedRevision: options?.expectedRevision },
  );

  return sourceSuccess(address);
}

// ---------------------------------------------------------------------------
// Bibliography operations
// ---------------------------------------------------------------------------

export function bibliographyGetWrapper(editor: Editor, input: BibliographyGetInput): BibliographyInfo {
  const resolved = resolveBibliographyTarget(editor.state.doc, input.target);
  return extractBibliographyInfo(resolved);
}

export function bibliographyInsertWrapper(
  editor: Editor,
  input: BibliographyInsertInput,
  options?: MutationOptions,
): BibliographyMutationResult {
  rejectTrackedMode('citations.bibliography.insert', options);

  const nodeId = `bibliography-${Date.now()}`;
  const address: BibliographyAddress = { kind: 'block', nodeType: 'bibliography', nodeId };

  if (options?.dryRun) return bibSuccess(address);

  const bibType = editor.schema.nodes.bibliography;
  if (!bibType) {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      'citations.bibliography.insert: bibliography node type not in schema.',
    );
  }

  const pos = resolveBlockCreatePosition(editor, input.at);

  const receipt = executeDomainCommand(
    editor,
    () => {
      const node = bibType.create(
        { instruction: 'BIBLIOGRAPHY', sdBlockId: nodeId },
        editor.schema.nodes.paragraph.create(),
      );
      const { tr } = editor.state;
      tr.insert(pos, node);
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return bibFailure('NO_OP', 'Insert produced no change.');
  return bibSuccess(address);
}

export function bibliographyConfigureWrapper(
  editor: Editor,
  input: BibliographyConfigureInput,
  options?: MutationOptions,
): BibliographyMutationResult {
  rejectTrackedMode('citations.bibliography.configure', options);

  const all = findAllBibliographies(editor.state.doc);
  const nodeId = all[0]?.nodeId ?? '';
  const address: BibliographyAddress = { kind: 'block', nodeType: 'bibliography', nodeId };

  if (options?.dryRun) return bibSuccess(address);

  // Apply the style to all bibliography nodes in the document.
  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      let changed = false;

      tr.doc.descendants((node, pos) => {
        if (node.type.name !== 'bibliography') return true;
        if ((node.attrs.style as string) === input.style) return true;
        tr.setNodeMarkup(tr.mapping.map(pos), undefined, {
          ...node.attrs,
          style: input.style,
        });
        changed = true;
        return false; // bibliography is a block, no need to descend
      });

      if (!changed) return false;
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return bibFailure('NO_OP', 'Configure produced no change.');
  return bibSuccess(address);
}

export function bibliographyRebuildWrapper(
  editor: Editor,
  input: BibliographyRebuildInput,
  options?: MutationOptions,
): BibliographyMutationResult {
  rejectTrackedMode('citations.bibliography.rebuild', options);

  const resolved = resolveBibliographyTarget(editor.state.doc, input.target);
  const address: BibliographyAddress = { kind: 'block', nodeType: 'bibliography', nodeId: resolved.nodeId };

  if (options?.dryRun) return bibSuccess(address);
  // Rebuild defers to layout engine
  return bibSuccess(address);
}

export function bibliographyRemoveWrapper(
  editor: Editor,
  input: BibliographyRemoveInput,
  options?: MutationOptions,
): BibliographyMutationResult {
  rejectTrackedMode('citations.bibliography.remove', options);

  const resolved = resolveBibliographyTarget(editor.state.doc, input.target);
  const address: BibliographyAddress = { kind: 'block', nodeType: 'bibliography', nodeId: resolved.nodeId };

  if (options?.dryRun) return bibSuccess(address);

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      tr.delete(resolved.pos, resolved.pos + resolved.node.nodeSize);
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return bibFailure('NO_OP', 'Remove produced no change.');
  return bibSuccess(address);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeInlineAddress(doc: import('prosemirror-model').Node, pos: number): CitationAddress {
  const node = doc.nodeAt?.(pos);
  if (!node || typeof doc.resolve !== 'function') {
    return {
      kind: 'inline',
      nodeType: 'citation',
      anchor: { start: { blockId: '', offset: pos }, end: { blockId: '', offset: pos + (node?.nodeSize ?? 1) } },
    };
  }
  const r = doc.resolve(pos);
  let blockId = '';
  for (let depth = r.depth; depth >= 0; depth--) {
    const bid = r.node(depth).attrs?.sdBlockId as string | undefined;
    if (bid) {
      blockId = bid;
      break;
    }
  }
  const offset = pos - r.start(r.depth);
  return {
    kind: 'inline',
    nodeType: 'citation',
    anchor: {
      start: { blockId, offset },
      end: { blockId, offset: offset + node.nodeSize },
    },
  };
}

function resolveInsertedCitationAddress(
  doc: import('prosemirror-model').Node,
  preferredPos: number,
  sourceIds: string[],
): CitationAddress {
  const directNode = doc.nodeAt?.(preferredPos);
  if (directNode?.type?.name === 'citation') {
    return computeInlineAddress(doc, preferredPos);
  }

  const exactSourceIdMatches: number[] = [];
  const allCitationPositions: number[] = [];

  doc.descendants?.((node, pos) => {
    if (node.type?.name !== 'citation') return true;
    allCitationPositions.push(pos);

    const nodeSourceIds = Array.isArray(node.attrs?.sourceIds) ? (node.attrs.sourceIds as string[]) : [];
    if (sameSourceIds(nodeSourceIds, sourceIds)) {
      exactSourceIdMatches.push(pos);
    }
    return true;
  });

  const candidates = exactSourceIdMatches.length > 0 ? exactSourceIdMatches : allCitationPositions;
  if (candidates.length === 0) {
    return computeInlineAddress(doc, preferredPos);
  }

  const nearestPos = candidates.reduce((bestPos, candidatePos) => {
    const bestDistance = Math.abs(bestPos - preferredPos);
    const candidateDistance = Math.abs(candidatePos - preferredPos);
    return candidateDistance < bestDistance ? candidatePos : bestPos;
  });

  return computeInlineAddress(doc, nearestPos);
}

function sameSourceIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function buildCitationInstruction(sourceIds: string[]): string {
  if (sourceIds.length === 0) return 'CITATION';
  const primary = sourceIds[0];
  const parts = [`CITATION ${primary}`];
  for (let i = 1; i < sourceIds.length; i++) {
    parts.push(`\\m ${sourceIds[i]}`);
  }
  return parts.join(' ');
}
