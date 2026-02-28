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
import { buildDiscoveryResult, DocumentApiValidationError } from '@superdoc/document-api';
import {
  parseTocInstruction,
  serializeTocInstruction,
  applyTocPatch,
  areTocConfigsEqual,
  deriveIncludePageNumbers,
  DEFAULT_TOC_CONFIG,
} from '../../core/super-converter/field-references/shared/toc-switches.js';
import {
  findAllTocNodes,
  resolveTocTarget,
  resolvePostMutationTocId,
  extractTocInfo,
  buildTocDiscoveryItem,
} from '../helpers/toc-resolver.js';
import { collectTocSources, buildTocEntryParagraphs, type EntryParagraphJson } from '../helpers/toc-entry-builder.js';
import { paginate } from '../helpers/adapter-utils.js';
import { getRevision } from './revision-tracker.js';
import { executeDomainCommand } from './plan-wrappers.js';
import { requireEditorCommand, rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { clearIndexCache } from '../helpers/index-cache.js';
import { resolveBlockInsertionPos } from './create-insertion.js';

// ---------------------------------------------------------------------------
// Typed patch helper
// ---------------------------------------------------------------------------

/**
 * Wraps `applyTocPatch` and re-throws raw `INVALID_INPUT:` errors as
 * `DocumentApiValidationError` so callers get structured error codes.
 */
function applyTocPatchTyped(...args: Parameters<typeof applyTocPatch>): ReturnType<typeof applyTocPatch> {
  try {
    return applyTocPatch(...args);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('INVALID_INPUT:')) {
      throw new DocumentApiValidationError('INVALID_INPUT', err.message.slice('INVALID_INPUT: '.length));
    }
    throw err;
  }
}

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

/**
 * Merges rightAlignPageNumbers (a PM node attr, not a field switch) into the
 * config's display so that entry materialization can branch on it.
 */
function withRightAlign(config: TocSwitchConfig, rightAlignPageNumbers: boolean | undefined): TocSwitchConfig {
  if (rightAlignPageNumbers === undefined) return config;
  return { ...config, display: { ...config.display, rightAlignPageNumbers } };
}

function materializeTocContent(doc: ProseMirrorNode, config: TocSwitchConfig): EntryParagraphJson[] {
  const sources = collectTocSources(doc, config);
  const entryParagraphs = buildTocEntryParagraphs(sources, config);
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
  const patched = applyTocPatchTyped(currentConfig, input.patch);

  // rightAlignPageNumbers is a PM node attr, not an instruction switch
  const rightAlignChanged =
    input.patch.rightAlignPageNumbers !== undefined &&
    input.patch.rightAlignPageNumbers !== resolved.node.attrs?.rightAlignPageNumbers;

  // Merge rightAlignPageNumbers into config for entry materialization.
  // Patch value takes priority; fall back to existing node attr.
  const effectiveRightAlign =
    input.patch.rightAlignPageNumbers ?? (resolved.node.attrs?.rightAlignPageNumbers as boolean | undefined);
  const nextContent = materializeTocContent(editor.state.doc, withRightAlign(patched, effectiveRightAlign));

  if (areTocConfigsEqual(currentConfig, patched) && !rightAlignChanged) {
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
      ...(rightAlignChanged ? { rightAlignPageNumbers: input.patch.rightAlignPageNumbers } : {}),
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
  const mode = input.mode ?? 'all';

  if (mode === 'pageNumbers') {
    return tocUpdatePageNumbers(editor, input, options);
  }

  return tocUpdateAll(editor, input, options);
}

/**
 * Mode 'all' — full rebuild from configured sources (headings + TC fields).
 * This is the original toc.update behavior.
 */
function tocUpdateAll(editor: Editor, input: TocUpdateInput, options?: MutationOptions): TocMutationResult {
  const command = requireEditorCommand(editor.commands?.replaceTableOfContentsContentById, 'toc.update');

  const resolved = resolveTocTarget(editor.state.doc, input.target);
  const config = parseTocInstruction(resolved.node.attrs?.instruction ?? '');
  const rightAlign = resolved.node.attrs?.rightAlignPageNumbers as boolean | undefined;
  const content = materializeTocContent(editor.state.doc, withRightAlign(config, rightAlign));

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
// toc.update mode: 'pageNumbers'
// ---------------------------------------------------------------------------

/**
 * Extracts the page map from the editor if it is fresh.
 *
 * The page map is set by PresentationEditor after each render cycle. It maps
 * sdBlockId → page number for every anchored block in the rendered layout.
 *
 * Returns null when:
 * - No layout has been computed (headless mode, or before first render).
 * - The stored map is stale (the document changed since the last layout cycle).
 *   Staleness is detected by comparing the doc snapshot stored alongside the map
 *   against the current editor.state.doc (ProseMirror creates a new doc object
 *   on every document-changing transaction).
 */
function getPageMap(editor: Editor): Map<string, number> | null {
  const storage = (editor as unknown as { storage?: Record<string, unknown> }).storage;
  if (!storage) return null;

  const tocStorage = storage.tableOfContents as { pageMap?: Map<string, number>; pageMapDoc?: unknown } | undefined;
  if (!tocStorage?.pageMap) return null;

  // Reject stale maps — the doc must match the snapshot from the last layout cycle
  if (tocStorage.pageMapDoc !== undefined && tocStorage.pageMapDoc !== editor.state.doc) {
    return null;
  }

  return tocStorage.pageMap;
}

/**
 * Mode 'pageNumbers' — surgical page number update without rebuilding entries.
 *
 * Decision tree:
 * 1. Config says no page numbers → NO_OP
 * 2. No page map available → CAPABILITY_UNAVAILABLE
 * 3. No tocPageNumber marks found → PAGE_NUMBERS_NOT_MATERIALIZED
 * 4. Marks found, page map available → update each marked run, success
 */
function tocUpdatePageNumbers(editor: Editor, input: TocUpdateInput, options?: MutationOptions): TocMutationResult {
  const command = requireEditorCommand(editor.commands?.replaceTableOfContentsContentById, 'toc.update');

  const resolved = resolveTocTarget(editor.state.doc, input.target);
  const config = parseTocInstruction(resolved.node.attrs?.instruction ?? '');

  // 1. Config says no page numbers → NO_OP
  if (deriveIncludePageNumbers(config.display.omitPageNumberLevels, config.source.outlineLevels) === false) {
    return tocFailure('NO_OP', 'TOC configuration excludes page numbers. Nothing to update.');
  }

  // 2. Get page map
  const pageMap = getPageMap(editor);
  if (!pageMap) {
    return tocFailure(
      'CAPABILITY_UNAVAILABLE',
      'Page number resolution requires a completed layout. Trigger a render cycle and retry, or use mode "all".',
    );
  }

  // 3. Walk TOC children and build updated content with resolved page numbers
  const { updatedContent, hasPageNumberMarks, anyChanged } = buildPageNumberUpdatedContent(resolved.node, pageMap);

  if (!hasPageNumberMarks) {
    return tocFailure(
      'PAGE_NUMBERS_NOT_MATERIALIZED',
      'TOC entries do not contain tagged page number runs. Run toc.update with mode "all" first.',
    );
  }

  if (!anyChanged) {
    return tocFailure('NO_OP', 'Page numbers are already up to date.');
  }

  if (options?.dryRun) {
    return tocSuccess(resolved.nodeId);
  }

  const receipt = runTocCommand(
    editor,
    command,
    {
      sdBlockId: resolved.commandNodeId ?? resolved.nodeId,
      content: updatedContent,
    },
    options?.expectedRevision,
  );

  return receiptApplied(receipt)
    ? tocSuccess(resolved.nodeId)
    : tocFailure('NO_OP', 'Page number update produced no change.');
}

/**
 * Walks the TOC node's children and produces updated paragraph JSON where
 * tocPageNumber-marked text runs are replaced with resolved page numbers.
 */
function buildPageNumberUpdatedContent(
  tocNode: ProseMirrorNode,
  pageMap: Map<string, number>,
): { updatedContent: EntryParagraphJson[]; hasPageNumberMarks: boolean; anyChanged: boolean } {
  const updatedContent: EntryParagraphJson[] = [];
  let hasPageNumberMarks = false;
  let anyChanged = false;

  tocNode.forEach((child) => {
    if (child.type.name !== 'paragraph') {
      // Non-paragraph children: serialize as-is
      updatedContent.push(child.toJSON() as EntryParagraphJson);
      return;
    }

    const tocSourceId = child.attrs?.tocSourceId as string | undefined;
    const childJson = child.toJSON() as EntryParagraphJson;
    const content = childJson.content ?? [];

    let paragraphChanged = false;

    const updatedContentArray = content.map((node: Record<string, unknown>) => {
      const marks = node.marks as Array<{ type: string }> | undefined;
      const hasTocPageNumberMark = marks?.some((m) => m.type === 'tocPageNumber');

      if (!hasTocPageNumberMark) return node;

      hasPageNumberMarks = true;

      // Skip entries without tocSourceId — no anchor for page map lookup
      if (!tocSourceId) return node;

      const pageNumber = pageMap.get(tocSourceId);
      const newText = pageNumber !== undefined ? String(pageNumber) : '??';

      if (node.text !== newText) {
        paragraphChanged = true;
        return { ...node, text: newText };
      }

      return node;
    });

    if (paragraphChanged) {
      anyChanged = true;
      updatedContent.push({ ...childJson, content: updatedContentArray });
    } else {
      updatedContent.push(childJson);
    }
  });

  return { updatedContent, hasPageNumberMarks, anyChanged };
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
  const config = input.config ? applyTocPatchTyped(DEFAULT_TOC_CONFIG, input.config) : DEFAULT_TOC_CONFIG;
  const instruction = serializeTocInstruction(config);
  const content = materializeTocContent(editor.state.doc, withRightAlign(config, input.config?.rightAlignPageNumbers));

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
      ...(input.config?.rightAlignPageNumbers !== undefined
        ? { rightAlignPageNumbers: input.config.rightAlignPageNumbers }
        : {}),
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
