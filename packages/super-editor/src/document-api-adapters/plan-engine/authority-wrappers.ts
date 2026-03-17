/**
 * Authority plan-engine wrappers — bridge authorities.* and authorities.entries.*
 * operations.
 */

import type { Editor } from '../../core/Editor.js';
import type {
  AuthoritiesListInput,
  AuthoritiesGetInput,
  AuthoritiesInsertInput,
  AuthoritiesConfigureInput,
  AuthoritiesRebuildInput,
  AuthoritiesRemoveInput,
  AuthoritiesInfo,
  AuthoritiesMutationResult,
  AuthoritiesAddress,
  AuthorityEntryListInput,
  AuthorityEntryGetInput,
  AuthorityEntryInsertInput,
  AuthorityEntryUpdateInput,
  AuthorityEntryRemoveInput,
  AuthorityEntryInfo,
  AuthorityEntryMutationResult,
  AuthorityEntryAddress,
  MutationOptions,
  ReceiptFailureCode,
} from '@superdoc/document-api';
import { buildDiscoveryResult } from '@superdoc/document-api';
import {
  findAllAuthorities,
  resolveAuthorityTarget,
  extractAuthorityInfo,
  buildAuthorityDiscoveryItem,
  findAllAuthorityEntries,
  resolveAuthorityEntryTarget,
  extractAuthorityEntryInfo,
  buildAuthorityEntryDiscoveryItem,
  parseToaInstruction,
} from '../helpers/authority-resolver.js';
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

function toaSuccess(address: AuthoritiesAddress): AuthoritiesMutationResult {
  return { success: true, authorities: address };
}

function toaFailure(code: ReceiptFailureCode, message: string): AuthoritiesMutationResult {
  return { success: false, failure: { code, message } };
}

function entrySuccess(address: AuthorityEntryAddress): AuthorityEntryMutationResult {
  return { success: true, entry: address };
}

function entryFailure(code: ReceiptFailureCode, message: string): AuthorityEntryMutationResult {
  return { success: false, failure: { code, message } };
}

function receiptApplied(receipt: ReturnType<typeof executeDomainCommand>): boolean {
  return receipt.steps[0]?.effect === 'changed';
}

// ---------------------------------------------------------------------------
// Table of Authorities (block) reads
// ---------------------------------------------------------------------------

export function authoritiesListWrapper(editor: Editor, query?: AuthoritiesListInput) {
  const doc = editor.state.doc;
  const revision = getRevision(editor);
  const nodes = findAllAuthorities(doc);

  const allItems = nodes.map((n) => buildAuthorityDiscoveryItem(n, revision));
  const { total, items: paged } = paginate(allItems, query?.offset, query?.limit);
  const effectiveLimit = query?.limit ?? total;

  return buildDiscoveryResult({
    evaluatedRevision: revision,
    total,
    items: paged,
    page: { limit: effectiveLimit, offset: query?.offset ?? 0, returned: paged.length },
  });
}

export function authoritiesGetWrapper(editor: Editor, input: AuthoritiesGetInput): AuthoritiesInfo {
  const resolved = resolveAuthorityTarget(editor.state.doc, input.target);
  return extractAuthorityInfo(resolved);
}

// ---------------------------------------------------------------------------
// Table of Authorities (block) mutations
// ---------------------------------------------------------------------------

export function authoritiesInsertWrapper(
  editor: Editor,
  input: AuthoritiesInsertInput,
  options?: MutationOptions,
): AuthoritiesMutationResult {
  rejectTrackedMode('authorities.insert', options);

  const requestedNodeId = `toa-${Date.now()}`;
  const dryRunAddress: AuthoritiesAddress = {
    kind: 'block',
    nodeType: 'tableOfAuthorities',
    nodeId: requestedNodeId,
  };

  if (options?.dryRun) return toaSuccess(dryRunAddress);

  const toaType = editor.schema.nodes.tableOfAuthorities;
  if (!toaType) {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      'authorities.insert: tableOfAuthorities node type not in schema.',
    );
  }

  const pos = resolveBlockCreatePosition(editor, input.at);

  const receipt = executeDomainCommand(
    editor,
    () => {
      const instruction = buildToaInstruction(input.config);
      const attrs: Record<string, unknown> = { instruction, sdBlockId: requestedNodeId };
      if (input.config?.category !== undefined) attrs.category = input.config.category;
      const node = toaType.create(attrs, editor.schema.nodes.paragraph.create());
      const { tr } = editor.state;
      tr.insert(pos, node);
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return toaFailure('NO_OP', 'Insert produced no change.');
  const insertedNode = editor.state.doc.nodeAt(pos);
  const resolvedNodeId = (insertedNode?.attrs?.sdBlockId as string) ?? `toa-${pos}`;
  return toaSuccess({ kind: 'block', nodeType: 'tableOfAuthorities', nodeId: resolvedNodeId });
}

export function authoritiesConfigureWrapper(
  editor: Editor,
  input: AuthoritiesConfigureInput,
  options?: MutationOptions,
): AuthoritiesMutationResult {
  rejectTrackedMode('authorities.configure', options);

  const resolved = resolveAuthorityTarget(editor.state.doc, input.target);
  const address: AuthoritiesAddress = { kind: 'block', nodeType: 'tableOfAuthorities', nodeId: resolved.nodeId };

  if (options?.dryRun) return toaSuccess(address);

  const currentInstruction = (resolved.node.attrs.instruction as string) ?? '';
  const currentConfig = parseToaInstruction(currentInstruction);
  const mergedConfig = { ...currentConfig };
  for (const [key, value] of Object.entries(input.patch)) {
    if (value !== undefined) {
      (mergedConfig as Record<string, unknown>)[key] = value;
    }
  }
  const newInstruction = buildToaInstruction(mergedConfig);
  const currentCategory = resolved.node.attrs.category as number | undefined;
  const categoryUnchanged = input.patch.category === undefined || input.patch.category === currentCategory;

  if (newInstruction === currentInstruction && categoryUnchanged) {
    return toaFailure('NO_OP', 'Configuration patch produced no change.');
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      const newAttrs: Record<string, unknown> = { ...resolved.node.attrs, instruction: newInstruction };
      if (input.patch.category !== undefined) newAttrs.category = input.patch.category;
      tr.setNodeMarkup(resolved.pos, undefined, newAttrs);
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return toaFailure('NO_OP', 'Configure produced no change.');
  return toaSuccess(address);
}

export function authoritiesRebuildWrapper(
  editor: Editor,
  input: AuthoritiesRebuildInput,
  options?: MutationOptions,
): AuthoritiesMutationResult {
  rejectTrackedMode('authorities.rebuild', options);

  const resolved = resolveAuthorityTarget(editor.state.doc, input.target);
  const address: AuthoritiesAddress = { kind: 'block', nodeType: 'tableOfAuthorities', nodeId: resolved.nodeId };

  if (options?.dryRun) return toaSuccess(address);
  return toaSuccess(address);
}

export function authoritiesRemoveWrapper(
  editor: Editor,
  input: AuthoritiesRemoveInput,
  options?: MutationOptions,
): AuthoritiesMutationResult {
  rejectTrackedMode('authorities.remove', options);

  const resolved = resolveAuthorityTarget(editor.state.doc, input.target);
  const address: AuthoritiesAddress = { kind: 'block', nodeType: 'tableOfAuthorities', nodeId: resolved.nodeId };

  if (options?.dryRun) return toaSuccess(address);

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

  if (!receiptApplied(receipt)) return toaFailure('NO_OP', 'Remove produced no change.');
  return toaSuccess(address);
}

// ---------------------------------------------------------------------------
// Authority entry reads
// ---------------------------------------------------------------------------

export function authorityEntriesListWrapper(editor: Editor, query?: AuthorityEntryListInput) {
  const doc = editor.state.doc;
  const revision = getRevision(editor);
  const entries = findAllAuthorityEntries(doc);

  const allItems = entries.map((e) => buildAuthorityEntryDiscoveryItem(doc, e, revision));
  const { total, items: paged } = paginate(allItems, query?.offset, query?.limit);
  const effectiveLimit = query?.limit ?? total;

  return buildDiscoveryResult({
    evaluatedRevision: revision,
    total,
    items: paged,
    page: { limit: effectiveLimit, offset: query?.offset ?? 0, returned: paged.length },
  });
}

export function authorityEntriesGetWrapper(editor: Editor, input: AuthorityEntryGetInput): AuthorityEntryInfo {
  const resolved = resolveAuthorityEntryTarget(editor.state.doc, input.target);
  return extractAuthorityEntryInfo(editor.state.doc, resolved);
}

// ---------------------------------------------------------------------------
// Authority entry mutations
// ---------------------------------------------------------------------------

export function authorityEntriesInsertWrapper(
  editor: Editor,
  input: AuthorityEntryInsertInput,
  options?: MutationOptions,
): AuthorityEntryMutationResult {
  rejectTrackedMode('authorities.entries.insert', options);

  const dummyAddress: AuthorityEntryAddress = {
    kind: 'inline',
    nodeType: 'authorityEntry',
    anchor: { start: { blockId: '', offset: 0 }, end: { blockId: '', offset: 0 } },
  };

  if (options?.dryRun) return entrySuccess(dummyAddress);

  const entryType = editor.schema.nodes.authorityEntry;
  if (!entryType) {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      'authorities.entries.insert: authorityEntry node type not in schema.',
    );
  }

  const resolved = resolveInlineInsertPosition(editor, input.at, 'authorities.entries.insert');

  const receipt = executeDomainCommand(
    editor,
    (): boolean => {
      const instruction = buildTaInstruction(input);
      const node = entryType.create({
        instruction,
        longCitation: input.entry.longCitation ?? '',
        shortCitation: input.entry.shortCitation ?? '',
        category: input.entry.category ?? 0,
        bold: input.entry.bold ?? false,
        italic: input.entry.italic ?? false,
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

  return entrySuccess(computeInlineEntryAddress(editor.state.doc, resolved.from));
}

export function authorityEntriesUpdateWrapper(
  editor: Editor,
  input: AuthorityEntryUpdateInput,
  options?: MutationOptions,
): AuthorityEntryMutationResult {
  rejectTrackedMode('authorities.entries.update', options);

  const resolved = resolveAuthorityEntryTarget(editor.state.doc, input.target);
  const address = extractAuthorityEntryInfo(editor.state.doc, resolved).address;

  if (options?.dryRun) return entrySuccess(address);

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      const newAttrs = { ...resolved.node.attrs };
      if (input.patch.longCitation !== undefined) newAttrs.longCitation = input.patch.longCitation;
      if (input.patch.shortCitation !== undefined) newAttrs.shortCitation = input.patch.shortCitation;
      if (input.patch.category !== undefined) newAttrs.category = input.patch.category;
      if (input.patch.bold !== undefined) newAttrs.bold = input.patch.bold;
      if (input.patch.italic !== undefined) newAttrs.italic = input.patch.italic;
      newAttrs.instruction = buildTaInstructionFromAttrs(newAttrs);
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

export function authorityEntriesRemoveWrapper(
  editor: Editor,
  input: AuthorityEntryRemoveInput,
  options?: MutationOptions,
): AuthorityEntryMutationResult {
  rejectTrackedMode('authorities.entries.remove', options);

  const resolved = resolveAuthorityEntryTarget(editor.state.doc, input.target);
  const address = extractAuthorityEntryInfo(editor.state.doc, resolved).address;

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

function computeInlineEntryAddress(doc: import('prosemirror-model').Node, pos: number): AuthorityEntryAddress {
  const node = doc.nodeAt?.(pos);
  if (!node || typeof doc.resolve !== 'function') {
    return {
      kind: 'inline',
      nodeType: 'authorityEntry',
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
    nodeType: 'authorityEntry',
    anchor: {
      start: { blockId, offset },
      end: { blockId, offset: offset + node.nodeSize },
    },
  };
}

function buildTaInstruction(input: AuthorityEntryInsertInput): string {
  const parts = ['TA'];
  if (input.entry.longCitation) parts.push(`\\l "${input.entry.longCitation}"`);
  if (input.entry.shortCitation) parts.push(`\\s "${input.entry.shortCitation}"`);
  if (input.entry.category !== undefined) parts.push(`\\c ${input.entry.category}`);
  if (input.entry.bold) parts.push('\\b');
  if (input.entry.italic) parts.push('\\i');
  return parts.join(' ');
}

function buildTaInstructionFromAttrs(attrs: Record<string, unknown>): string {
  const parts = ['TA'];
  const longCitation = attrs.longCitation as string | undefined;
  const shortCitation = attrs.shortCitation as string | undefined;
  const category = attrs.category as number | undefined;
  if (longCitation) parts.push(`\\l "${longCitation}"`);
  if (shortCitation) parts.push(`\\s "${shortCitation}"`);
  if (category !== undefined) parts.push(`\\c ${category}`);
  if (attrs.bold) parts.push('\\b');
  if (attrs.italic) parts.push('\\i');
  return parts.join(' ');
}

/**
 * Builds a TOA field instruction from an {@link AuthoritiesConfig}.
 *
 * TOA switch reference (OOXML field codes):
 *   \c <category>  — filter by category number
 *   \e "<sep>"     — separator between entry and page number
 *   \p             — use "passim" for 5+ page references
 *   \h             — include category headings
 *   \l "<sep>"     — tab leader between entry and page number
 *   \g "<sep>"     — page range separator
 */
function buildToaInstruction(config?: import('@superdoc/document-api').AuthoritiesConfig): string {
  const parts = ['TOA'];
  if (!config) return parts[0];
  if (config.category !== undefined) parts.push(`\\c ${config.category}`);
  if (config.entryPageSeparator !== undefined) parts.push(`\\e "${config.entryPageSeparator}"`);
  if (config.usePassim) parts.push('\\p');
  if (config.includeHeadings) parts.push('\\h');
  if (config.tabLeader !== undefined && config.tabLeader !== 'none') {
    const leaderMap: Record<string, string> = { dot: '.', hyphen: '-', underscore: '_' };
    parts.push(`\\l "${leaderMap[config.tabLeader] ?? config.tabLeader}"`);
  }
  if (config.pageRangeSeparator !== undefined) parts.push(`\\g "${config.pageRangeSeparator}"`);
  return parts.length > 1 ? parts.join(' ') : 'TOA';
}
