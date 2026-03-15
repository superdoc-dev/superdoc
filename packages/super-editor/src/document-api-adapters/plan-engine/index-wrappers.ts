/**
 * Index plan-engine wrappers — bridge index.* and index.entries.* operations
 * to the adapter layer.
 */

import type { Editor } from '../../core/Editor.js';
import type {
  IndexListInput,
  IndexGetInput,
  IndexInsertInput,
  IndexConfigureInput,
  IndexRebuildInput,
  IndexRemoveInput,
  IndexEntryListInput,
  IndexEntryGetInput,
  IndexEntryInsertInput,
  IndexEntryUpdateInput,
  IndexEntryRemoveInput,
  IndexInfo,
  IndexEntryInfo,
  IndexMutationResult,
  IndexEntryMutationResult,
  IndexAddress,
  IndexEntryAddress,
  MutationOptions,
  ReceiptFailureCode,
} from '@superdoc/document-api';
import { buildDiscoveryResult } from '@superdoc/document-api';
import {
  findAllIndexNodes,
  resolveIndexTarget,
  extractIndexInfo,
  buildIndexDiscoveryItem,
  findAllIndexEntries,
  resolveIndexEntryTarget,
  extractIndexEntryInfo,
  buildIndexEntryDiscoveryItem,
  parseIndexInstruction,
} from '../helpers/index-resolver.js';
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

function indexSuccess(address: IndexAddress): IndexMutationResult {
  return { success: true, index: address };
}

function indexFailure(code: ReceiptFailureCode, message: string): IndexMutationResult {
  return { success: false, failure: { code, message } };
}

function entrySuccess(address: IndexEntryAddress): IndexEntryMutationResult {
  return { success: true, entry: address };
}

function entryFailure(code: ReceiptFailureCode, message: string): IndexEntryMutationResult {
  return { success: false, failure: { code, message } };
}

function receiptApplied(receipt: ReturnType<typeof executeDomainCommand>): boolean {
  return receipt.steps[0]?.effect === 'changed';
}

// ---------------------------------------------------------------------------
// Index (block) reads
// ---------------------------------------------------------------------------

export function indexListWrapper(editor: Editor, query?: IndexListInput) {
  const doc = editor.state.doc;
  const revision = getRevision(editor);
  const nodes = findAllIndexNodes(doc);

  const allItems = nodes.map((n) => buildIndexDiscoveryItem(n, revision));
  const { total, items: paged } = paginate(allItems, query?.offset, query?.limit);
  const effectiveLimit = query?.limit ?? total;

  return buildDiscoveryResult({
    evaluatedRevision: revision,
    total,
    items: paged,
    page: { limit: effectiveLimit, offset: query?.offset ?? 0, returned: paged.length },
  });
}

export function indexGetWrapper(editor: Editor, input: IndexGetInput): IndexInfo {
  const resolved = resolveIndexTarget(editor.state.doc, input.target);
  return extractIndexInfo(resolved.node);
}

// ---------------------------------------------------------------------------
// Index (block) mutations
// ---------------------------------------------------------------------------

export function indexInsertWrapper(
  editor: Editor,
  input: IndexInsertInput,
  options?: MutationOptions,
): IndexMutationResult {
  rejectTrackedMode('index.insert', options);

  const requestedNodeId = `index-${Date.now()}`;
  const dryRunAddress: IndexAddress = { kind: 'block', nodeType: 'index', nodeId: requestedNodeId };

  if (options?.dryRun) return indexSuccess(dryRunAddress);

  const indexType = editor.schema.nodes.documentIndex ?? editor.schema.nodes.index;
  if (!indexType) {
    throw new DocumentApiAdapterError('CAPABILITY_UNAVAILABLE', 'index.insert: documentIndex node type not in schema.');
  }

  const pos = resolveBlockCreatePosition(editor, input.at);

  const receipt = executeDomainCommand(
    editor,
    () => {
      const instruction = buildIndexInstruction(input.config);
      const node = indexType.create(
        { instruction, sdBlockId: requestedNodeId },
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

  if (!receiptApplied(receipt)) return indexFailure('NO_OP', 'Insert produced no change.');
  const insertedNode = editor.state.doc.nodeAt(pos);
  const resolvedNodeId = (insertedNode?.attrs?.sdBlockId as string) ?? `index-${pos}`;
  return indexSuccess({ kind: 'block', nodeType: 'index', nodeId: resolvedNodeId });
}

export function indexConfigureWrapper(
  editor: Editor,
  input: IndexConfigureInput,
  options?: MutationOptions,
): IndexMutationResult {
  rejectTrackedMode('index.configure', options);

  const resolved = resolveIndexTarget(editor.state.doc, input.target);
  const address: IndexAddress = { kind: 'block', nodeType: 'index', nodeId: resolved.nodeId };

  if (options?.dryRun) return indexSuccess(address);

  const currentInstruction = (resolved.node.attrs.instruction as string) ?? '';
  const currentConfig = parseIndexInstruction(currentInstruction);
  const mergedConfig = { ...currentConfig };
  for (const [key, value] of Object.entries(input.patch)) {
    if (value !== undefined) {
      (mergedConfig as Record<string, unknown>)[key] = value;
    }
  }
  const newInstruction = buildIndexInstruction(mergedConfig);
  if (newInstruction === currentInstruction) {
    return indexFailure('NO_OP', 'Configuration patch produced no change.');
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      const newAttrs = { ...resolved.node.attrs, instruction: newInstruction };
      tr.setNodeMarkup(resolved.pos, undefined, newAttrs);
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return indexFailure('NO_OP', 'Configure produced no change.');
  return indexSuccess(address);
}

export function indexRebuildWrapper(
  editor: Editor,
  input: IndexRebuildInput,
  options?: MutationOptions,
): IndexMutationResult {
  rejectTrackedMode('index.rebuild', options);

  const resolved = resolveIndexTarget(editor.state.doc, input.target);
  const address: IndexAddress = { kind: 'block', nodeType: 'index', nodeId: resolved.nodeId };

  if (options?.dryRun) return indexSuccess(address);

  // Rebuild is a no-op at the adapter level — the layout engine handles content generation
  return indexSuccess(address);
}

export function indexRemoveWrapper(
  editor: Editor,
  input: IndexRemoveInput,
  options?: MutationOptions,
): IndexMutationResult {
  rejectTrackedMode('index.remove', options);

  const resolved = resolveIndexTarget(editor.state.doc, input.target);
  const address: IndexAddress = { kind: 'block', nodeType: 'index', nodeId: resolved.nodeId };

  if (options?.dryRun) return indexSuccess(address);

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

  if (!receiptApplied(receipt)) return indexFailure('NO_OP', 'Remove produced no change.');
  return indexSuccess(address);
}

// ---------------------------------------------------------------------------
// Index entry reads
// ---------------------------------------------------------------------------

export function indexEntriesListWrapper(editor: Editor, query?: IndexEntryListInput) {
  const doc = editor.state.doc;
  const revision = getRevision(editor);
  const entries = findAllIndexEntries(doc);

  const allItems = entries.map((e) => buildIndexEntryDiscoveryItem(doc, e, revision));
  const { total, items: paged } = paginate(allItems, query?.offset, query?.limit);
  const effectiveLimit = query?.limit ?? total;

  return buildDiscoveryResult({
    evaluatedRevision: revision,
    total,
    items: paged,
    page: { limit: effectiveLimit, offset: query?.offset ?? 0, returned: paged.length },
  });
}

export function indexEntriesGetWrapper(editor: Editor, input: IndexEntryGetInput): IndexEntryInfo {
  const resolved = resolveIndexEntryTarget(editor.state.doc, input.target);
  return extractIndexEntryInfo(editor.state.doc, resolved);
}

// ---------------------------------------------------------------------------
// Index entry mutations
// ---------------------------------------------------------------------------

export function indexEntriesInsertWrapper(
  editor: Editor,
  input: IndexEntryInsertInput,
  options?: MutationOptions,
): IndexEntryMutationResult {
  rejectTrackedMode('index.entries.insert', options);

  const dummyAddress: IndexEntryAddress = {
    kind: 'inline',
    nodeType: 'indexEntry',
    anchor: { start: { blockId: '', offset: 0 }, end: { blockId: '', offset: 0 } },
  };

  if (options?.dryRun) return entrySuccess(dummyAddress);

  const entryType = editor.schema.nodes.indexEntry;
  if (!entryType) {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      'index.entries.insert: indexEntry node type not in schema.',
    );
  }

  const resolved = resolveInlineInsertPosition(editor, input.at, 'index.entries.insert');
  const instruction = buildXeInstruction(input.entry);

  const receipt = executeDomainCommand(
    editor,
    (): boolean => {
      const node = entryType.create({
        instruction,
        instructionTokens: null,
        bold: input.entry.bold ?? false,
        italic: input.entry.italic ?? false,
        subEntry: input.entry.subEntry ?? '',
        crossReference: input.entry.crossReference ?? '',
        pageRangeBookmark: input.entry.pageRangeBookmark ?? '',
        entryType: input.entry.entryType ?? '',
        yomi: input.entry.yomi ?? '',
      });
      const { tr } = editor.state;
      tr.insert(resolved.from, node);
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return entryFailure('NO_OP', 'Insert produced no change.');

  const insertedAddress = resolveInsertedIndexEntryAddress(editor.state.doc, resolved.from, instruction);
  return entrySuccess(insertedAddress);
}

export function indexEntriesUpdateWrapper(
  editor: Editor,
  input: IndexEntryUpdateInput,
  options?: MutationOptions,
): IndexEntryMutationResult {
  rejectTrackedMode('index.entries.update', options);

  const resolved = resolveIndexEntryTarget(editor.state.doc, input.target);
  const address = extractIndexEntryInfo(editor.state.doc, resolved).address;

  if (options?.dryRun) return entrySuccess(address);

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      const newAttrs = { ...resolved.node.attrs };
      if (input.patch?.text !== undefined) newAttrs.instructionTokens = null;
      if (input.patch?.subEntry !== undefined) newAttrs.subEntry = input.patch.subEntry;
      if (input.patch?.bold !== undefined) newAttrs.bold = input.patch.bold;
      if (input.patch?.italic !== undefined) newAttrs.italic = input.patch.italic;
      if (input.patch?.crossReference !== undefined) newAttrs.crossReference = input.patch.crossReference;
      if (input.patch?.pageRangeBookmark !== undefined) newAttrs.pageRangeBookmark = input.patch.pageRangeBookmark;
      if (input.patch?.entryType !== undefined) newAttrs.entryType = input.patch.entryType;
      if (input.patch?.yomi !== undefined) newAttrs.yomi = input.patch.yomi;
      newAttrs.instruction = buildXeInstructionFromAttrs(newAttrs);
      newAttrs.instructionTokens = null;
      tr.setNodeMarkup(resolved.pos, undefined, newAttrs);
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return entryFailure('NO_OP', 'Update produced no change.');
  return entrySuccess(address);
}

export function indexEntriesRemoveWrapper(
  editor: Editor,
  input: IndexEntryRemoveInput,
  options?: MutationOptions,
): IndexEntryMutationResult {
  rejectTrackedMode('index.entries.remove', options);

  const resolved = resolveIndexEntryTarget(editor.state.doc, input.target);
  const address = extractIndexEntryInfo(editor.state.doc, resolved).address;

  if (options?.dryRun) return entrySuccess(address);

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

  if (!receiptApplied(receipt)) return entryFailure('NO_OP', 'Remove produced no change.');
  return entrySuccess(address);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeInlineEntryAddress(doc: import('prosemirror-model').Node, pos: number): IndexEntryAddress {
  const node = doc.nodeAt?.(pos);
  if (!node || typeof doc.resolve !== 'function') {
    return {
      kind: 'inline',
      nodeType: 'indexEntry',
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
    nodeType: 'indexEntry',
    anchor: {
      start: { blockId, offset },
      end: { blockId, offset: offset + node.nodeSize },
    },
  };
}

function resolveInsertedIndexEntryAddress(
  doc: import('prosemirror-model').Node,
  preferredPos: number,
  instruction: string,
): IndexEntryAddress {
  const directNode = doc.nodeAt?.(preferredPos);
  if (directNode?.type?.name === 'indexEntry') {
    return computeInlineEntryAddress(doc, preferredPos);
  }

  const instructionMatchedPositions: number[] = [];
  const allEntryPositions: number[] = [];

  doc.descendants?.((node, pos) => {
    if (node.type?.name !== 'indexEntry') return true;
    allEntryPositions.push(pos);
    const nodeInstruction = (node.attrs?.instruction as string) ?? '';
    if (nodeInstruction === instruction) {
      instructionMatchedPositions.push(pos);
    }
    return true;
  });

  const candidates = instructionMatchedPositions.length > 0 ? instructionMatchedPositions : allEntryPositions;
  if (candidates.length === 0) {
    return computeInlineEntryAddress(doc, preferredPos);
  }

  const nearestPos = candidates.reduce((bestPos, candidatePos) => {
    const bestDistance = Math.abs(bestPos - preferredPos);
    const candidateDistance = Math.abs(candidatePos - preferredPos);
    return candidateDistance < bestDistance ? candidatePos : bestPos;
  });

  return computeInlineEntryAddress(doc, nearestPos);
}

function buildXeInstruction(entry: import('@superdoc/document-api').IndexEntryData): string {
  let text = entry.text ?? '';
  if (entry.subEntry) text += `:${entry.subEntry}`;
  const parts = [`XE "${text}"`];
  if (entry.bold) parts.push('\\b');
  if (entry.italic) parts.push('\\i');
  if (entry.crossReference) parts.push(`\\t "${entry.crossReference}"`);
  if (entry.pageRangeBookmark) parts.push(`\\r "${entry.pageRangeBookmark}"`);
  if (entry.entryType) parts.push(`\\f "${entry.entryType}"`);
  if (entry.yomi) parts.push(`\\y "${entry.yomi}"`);
  return parts.join(' ');
}

function buildXeInstructionFromAttrs(attrs: Record<string, unknown>): string {
  let text = extractPrimaryEntryText(attrs);
  const subEntry = (attrs.subEntry as string) ?? '';
  if (subEntry && text.endsWith(`:${subEntry}`)) {
    text = text.slice(0, -(subEntry.length + 1));
  }
  if (subEntry) text += `:${subEntry}`;
  const parts = [`XE "${text}"`];
  if (attrs.bold) parts.push('\\b');
  if (attrs.italic) parts.push('\\i');
  const crossRef = (attrs.crossReference as string) ?? '';
  if (crossRef) parts.push(`\\t "${crossRef}"`);
  const prb = (attrs.pageRangeBookmark as string) ?? '';
  if (prb) parts.push(`\\r "${prb}"`);
  const et = (attrs.entryType as string) ?? '';
  if (et) parts.push(`\\f "${et}"`);
  const yomi = (attrs.yomi as string) ?? '';
  if (yomi) parts.push(`\\y "${yomi}"`);
  return parts.join(' ');
}

function extractPrimaryEntryText(attrs: Record<string, unknown>): string {
  const instructionTokens = attrs.instructionTokens;
  if (Array.isArray(instructionTokens) && instructionTokens.length > 0) {
    const rawTokenText = instructionTokens
      .map((token) => readInstructionTokenText(token))
      .filter((text): text is string => text.length > 0)
      .join('');
    if (rawTokenText) {
      const parsedFromTokens = parseXeInstructionEntryText(rawTokenText);
      if (parsedFromTokens) return parsedFromTokens;
      return rawTokenText;
    }
  }

  return parseXeInstructionEntryText((attrs.instruction as string) ?? '');
}

function readInstructionTokenText(token: unknown): string {
  if (typeof token === 'string') return token;
  if (!token || typeof token !== 'object') return '';
  const tokenObject = token as { type?: unknown; text?: unknown };
  if (tokenObject.type === 'tab') return '\t';
  return typeof tokenObject.text === 'string' ? tokenObject.text : '';
}

function parseXeInstructionEntryText(instruction: string): string {
  const xeMatch = instruction.match(/^\s*XE\s+"([^"]*)"/);
  if (!xeMatch) return '';
  return xeMatch[1] ?? '';
}

function buildIndexInstruction(config?: import('@superdoc/document-api').IndexConfig): string {
  const parts = ['INDEX'];
  if (!config) return parts[0] + ' \\h "A"';
  if (config.headingSeparator !== undefined) parts.push(`\\h "${config.headingSeparator}"`);
  if (config.entryPageSeparator !== undefined) parts.push(`\\e "${config.entryPageSeparator}"`);
  if (config.pageRangeSeparator !== undefined) parts.push(`\\g "${config.pageRangeSeparator}"`);
  if (config.sequenceId !== undefined) parts.push(`\\s ${config.sequenceId}`);
  if (config.columns !== undefined) parts.push(`\\c ${config.columns}`);
  if (config.entryTypeFilter !== undefined) parts.push(`\\f "${config.entryTypeFilter}"`);
  if (config.pageRangeBookmark !== undefined) parts.push(`\\b "${config.pageRangeBookmark}"`);
  if (config.letterRange) parts.push(`\\p "${config.letterRange.from}-${config.letterRange.to}"`);
  if (config.runIn) parts.push('\\r');
  if (config.accentedSorting) parts.push('\\a');
  return parts.length > 1 ? parts.join(' ') : 'INDEX \\h "A"';
}
