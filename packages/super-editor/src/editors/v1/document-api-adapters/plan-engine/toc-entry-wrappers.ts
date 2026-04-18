/**
 * TC entry plan-engine wrappers — bridge TC entry operations to the plan engine.
 *
 * Handles: toc.markEntry, toc.unmarkEntry, toc.listEntries, toc.getEntry, toc.editEntry.
 *
 * All five operations target inline tableOfContentsEntry nodes (TC fields) in the
 * document body. Mutations dispatch through the tableOfContentsEntry extension commands.
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import type {
  TocEntryAddress,
  TocMarkEntryInput,
  TocUnmarkEntryInput,
  TocListEntriesQuery,
  TocListEntriesResult,
  TocGetEntryInput,
  TocEntryInfo,
  TocEditEntryInput,
  TocEntryMutationResult,
  MutationOptions,
  ReceiptFailureCode,
} from '@superdoc/document-api';
import { buildDiscoveryResult, DocumentApiValidationError } from '@superdoc/document-api';
import {
  serializeTcInstruction,
  applyTcPatch,
  areTcConfigsEqual,
  parseTcInstruction,
} from '../../core/super-converter/field-references/shared/tc-switches.js';
import {
  findAllTcEntryNodes,
  resolveTcEntryTarget,
  findParagraphBySdBlockId,
  extractTcEntryInfo,
  buildTcEntryDiscoveryItem,
} from '../helpers/toc-entry-resolver.js';
import { paginate } from '../helpers/adapter-utils.js';
import { getRevision } from './revision-tracker.js';
import { executeDomainCommand } from './plan-wrappers.js';
import { requireEditorCommand, rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { clearIndexCache } from '../helpers/index-cache.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** TC level bounds per OOXML spec. */
const TC_LEVEL_MIN = 1;
const TC_LEVEL_MAX = 9;

function validateTcLevel(level: number | undefined): void {
  if (level === undefined) return;
  if (!Number.isInteger(level) || level < TC_LEVEL_MIN || level > TC_LEVEL_MAX) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `TC entry level must be an integer between ${TC_LEVEL_MIN} and ${TC_LEVEL_MAX}, got ${level}`,
      { level },
    );
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function buildEntryAddress(nodeId: string): TocEntryAddress {
  return { kind: 'inline', nodeType: 'tableOfContentsEntry', nodeId };
}

function entrySuccess(nodeId: string): TocEntryMutationResult {
  return { success: true, entry: buildEntryAddress(nodeId) };
}

function entryFailure(code: ReceiptFailureCode, message: string): TocEntryMutationResult {
  return { success: false, failure: { code, message } };
}

type EntryEditorCommand = (options: Record<string, unknown>) => boolean;

function toEntryEditorCommand(command: unknown): EntryEditorCommand {
  return command as EntryEditorCommand;
}

/**
 * Executes a TC entry editor command through the plan engine, clearing the
 * index cache on success. Mirrors runTocAction in toc-wrappers.ts.
 */
function runEntryAction(editor: Editor, action: () => boolean, expectedRevision?: string) {
  return executeDomainCommand(
    editor,
    () => {
      const result = action();
      if (result) clearIndexCache(editor);
      return result;
    },
    { expectedRevision },
  );
}

function runEntryCommand(editor: Editor, command: unknown, args: Record<string, unknown>, expectedRevision?: string) {
  const executeCommand = toEntryEditorCommand(command);
  return runEntryAction(editor, () => executeCommand(args), expectedRevision);
}

function receiptApplied(receipt: ReturnType<typeof executeDomainCommand>): boolean {
  return receipt.steps[0]?.effect === 'changed';
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Lists all TC entry nodes in the document body with optional filtering.
 */
export function tocListEntriesWrapper(editor: Editor, query?: TocListEntriesQuery): TocListEntriesResult {
  const doc = editor.state.doc;
  const revision = getRevision(editor);
  const allEntries = findAllTcEntryNodes(doc);

  // Apply filters
  let filtered = allEntries;

  if (query?.tableIdentifier !== undefined) {
    filtered = filtered.filter((entry) => {
      const config = parseTcInstruction(entry.node.attrs?.instruction ?? '');
      return config.tableIdentifier === query.tableIdentifier;
    });
  }

  if (query?.levelRange) {
    const { from, to } = query.levelRange;
    filtered = filtered.filter((entry) => {
      const config = parseTcInstruction(entry.node.attrs?.instruction ?? '');
      return config.level >= from && config.level <= to;
    });
  }

  const allItems = filtered.map((entry) => buildTcEntryDiscoveryItem(entry, revision));
  const { total, items: paged } = paginate(allItems, query?.offset, query?.limit);
  const effectiveLimit = query?.limit ?? total;

  return buildDiscoveryResult({
    evaluatedRevision: revision,
    total,
    items: paged,
    page: { limit: effectiveLimit, offset: query?.offset ?? 0, returned: paged.length },
  });
}

/**
 * Gets detailed info for a single TC entry node.
 */
export function tocGetEntryWrapper(editor: Editor, input: TocGetEntryInput): TocEntryInfo {
  const resolved = resolveTcEntryTarget(editor.state.doc, input.target);
  return extractTcEntryInfo(resolved);
}

// ---------------------------------------------------------------------------
// toc.markEntry
// ---------------------------------------------------------------------------

/**
 * Inserts a new TC field at the target paragraph.
 */
export function tocMarkEntryWrapper(
  editor: Editor,
  input: TocMarkEntryInput,
  options?: MutationOptions,
): TocEntryMutationResult {
  rejectTrackedMode('toc.markEntry', options);
  validateTcLevel(input.level);
  const command = requireEditorCommand(editor.commands?.insertTableOfContentsEntryAt, 'toc.markEntry');

  // Resolve insertion paragraph
  const paragraph = findParagraphBySdBlockId(editor.state.doc, input.target.anchor.nodeId, editor);

  // Build TC instruction from input
  const instruction = serializeTcInstruction({
    text: input.text,
    level: input.level ?? 1,
    omitPageNumber: input.omitPageNumber ?? false,
    tableIdentifier: input.tableIdentifier,
  });

  // Compute insertion position within the paragraph
  const insertionPosition = input.target.position ?? 'end';
  const pos =
    insertionPosition === 'start'
      ? paragraph.pos + 1 // Inside the paragraph, at the start
      : paragraph.pos + paragraph.node.nodeSize - 1; // Inside the paragraph, at the end

  if (options?.dryRun) {
    return entrySuccess('(dry-run)');
  }

  const receipt = runEntryCommand(editor, command, { pos, instruction }, options?.expectedRevision);

  if (!receiptApplied(receipt)) {
    return entryFailure('INVALID_INSERTION_CONTEXT', 'TC entry could not be inserted at the requested location.');
  }

  // Re-resolve the inserted node to get its public ID
  const postInsertionId = resolveInsertedEntryId(editor.state.doc, pos, instruction);
  return entrySuccess(postInsertionId);
}

/**
 * After insertion, find the TC entry node near the insertion position and return its public ID.
 */
function resolveInsertedEntryId(doc: ProseMirrorNode, insertPos: number, instruction: string): string {
  // The node was inserted at or near insertPos. Search nearby for it.
  const allEntries = findAllTcEntryNodes(doc);
  // Prefer the entry closest to the insertion position with matching instruction
  const matching = allEntries.filter((e) => e.node.attrs?.instruction === instruction);

  if (matching.length > 0) {
    // Pick the one closest to the insertion position
    matching.sort((a, b) => Math.abs(a.pos - insertPos) - Math.abs(b.pos - insertPos));
    return matching[0].nodeId;
  }

  // Fallback: just use the hash at the insertion position
  const closest = allEntries.reduce(
    (best, entry) => (Math.abs(entry.pos - insertPos) < Math.abs(best.pos - insertPos) ? entry : best),
    allEntries[0],
  );
  return closest?.nodeId ?? `tc-entry-unknown`;
}

// ---------------------------------------------------------------------------
// toc.unmarkEntry
// ---------------------------------------------------------------------------

/**
 * Removes a single TC field node.
 */
export function tocUnmarkEntryWrapper(
  editor: Editor,
  input: TocUnmarkEntryInput,
  options?: MutationOptions,
): TocEntryMutationResult {
  rejectTrackedMode('toc.unmarkEntry', options);
  const command = requireEditorCommand(editor.commands?.deleteTableOfContentsEntryAt, 'toc.unmarkEntry');

  const resolved = resolveTcEntryTarget(editor.state.doc, input.target);

  if (options?.dryRun) {
    return entrySuccess(resolved.nodeId);
  }

  const receipt = runEntryCommand(editor, command, { pos: resolved.pos }, options?.expectedRevision);

  return receiptApplied(receipt)
    ? entrySuccess(resolved.nodeId)
    : entryFailure('NO_OP', 'TC entry removal produced no change.');
}

// ---------------------------------------------------------------------------
// toc.editEntry
// ---------------------------------------------------------------------------

/**
 * Applies a patch to an existing TC entry's instruction.
 */
export function tocEditEntryWrapper(
  editor: Editor,
  input: TocEditEntryInput,
  options?: MutationOptions,
): TocEntryMutationResult {
  rejectTrackedMode('toc.editEntry', options);
  validateTcLevel(input.patch.level);
  const command = requireEditorCommand(editor.commands?.updateTableOfContentsEntryAt, 'toc.editEntry');

  const resolved = resolveTcEntryTarget(editor.state.doc, input.target);
  const currentConfig = parseTcInstruction(resolved.node.attrs?.instruction ?? '');
  const patched = applyTcPatch(currentConfig, input.patch);

  if (areTcConfigsEqual(currentConfig, patched)) {
    return entryFailure('NO_OP', 'Edit patch produced no change.');
  }

  if (options?.dryRun) {
    return entrySuccess(resolved.nodeId);
  }

  const receipt = runEntryCommand(
    editor,
    command,
    { pos: resolved.pos, instruction: serializeTcInstruction(patched) },
    options?.expectedRevision,
  );

  if (!receiptApplied(receipt)) {
    return entryFailure('NO_OP', 'TC entry edit could not be applied.');
  }

  // Re-resolve after edit — instruction change produces a new public ID
  const postEditId = resolvePostEditEntryId(editor.state.doc, resolved.pos);
  return entrySuccess(postEditId);
}

/**
 * After editing, re-resolve the TC entry near the original position to get its new public ID.
 */
function resolvePostEditEntryId(doc: ProseMirrorNode, originalPos: number): string {
  const allEntries = findAllTcEntryNodes(doc);
  if (allEntries.length === 0) return `tc-entry-unknown`;

  // Find the entry closest to the original position
  const closest = allEntries.reduce(
    (best, entry) => (Math.abs(entry.pos - originalPos) < Math.abs(best.pos - originalPos) ? entry : best),
    allEntries[0],
  );
  return closest.nodeId;
}
