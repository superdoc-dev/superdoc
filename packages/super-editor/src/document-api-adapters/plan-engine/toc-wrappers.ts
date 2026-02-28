/**
 * TOC plan-engine wrappers — bridge TOC operations to the plan engine's execution path.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import type {
  TocAddress,
  TocGetInput,
  TocInfo,
  TocConfigureInput,
  TocUpdateInput,
  TocRemoveInput,
  TocMutationResult,
  TocListQuery,
  TocListResult,
  CreateTableOfContentsInput,
  CreateTableOfContentsResult,
  MutationOptions,
  ReceiptFailureCode,
  TocSwitchConfig,
} from '@superdoc/document-api';
import { buildDiscoveryResult } from '@superdoc/document-api';
import {
  parseTocInstruction,
  serializeTocInstruction,
  applyTocPatch,
  areTocConfigsEqual,
  DEFAULT_TOC_CONFIG,
} from '../../core/super-converter/field-references/shared/toc-switches.js';
import {
  findAllTocNodes,
  resolveTocTarget,
  resolvePostMutationTocId,
  extractTocInfo,
  buildTocDiscoveryItem,
} from '../helpers/toc-resolver.js';
import {
  collectHeadingSources,
  buildTocEntryParagraphs,
  type EntryParagraphJson,
} from '../helpers/toc-entry-builder.js';
import { paginate } from '../helpers/adapter-utils.js';
import { getRevision } from './revision-tracker.js';
import { executeDomainCommand } from './plan-wrappers.js';
import { requireEditorCommand, rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { clearIndexCache } from '../helpers/index-cache.js';
import { resolveBlockInsertionPos } from './create-insertion.js';

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function tocListWrapper(editor: Editor, query?: TocListQuery): TocListResult {
  const doc = editor.state.doc;
  const revision = getRevision(editor);
  const tocNodes = findAllTocNodes(doc);

  const allItems = tocNodes.map((resolved) => buildTocDiscoveryItem(resolved, revision));

  const { total, items: paged } = paginate(allItems, query?.offset, query?.limit);
  const effectiveLimit = query?.limit ?? total;

  return buildDiscoveryResult({
    evaluatedRevision: revision,
    total,
    items: paged,
    page: { limit: effectiveLimit, offset: query?.offset ?? 0, returned: paged.length },
  });
}

export function tocGetWrapper(editor: Editor, input: TocGetInput): TocInfo {
  const resolved = resolveTocTarget(editor.state.doc, input.target);
  return extractTocInfo(resolved.node);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Placeholder content when no headings match the TOC configuration. */
const NO_ENTRIES_PLACEHOLDER: EntryParagraphJson[] = [
  {
    type: 'paragraph',
    attrs: { paragraphProperties: {} },
    content: [{ type: 'text', text: 'No table of contents entries found.' }],
  },
];

function buildTocAddress(nodeId: string): TocAddress {
  return { kind: 'block', nodeType: 'tableOfContents', nodeId };
}

function tocSuccess(nodeId: string): TocMutationResult {
  return { success: true, toc: buildTocAddress(nodeId) };
}

function tocFailure(code: ReceiptFailureCode, message: string): TocMutationResult {
  return { success: false, failure: { code, message } };
}

type TocCommandArgs = Record<string, unknown>;
type TocEditorCommand = (options: TocCommandArgs) => boolean;

function toTocEditorCommand(command: unknown): TocEditorCommand {
  return command as TocEditorCommand;
}

/**
 * Executes a TOC editor command through the plan engine, clearing the index
 * cache on success. Centralizes the command cast + cache-clear + receipt
 * pattern shared by all TOC mutation wrappers.
 */
function runTocAction(editor: Editor, action: () => boolean, expectedRevision?: string) {
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

function runTocCommand(editor: Editor, command: unknown, args: TocCommandArgs, expectedRevision?: string) {
  const executeCommand = toTocEditorCommand(command);
  return runTocAction(editor, () => executeCommand(args), expectedRevision);
}

/** Returns true if the receipt indicates the command had an effect. */
function receiptApplied(receipt: ReturnType<typeof executeDomainCommand>): boolean {
  return receipt.steps[0]?.effect === 'changed';
}

/**
 * Compares new entry content against the existing TOC node's children to
 * detect NO_OP before executing a command. Returns false (assume changed)
 * if the node's children can't be serialized (e.g. test mocks).
 */
function isTocContentUnchanged(existingNode: ProseMirrorNode, newContent: unknown[]): boolean {
  if (existingNode.childCount !== newContent.length) return false;

  const existingEntries: unknown[] = [];
  let canSerialize = true;

  existingNode.forEach((child) => {
    if (!canSerialize) return;
    if (typeof child.toJSON !== 'function') {
      canSerialize = false;
      return;
    }
    const json = child.toJSON();
    if (json.attrs) delete json.attrs.sdBlockId;
    existingEntries.push(json);
  });

  if (!canSerialize) return false;

  const normalized = newContent.map((entry) => {
    const clone = JSON.parse(JSON.stringify(entry));
    if (clone.attrs) delete clone.attrs.sdBlockId;
    return clone;
  });

  return JSON.stringify(existingEntries) === JSON.stringify(normalized);
}

function materializeTocContent(doc: ProseMirrorNode, config: TocSwitchConfig): EntryParagraphJson[] {
  const headingSources = collectHeadingSources(doc, config);
  const entryParagraphs = buildTocEntryParagraphs(headingSources, config);
  return entryParagraphs.length > 0 ? entryParagraphs : NO_ENTRIES_PLACEHOLDER;
}

// ---------------------------------------------------------------------------
// toc.configure
// ---------------------------------------------------------------------------

export function tocConfigureWrapper(
  editor: Editor,
  input: TocConfigureInput,
  options?: MutationOptions,
): TocMutationResult {
  rejectTrackedMode('toc.configure', options);
  const command = requireEditorCommand(editor.commands?.setTableOfContentsInstructionById, 'toc.configure');

  const resolved = resolveTocTarget(editor.state.doc, input.target);
  const currentConfig = parseTocInstruction(resolved.node.attrs?.instruction ?? '');
  const patched = applyTocPatch(currentConfig, input.patch);
  const nextContent = materializeTocContent(editor.state.doc, patched);

  if (areTocConfigsEqual(currentConfig, patched)) {
    return tocFailure('NO_OP', 'Configuration patch produced no change.');
  }

  if (options?.dryRun) {
    return tocSuccess(resolved.nodeId);
  }

  const shouldRefreshContent = !isTocContentUnchanged(resolved.node, nextContent);
  const commandNodeId = resolved.commandNodeId ?? resolved.nodeId;
  const receipt = runTocCommand(
    editor,
    command,
    {
      sdBlockId: commandNodeId,
      instruction: serializeTocInstruction(patched),
      ...(shouldRefreshContent ? { content: nextContent } : {}),
    },
    options?.expectedRevision,
  );

  if (!receiptApplied(receipt)) {
    return tocFailure('NO_OP', 'Configuration change could not be applied.');
  }

  // Re-resolve after mutation to return the current public TOC id.
  // We look up by sdBlockId because instruction updates may change fallback IDs.
  const postMutationId = resolvePostMutationTocId(editor.state.doc, commandNodeId);
  return tocSuccess(postMutationId);
}

// ---------------------------------------------------------------------------
// toc.update
// ---------------------------------------------------------------------------

export function tocUpdateWrapper(editor: Editor, input: TocUpdateInput, options?: MutationOptions): TocMutationResult {
  rejectTrackedMode('toc.update', options);
  const command = requireEditorCommand(editor.commands?.replaceTableOfContentsContentById, 'toc.update');

  const resolved = resolveTocTarget(editor.state.doc, input.target);
  const config = parseTocInstruction(resolved.node.attrs?.instruction ?? '');
  const content = materializeTocContent(editor.state.doc, config);

  // NO_OP detection: compare new content against existing before executing.
  // The PM command returns "found" (not "content changed"), so receipt-based
  // detection would always report 'changed' when the node exists.
  if (isTocContentUnchanged(resolved.node, content)) {
    return tocFailure('NO_OP', 'TOC update produced no change.');
  }

  if (options?.dryRun) {
    return tocSuccess(resolved.nodeId);
  }

  const receipt = runTocCommand(
    editor,
    command,
    {
      sdBlockId: resolved.commandNodeId ?? resolved.nodeId,
      content,
    },
    options?.expectedRevision,
  );

  return receiptApplied(receipt) ? tocSuccess(resolved.nodeId) : tocFailure('NO_OP', 'TOC update produced no change.');
}

// ---------------------------------------------------------------------------
// toc.remove
// ---------------------------------------------------------------------------

export function tocRemoveWrapper(editor: Editor, input: TocRemoveInput, options?: MutationOptions): TocMutationResult {
  rejectTrackedMode('toc.remove', options);
  const command = requireEditorCommand(editor.commands?.deleteTableOfContentsById, 'toc.remove');

  const resolved = resolveTocTarget(editor.state.doc, input.target);

  if (options?.dryRun) {
    return tocSuccess(resolved.nodeId);
  }

  const receipt = runTocCommand(
    editor,
    command,
    {
      sdBlockId: resolved.commandNodeId ?? resolved.nodeId,
    },
    options?.expectedRevision,
  );

  return receiptApplied(receipt) ? tocSuccess(resolved.nodeId) : tocFailure('NO_OP', 'TOC removal produced no change.');
}

// ---------------------------------------------------------------------------
// create.tableOfContents
// ---------------------------------------------------------------------------

export function createTableOfContentsWrapper(
  editor: Editor,
  input: CreateTableOfContentsInput,
  options?: MutationOptions,
): CreateTableOfContentsResult {
  rejectTrackedMode('create.tableOfContents', options);
  const command = requireEditorCommand(editor.commands?.insertTableOfContentsAt, 'create.tableOfContents');

  // Resolve insertion position
  const at = input.at ?? { kind: 'documentEnd' as const };
  let pos: number;
  if (at.kind === 'documentStart') {
    pos = 0;
  } else if (at.kind === 'documentEnd') {
    pos = editor.state.doc.content.size;
  } else {
    pos = resolveBlockInsertionPos(editor, at.target.nodeId, at.kind);
  }

  // Build instruction from config patch or use defaults
  const config = input.config ? applyTocPatch(DEFAULT_TOC_CONFIG, input.config) : DEFAULT_TOC_CONFIG;
  const instruction = serializeTocInstruction(config);
  const content = materializeTocContent(editor.state.doc, config);

  const sdBlockId = uuidv4();

  if (options?.dryRun) {
    return { success: true, toc: buildTocAddress('(dry-run)') };
  }

  const receipt = runTocCommand(
    editor,
    command,
    {
      pos,
      instruction,
      sdBlockId,
      content,
    },
    options?.expectedRevision,
  );

  if (!receiptApplied(receipt)) {
    return {
      success: false,
      failure: {
        code: 'INVALID_INSERTION_CONTEXT',
        message: 'Table of contents could not be inserted at the requested location.',
      },
    };
  }

  // Re-resolve and return the public TOC id exposed by toc.list/toc.get.
  const postMutationId = resolvePostMutationTocId(editor.state.doc, sdBlockId);
  return { success: true, toc: buildTocAddress(postMutationId) };
}
