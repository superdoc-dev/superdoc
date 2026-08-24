/**
 * Citation plan-engine wrappers — bridge citations.*, citations.sources.*,
 * and citations.bibliography.* operations.
 */

import { v4 as uuidv4 } from 'uuid';
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
  findAllBibliographies,
  findAllCitations,
  resolveCitationTarget,
  extractCitationInfo,
  buildCitationDiscoveryItem,
  resolveBibliographyTarget,
  resolvePostMutationBibliographyId,
  extractBibliographyInfo,
  buildBibliographyDiscoveryItem,
  getSourcesFromConverter,
  resolveSourceTarget,
  syncBibliographyStyleToConverter,
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
      const resolvedText = buildCitationResolvedText(editor, input.sourceIds);
      const node = citationType.create({
        instruction,
        sourceIds: input.sourceIds,
        resolvedText,
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
        newAttrs.resolvedText = buildCitationResolvedText(editor, newAttrs.sourceIds as string[]);
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
  if (!(options?.dryRun ?? false)) {
    dispatchReferenceDisplayRefresh(editor);
  }
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

  if (!(options?.dryRun ?? false)) {
    dispatchReferenceDisplayRefresh(editor);
  }

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

  if (!(options?.dryRun ?? false)) {
    dispatchReferenceDisplayRefresh(editor);
  }

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

  const nodeId = uuidv4();
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
        {
          instruction: 'BIBLIOGRAPHY',
          sdBlockId: nodeId,
          ...(input.style !== undefined ? { style: input.style } : {}),
        },
        buildBibliographyContent(editor, input.style),
      );
      const { tr } = editor.state;
      tr.insert(pos, node);
      if (input.style !== undefined) {
        refreshCitationDisplayText(editor, tr, input.style);
      }
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return bibFailure('NO_OP', 'Insert produced no change.');

  if (input.style !== undefined) {
    syncBibliographyStyleToConverter(editor, input.style);
  }

  const postMutationId = resolvePostMutationBibliographyId(editor.state.doc, nodeId);
  return bibSuccess({ kind: 'block', nodeType: 'bibliography', nodeId: postMutationId });
}

export function bibliographyConfigureWrapper(
  editor: Editor,
  input: BibliographyConfigureInput,
  options?: MutationOptions,
): BibliographyMutationResult {
  rejectTrackedMode('citations.bibliography.configure', options);

  const resolved = resolveBibliographyTarget(editor.state.doc, input.target);
  const stableNodeId = resolved.commandNodeId ?? resolved.nodeId;
  const address: BibliographyAddress = { kind: 'block', nodeType: 'bibliography', nodeId: stableNodeId };

  if (options?.dryRun) return bibSuccess(address);

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      const bibliographyAttrsByPos = new Map<number, Record<string, unknown>>();
      bibliographyAttrsByPos.set(resolved.pos, {
        ...resolved.node.attrs,
        style: input.style,
      });
      let changed = refreshBibliographyContent(editor, tr, input.style, bibliographyAttrsByPos);
      changed = refreshCitationDisplayText(editor, tr, input.style) || changed;
      if (!changed) return false;
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return bibFailure('NO_OP', 'Configure produced no change.');

  syncBibliographyStyleToConverter(editor, input.style);

  const bibliographies = findAllBibliographies(editor.state.doc);
  const postMutationBibliography =
    bibliographies.find((bibliography) => bibliography.pos === resolved.pos) ??
    bibliographies.find((bibliography) => bibliography.commandNodeId === stableNodeId);
  const postMutationId =
    postMutationBibliography?.nodeId ?? resolvePostMutationBibliographyId(editor.state.doc, stableNodeId);
  return bibSuccess({ kind: 'block', nodeType: 'bibliography', nodeId: postMutationId });
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

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      const style = resolved.node.attrs.style as string | undefined;
      const bibliographyAttrsByPos = new Map<number, Record<string, unknown>>();
      bibliographyAttrsByPos.set(resolved.pos, resolved.node.attrs);
      const changed = refreshBibliographyContent(editor, tr, style, bibliographyAttrsByPos);
      if (!changed) return false;
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return bibFailure('NO_OP', 'Rebuild produced no change.');
  const style = resolved.node.attrs.style as string | undefined;
  if (style !== undefined) {
    syncBibliographyStyleToConverter(editor, style);
  }
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

function buildCitationResolvedText(editor: Editor, sourceIds: string[], styleOverride?: string): string {
  const sources = getSourcesFromConverter(editor);
  const styleKind = getCitationStyleKind(editor, styleOverride);
  const labels = sourceIds
    .map((sourceId, fallbackIndex) => {
      const sourceIndex = sources.findIndex((source) => source.tag === sourceId);
      return {
        source: sourceIndex >= 0 ? sources[sourceIndex] : undefined,
        fallbackNumber: sourceIndex >= 0 ? sourceIndex + 1 : fallbackIndex + 1,
      };
    })
    .map(({ source, fallbackNumber }) => formatCitationSourceLabel(source, styleKind, fallbackNumber))
    .filter((label): label is string => Boolean(label));

  if (labels.length === 0) return '';
  if (styleKind === 'ieee') return labels.join(', ');
  return `(${labels.join('; ')})`;
}

function refreshCitationDisplayText(editor: Editor, tr: typeof editor.state.tr, styleOverride?: string): boolean {
  if (typeof editor.state.doc.descendants !== 'function') return false;

  let changed = false;
  editor.state.doc.descendants((node, pos) => {
    if (node.type?.name !== 'citation') return true;

    const sourceIds = Array.isArray(node.attrs?.sourceIds) ? (node.attrs.sourceIds as string[]) : [];
    const resolvedText = buildCitationResolvedText(editor, sourceIds, styleOverride);
    if (node.attrs?.resolvedText === resolvedText) return true;

    const mapped = typeof tr.mapping?.mapResult === 'function' ? tr.mapping.mapResult(pos) : undefined;
    const mappedPos = mapped ? mapped.pos : (tr.mapping?.map(pos) ?? pos);
    if (mapped?.deleted) return true;

    tr.setNodeMarkup(mappedPos, undefined, {
      ...node.attrs,
      resolvedText,
    });
    changed = true;
    return true;
  });
  return changed;
}

function dispatchReferenceDisplayRefresh(editor: Editor): void {
  const { tr } = editor.state;
  let changed = refreshCitationDisplayText(editor, tr);
  changed = refreshBibliographyContent(editor, tr) || changed;
  if (!changed) return;
  tr.setMeta('addToHistory', false);
  editor.dispatch(tr);
  clearIndexCache(editor);
}

function refreshBibliographyContent(
  editor: Editor,
  tr: typeof editor.state.tr,
  styleOverride?: string,
  attrsByPos = new Map<number, Record<string, unknown>>(),
): boolean {
  const bibliographies: Array<{ node: import('prosemirror-model').Node; pos: number }> = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type?.name === 'bibliography') {
      bibliographies.push({ node, pos });
      return false;
    }
    return true;
  });

  let changed = false;
  for (const { node, pos } of bibliographies.reverse()) {
    const baseAttrs = attrsByPos.get(pos) ?? node.attrs;
    const attrs = styleOverride !== undefined ? { ...baseAttrs, style: styleOverride } : baseAttrs;
    const content = buildBibliographyContent(editor, styleOverride ?? (attrs.style as string | undefined));
    const attrsChanged = !areNodeAttrsEqual(node.attrs, attrs);
    const contentChanged = node.textContent !== getBibliographyContentText(content);
    if (!attrsChanged && !contentChanged) continue;

    tr.replaceWith(pos, pos + node.nodeSize, node.type.create(attrs, content));
    changed = true;
  }

  return changed;
}

function getBibliographyContentText(content: ReturnType<typeof buildBibliographyContent>): string {
  if (Array.isArray(content)) return content.map((node) => node.textContent).join('');
  if (content && typeof content === 'object' && 'textContent' in content) return String(content.textContent);
  return '';
}

function areNodeAttrsEqual(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

type CitationStyleKind = 'authorYear' | 'ieee';

function getCitationStyleKind(editor: Editor, styleOverride?: string): CitationStyleKind {
  const override = normalizeCitationFieldText(styleOverride).toLowerCase();
  if (override) return override.includes('ieee') ? 'ieee' : 'authorYear';

  const bibliographyPart = (
    editor as unknown as {
      converter?: { bibliographyPart?: { styleName?: unknown; selectedStyle?: unknown } };
    }
  ).converter?.bibliographyPart;
  const styleName = normalizeCitationFieldText(bibliographyPart?.styleName).toLowerCase();
  const selectedStyle = normalizeCitationFieldText(bibliographyPart?.selectedStyle).toLowerCase();

  return styleName === 'ieee' || selectedStyle.includes('ieee') ? 'ieee' : 'authorYear';
}

function formatCitationSourceLabel(
  source: CitationSourceRecord | undefined,
  styleKind: CitationStyleKind,
  fallbackNumber: number,
): string {
  if (!source) return '';
  if (styleKind === 'ieee') return `[${formatCitationReferenceNumber(source, fallbackNumber)}]`;

  const authorLabel = formatCitationAuthorLabel(source.fields.authors);
  const year = normalizeCitationFieldText(source.fields.year);
  if (authorLabel && year) return `${authorLabel}, ${year}`;
  if (authorLabel) return authorLabel;
  if (year) return year;

  return (
    normalizeCitationFieldText(source.fields.shortTitle) ||
    normalizeCitationFieldText(source.fields.title) ||
    source.tag
  );
}

function formatCitationReferenceNumber(source: CitationSourceRecord, fallbackNumber: number): string {
  return normalizeCitationFieldText(source.fields.refOrder) || String(fallbackNumber);
}

function formatCitationAuthorLabel(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return '';

  const lastNames = value
    .map((author) => {
      if (!author || typeof author !== 'object') return '';
      return normalizeCitationFieldText((author as { last?: unknown }).last);
    })
    .filter(Boolean);

  if (lastNames.length === 0) return '';
  if (lastNames.length === 1) return lastNames[0]!;
  if (lastNames.length === 2) return `${lastNames[0]} & ${lastNames[1]}`;
  return `${lastNames[0]} et al.`;
}

function normalizeCitationFieldText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function buildBibliographyContent(editor: Editor, styleOverride?: string) {
  const paragraphType = editor.schema.nodes.paragraph;
  if (!paragraphType) return undefined;

  const styleKind = getCitationStyleKind(editor, styleOverride);
  const entries = getSourcesFromConverter(editor)
    .map((source, index) => formatBibliographySourceEntry(source, styleKind, index + 1))
    .filter(Boolean);
  if (entries.length === 0 || typeof editor.schema.text !== 'function') return paragraphType.create();

  return entries.map((entry) => {
    const textNode = editor.schema.text(entry);
    const runType = editor.schema.nodes.run;
    const content = runType ? runType.create({}, textNode) : textNode;
    return paragraphType.create({}, content);
  });
}

function formatBibliographySourceEntry(
  source: CitationSourceRecord,
  styleKind: CitationStyleKind,
  fallbackNumber: number,
): string {
  if (styleKind === 'ieee') return formatIeeeBibliographySourceEntry(source, fallbackNumber);

  const authorLabel = formatCitationAuthorLabel(source.fields.authors);
  const year = normalizeCitationFieldText(source.fields.year);
  const title = normalizeCitationFieldText(source.fields.title);
  const publisher = normalizeCitationFieldText(source.fields.publisher);
  const fallback = normalizeCitationFieldText(source.fields.shortTitle) || source.tag;

  const parts: string[] = [];
  if (authorLabel && year) {
    parts.push(`${authorLabel} (${year}).`);
  } else if (authorLabel) {
    parts.push(`${authorLabel}.`);
  } else if (year) {
    parts.push(`(${year}).`);
  }

  if (title) parts.push(`${title}.`);
  if (publisher) parts.push(`${publisher}.`);
  if (parts.length === 0) parts.push(fallback);

  return parts.join(' ');
}

function formatIeeeBibliographySourceEntry(source: CitationSourceRecord, fallbackNumber: number): string {
  const authorLabel = formatCitationAuthorLabel(source.fields.authors);
  const year = normalizeCitationFieldText(source.fields.year);
  const title = normalizeCitationFieldText(source.fields.title);
  const publisher = normalizeCitationFieldText(source.fields.publisher);
  const fallback = normalizeCitationFieldText(source.fields.shortTitle) || source.tag;

  const parts = [`[${formatCitationReferenceNumber(source, fallbackNumber)}]`];
  if (authorLabel) parts.push(`${authorLabel}.`);
  if (title) parts.push(`${title}.`);
  if (publisher && year) {
    parts.push(`${publisher}, ${year}.`);
  } else if (publisher) {
    parts.push(`${publisher}.`);
  } else if (year) {
    parts.push(`${year}.`);
  }
  if (parts.length === 1) parts.push(fallback);

  return parts.join(' ');
}
