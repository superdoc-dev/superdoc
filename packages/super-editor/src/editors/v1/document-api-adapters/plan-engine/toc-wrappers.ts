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
import {
  collectTocSources,
  buildTocEntryParagraphs,
  type BuildTocEntryOptions,
  type EntryParagraphJson,
  type TocSource,
} from '../helpers/toc-entry-builder.js';
import { syncTocBookmarks } from '../helpers/toc-bookmark-sync.js';
import { paginate } from '../helpers/adapter-utils.js';
import { getRevision } from './revision-tracker.js';
import { executeDomainCommand } from './plan-wrappers.js';
import { rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { clearIndexCache } from '../helpers/index-cache.js';
import { resolveCreateAnchor } from './create-insertion.js';

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

function normalizeTocContent(content: unknown, editor: Editor): ProseMirrorNode[] | null {
  if (!Array.isArray(content)) return null;
  return content.map((entry) =>
    entry && typeof entry === 'object' && typeof (entry as { type?: unknown }).type === 'string'
      ? editor.state.schema.nodeFromJSON(entry as Record<string, unknown>)
      : (entry as ProseMirrorNode),
  );
}

function dispatchEditorTransaction(editor: Editor, tr: unknown): void {
  if (typeof editor.dispatch === 'function') {
    editor.dispatch(tr as Parameters<Editor['dispatch']>[0]);
    return;
  }
  if (typeof editor.view?.dispatch === 'function') {
    editor.view.dispatch(tr as Parameters<NonNullable<Editor['view']>['dispatch']>[0]);
    return;
  }
  throw new Error('No transaction dispatcher available.');
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

/**
 * Strips `tocPageNumber` marks anywhere in a node subtree. Returns the
 * possibly-rewritten node and whether anything changed. Required because
 * buildTocEntryParagraphs wraps the page-number text in a `run`, so the
 * mark lives one level below the paragraph's direct children.
 */
function stripTocPageNumberFromNode<T>(node: T): { node: T; changed: boolean } {
  if (!node || typeof node !== 'object') return { node, changed: false };

  const typedNode = node as { marks?: Array<{ type?: string }>; content?: unknown[] };
  let changed = false;
  let next: typeof typedNode = typedNode;

  if (Array.isArray(typedNode.marks)) {
    const filtered = typedNode.marks.filter((mark) => mark?.type !== 'tocPageNumber');
    if (filtered.length !== typedNode.marks.length) {
      changed = true;
      if (filtered.length === 0) {
        const { marks: _removed, ...rest } = next;
        next = rest as typeof typedNode;
      } else {
        next = { ...next, marks: filtered };
      }
    }
  }

  if (Array.isArray(typedNode.content)) {
    let childChanged = false;
    const nextChildren = typedNode.content.map((child) => {
      const result = stripTocPageNumberFromNode(child);
      if (result.changed) childChanged = true;
      return result.node;
    });
    if (childChanged) {
      changed = true;
      next = { ...next, content: nextChildren };
    }
  }

  return { node: next as unknown as T, changed };
}

/**
 * Removes tocPageNumber marks when the active schema doesn't define that mark.
 * Some headless/test schemas omit TOC-specific marks, and nodeFromJSON fails if
 * unknown marks are present in generated TOC paragraph content.
 */
export function sanitizeTocContentForSchema(content: EntryParagraphJson[], editor: Editor): EntryParagraphJson[] {
  if (editor.state.schema?.marks?.tocPageNumber) return content;

  return content.map((paragraph) => {
    const paragraphContent = paragraph.content;
    if (!Array.isArray(paragraphContent)) return paragraph;

    let changed = false;
    const sanitizedContent = paragraphContent.map((node) => {
      const result = stripTocPageNumberFromNode(node);
      if (result.changed) changed = true;
      return result.node;
    });

    return changed ? ({ ...paragraph, content: sanitizedContent } as EntryParagraphJson) : paragraph;
  });
}

interface MaterializedToc {
  content: EntryParagraphJson[];
  sources: TocSource[];
}

type MaterializeTocOptions = BuildTocEntryOptions;

function materializeTocContent(
  doc: ProseMirrorNode,
  config: TocSwitchConfig,
  editor: Editor,
  options: MaterializeTocOptions = {},
): MaterializedToc {
  const sources = collectTocSources(doc, config);
  const entryParagraphs = buildTocEntryParagraphs(sources, config, options);
  const content = entryParagraphs.length > 0 ? entryParagraphs : NO_ENTRIES_PLACEHOLDER;
  return { content: sanitizeTocContentForSchema(content, editor), sources };
}

/** Recognises TOC entry paragraph styles (TOC1, TOC2, … TOC9). */
const TOC_ENTRY_STYLE_RE = /^TOC[1-9]$/;

type TocParagraphProps = {
  styleId?: string;
  tabStops?: TabStopJson[];
  runProperties?: Record<string, unknown>;
};
type TocParagraphAttrs = { paragraphProperties?: TocParagraphProps };
type TabStopJson = { tab?: { pos?: number; tabType?: string; leader?: string } };

/** First TOC1–TOC9 paragraph in the existing TOC node, or `undefined`. */
function findFirstTocEntryParagraph(node: ProseMirrorNode): ProseMirrorNode | undefined {
  let entry: ProseMirrorNode | undefined;
  node.forEach((paragraph) => {
    if (entry || paragraph.type.name !== 'paragraph') return;
    const styleId = (paragraph.attrs as TocParagraphAttrs | undefined)?.paragraphProperties?.styleId;
    if (styleId && TOC_ENTRY_STYLE_RE.test(styleId)) entry = paragraph;
  });
  return entry;
}

/** Right-tab stop position (twips) from the first existing TOC entry. */
function readExistingTocTabPos(node: ProseMirrorNode): number | undefined {
  const entry = findFirstTocEntryParagraph(node) ?? node.firstChild ?? undefined;
  const tabStops = (entry?.attrs as TocParagraphAttrs | undefined)?.paragraphProperties?.tabStops;
  const pos = tabStops?.find((t) => t?.tab?.tabType === 'right')?.tab?.pos;
  return typeof pos === 'number' ? pos : undefined;
}

/**
 * Word's TOC field always closes with a paragraph that holds the
 * `<w:fldChar fldCharType="end"/>` — typically a Normal-styled empty
 * paragraph after the entries. SuperDoc's importer preserves it as the last
 * child of the `tableOfContents` node, and it renders as a blank line below
 * the entries. If we replace **all** children with just the rebuilt entries,
 * the TOC visually shrinks by that blank line and the gap to the text below
 * shifts. Capture the original trailing non-entry paragraph (when present)
 * as JSON so we can append it after the rebuilt entries to keep the visual
 * end of the TOC stable.
 *
 * A real trailer only exists in TOCs that already have entries above it.
 * When the TOC currently shows only the `NO_ENTRIES_PLACEHOLDER` (i.e.
 * after a previous rebuild found no headings), the lastChild is the
 * placeholder itself — preserving it as a trailer would re-inject the
 * "No table of contents entries found." paragraph into the next rebuild.
 */
function readExistingTocTrailingParagraph(node: ProseMirrorNode): unknown | undefined {
  const last = node.lastChild;
  if (!last || last.type.name !== 'paragraph') return undefined;
  const styleId = (last.attrs as TocParagraphAttrs | undefined)?.paragraphProperties?.styleId;
  if (styleId && TOC_ENTRY_STYLE_RE.test(styleId)) return undefined; // it's an entry, not the trailer

  // Only treat the last paragraph as a trailer when at least one real TOC
  // entry precedes it. Without this guard, a TOC whose only child is the
  // "no entries" placeholder would have that placeholder treated as the
  // trailer and re-appended to every subsequent rebuild.
  let hasPrecedingEntry = false;
  node.forEach((child) => {
    if (hasPrecedingEntry || child === last) return;
    if (child.type.name !== 'paragraph') return;
    const childStyleId = (child.attrs as TocParagraphAttrs | undefined)?.paragraphProperties?.styleId;
    if (childStyleId && TOC_ENTRY_STYLE_RE.test(childStyleId)) hasPrecedingEntry = true;
  });
  if (!hasPrecedingEntry) return undefined;

  return typeof last.toJSON === 'function' ? last.toJSON() : undefined;
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

  const resolved = resolveTocTarget(editor.state.doc, input.target);
  const currentConfig = parseTocInstruction(resolved.node.attrs?.instruction ?? '');
  const patched = applyTocPatchTyped(currentConfig, input.patch);
  const instruction = serializeTocInstruction(patched);

  // rightAlignPageNumbers is a PM node attr, not an instruction switch
  const rightAlignChanged =
    input.patch.rightAlignPageNumbers !== undefined &&
    input.patch.rightAlignPageNumbers !== resolved.node.attrs?.rightAlignPageNumbers;

  // Merge rightAlignPageNumbers into config for entry materialization.
  // Patch value takes priority; fall back to existing node attr.
  const effectiveRightAlign =
    input.patch.rightAlignPageNumbers ?? (resolved.node.attrs?.rightAlignPageNumbers as boolean | undefined);
  const { content: rebuiltEntries, sources } = materializeTocContent(
    editor.state.doc,
    withRightAlign(patched, effectiveRightAlign),
    editor,
    {
      pageMap: getPageMap(editor) ?? undefined,
      tabPos: readExistingTocTabPos(resolved.node),
    },
  );
  const trailing = readExistingTocTrailingParagraph(resolved.node);
  const nextContent = trailing ? [...rebuiltEntries, trailing as EntryParagraphJson] : rebuiltEntries;

  if (areTocConfigsEqual(currentConfig, patched) && !rightAlignChanged) {
    return tocFailure('NO_OP', 'Configuration patch produced no change.');
  }

  if (options?.dryRun) {
    return tocSuccess(resolved.nodeId);
  }

  const shouldRefreshContent = !isTocContentUnchanged(resolved.node, nextContent);
  const command = editor.commands?.setTableOfContentsInstructionById;
  const commandNodeId = resolved.commandNodeId ?? resolved.nodeId;
  const receipt =
    typeof command === 'function'
      ? runTocCommand(
          editor,
          command,
          {
            sdBlockId: commandNodeId,
            instruction,
            ...(shouldRefreshContent ? { content: nextContent } : {}),
            ...(rightAlignChanged ? { rightAlignPageNumbers: input.patch.rightAlignPageNumbers } : {}),
          },
          options?.expectedRevision,
        )
      : runTocAction(
          editor,
          () => {
            try {
              const { tr } = editor.state;
              tr.setNodeMarkup(resolved.pos, undefined, {
                ...resolved.node.attrs,
                instruction,
                ...(rightAlignChanged ? { rightAlignPageNumbers: input.patch.rightAlignPageNumbers } : {}),
              });
              if (shouldRefreshContent) {
                const from = resolved.pos + 1;
                const to = resolved.pos + resolved.node.nodeSize - 1;
                tr.replaceWith(from, to, normalizeTocContent(nextContent, editor) ?? []);
              }
              dispatchEditorTransaction(editor, tr);
              return true;
            } catch {
              return false;
            }
          },
          options?.expectedRevision,
        );

  if (!receiptApplied(receipt)) {
    return tocFailure('NO_OP', 'Configuration change could not be applied.');
  }

  syncTocBookmarks(editor, sources);

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
  const resolved = resolveTocTarget(editor.state.doc, input.target);
  const config = parseTocInstruction(resolved.node.attrs?.instruction ?? '');
  const rightAlign = resolved.node.attrs?.rightAlignPageNumbers as boolean | undefined;
  const { content: rebuiltEntries, sources } = materializeTocContent(
    editor.state.doc,
    withRightAlign(config, rightAlign),
    editor,
    {
      pageMap: getPageMap(editor) ?? undefined,
      tabPos: readExistingTocTabPos(resolved.node),
    },
  );

  // Preserve the trailer paragraph if the existing TOC ends with one — keeps
  // the visual gap below the TOC stable across rebuilds.
  const trailing = readExistingTocTrailingParagraph(resolved.node);
  const content = trailing ? [...rebuiltEntries, trailing as EntryParagraphJson] : rebuiltEntries;

  // NO_OP detection: compare new content against existing before executing.
  // The PM command returns "found" (not "content changed"), so receipt-based
  // detection would always report 'changed' when the node exists.
  if (isTocContentUnchanged(resolved.node, content)) {
    return tocFailure('NO_OP', 'TOC update produced no change.');
  }

  if (options?.dryRun) {
    return tocSuccess(resolved.nodeId);
  }

  const command = editor.commands?.replaceTableOfContentsContentById;
  const receipt =
    typeof command === 'function'
      ? runTocCommand(
          editor,
          command,
          {
            sdBlockId: resolved.commandNodeId ?? resolved.nodeId,
            content,
          },
          options?.expectedRevision,
        )
      : runTocAction(
          editor,
          () => {
            try {
              const { tr } = editor.state;
              const from = resolved.pos + 1;
              const to = resolved.pos + resolved.node.nodeSize - 1;
              tr.replaceWith(from, to, normalizeTocContent(content, editor) ?? []);
              dispatchEditorTransaction(editor, tr);
              return true;
            } catch {
              return false;
            }
          },
          options?.expectedRevision,
        );

  if (!receiptApplied(receipt)) {
    return tocFailure('NO_OP', 'TOC update produced no change.');
  }

  syncTocBookmarks(editor, sources);
  return tocSuccess(resolved.nodeId);
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

  const command = editor.commands?.replaceTableOfContentsContentById;
  const receipt =
    typeof command === 'function'
      ? runTocCommand(
          editor,
          command,
          {
            sdBlockId: resolved.commandNodeId ?? resolved.nodeId,
            content: updatedContent,
          },
          options?.expectedRevision,
        )
      : runTocAction(
          editor,
          () => {
            try {
              const { tr } = editor.state;
              const from = resolved.pos + 1;
              const to = resolved.pos + resolved.node.nodeSize - 1;
              tr.replaceWith(from, to, normalizeTocContent(updatedContent, editor) ?? []);
              dispatchEditorTransaction(editor, tr);
              return true;
            } catch {
              return false;
            }
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

    let paragraphChanged = false;

    // Walk recursively — the rebuilt paragraph wraps its runs in `run` nodes,
    // so the tocPageNumber mark sits one level below the paragraph's direct
    // children. A flat scan over `paragraph.content` would miss it and fall
    // through to PAGE_NUMBERS_NOT_MATERIALIZED.
    const visit = (node: Record<string, unknown>): Record<string, unknown> => {
      const marks = node.marks as Array<{ type: string }> | undefined;
      const hasTocPageNumberMark = marks?.some((m) => m.type === 'tocPageNumber');

      if (hasTocPageNumberMark) {
        hasPageNumberMarks = true;

        if (!tocSourceId) return node;

        const pageNumber = pageMap.get(tocSourceId);
        const newText = pageNumber !== undefined ? String(pageNumber) : '??';

        if (node.text !== newText) {
          paragraphChanged = true;
          return { ...node, text: newText };
        }
        return node;
      }

      const nested = node.content as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(nested) || nested.length === 0) return node;
      const visited = nested.map(visit);
      const replaced = visited.some((next, idx) => next !== nested[idx]);
      return replaced ? { ...node, content: visited } : node;
    };

    const updatedContentArray = (childJson.content ?? []).map(visit);

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

  const resolved = resolveTocTarget(editor.state.doc, input.target);

  if (options?.dryRun) {
    return tocSuccess(resolved.nodeId);
  }

  const command = editor.commands?.deleteTableOfContentsById;
  const receipt =
    typeof command === 'function'
      ? runTocCommand(
          editor,
          command,
          {
            sdBlockId: resolved.commandNodeId ?? resolved.nodeId,
          },
          options?.expectedRevision,
        )
      : runTocAction(
          editor,
          () => {
            try {
              const { tr } = editor.state;
              tr.delete(resolved.pos, resolved.pos + resolved.node.nodeSize);
              dispatchEditorTransaction(editor, tr);
              return true;
            } catch {
              return false;
            }
          },
          options?.expectedRevision,
        );

  return receiptApplied(receipt) ? tocSuccess(resolved.nodeId) : tocFailure('NO_OP', 'TOC removal produced no change.');
}

// ---------------------------------------------------------------------------
// create.tableOfContents
// ---------------------------------------------------------------------------

/** Payload for inserting a TOC block (shared by document API and toolbar). */
export type PreparedTableOfContentsInsert = {
  pos: number;
  instruction: string;
  sdBlockId: string;
  content: unknown[];
  sources: TocSource[];
  rightAlignPageNumbers?: boolean;
};

/**
 * Resolves insertion position and materializes TOC content/instruction.
 * Callers that run inside `editor.commands.*` must apply the insert on the
 * **same** command transaction (see `insertTableOfContents`) —
 * never call `editor.commands.insertTableOfContentsAt` from here, or nested
 * dispatches can throw "Applying a mismatched transaction".
 */
export function prepareTableOfContentsInsertion(
  editor: Editor,
  input: CreateTableOfContentsInput,
  options?: MutationOptions,
): PreparedTableOfContentsInsert {
  rejectTrackedMode('create.tableOfContents', options);

  const at = input.at ?? { kind: 'documentEnd' as const };
  let pos: number;
  if (at.kind === 'documentStart') {
    pos = 0;
  } else if (at.kind === 'documentEnd') {
    pos = editor.state.doc.content.size;
  } else {
    pos = resolveCreateAnchor(editor, at.target, at.kind).pos;
  }

  const config = input.config ? applyTocPatchTyped(DEFAULT_TOC_CONFIG, input.config) : DEFAULT_TOC_CONFIG;
  const instruction = serializeTocInstruction(config);
  const { content, sources } = materializeTocContent(
    editor.state.doc,
    withRightAlign(config, input.config?.rightAlignPageNumbers),
    editor,
    {
      pageMap: getPageMap(editor) ?? undefined,
    },
  );

  const sdBlockId = uuidv4();

  return {
    pos,
    instruction,
    sdBlockId,
    content,
    sources,
    ...(input.config?.rightAlignPageNumbers !== undefined
      ? { rightAlignPageNumbers: input.config.rightAlignPageNumbers }
      : {}),
  };
}

export function createTableOfContentsWrapper(
  editor: Editor,
  input: CreateTableOfContentsInput,
  options?: MutationOptions,
): CreateTableOfContentsResult {
  const prepared = prepareTableOfContentsInsertion(editor, input, options);

  if (options?.dryRun) {
    return { success: true, toc: buildTocAddress('(dry-run)') };
  }

  const command = editor.commands?.insertTableOfContentsAt;
  const receipt =
    typeof command === 'function'
      ? runTocCommand(
          editor,
          command,
          {
            pos: prepared.pos,
            instruction: prepared.instruction,
            sdBlockId: prepared.sdBlockId,
            content: prepared.content,
            ...(prepared.rightAlignPageNumbers !== undefined
              ? { rightAlignPageNumbers: prepared.rightAlignPageNumbers }
              : {}),
          },
          options?.expectedRevision,
        )
      : runTocAction(
          editor,
          () => {
            const tocType = editor.state.schema.nodes.tableOfContents;
            const paragraphType = editor.state.schema.nodes.paragraph;
            if (!tocType || !paragraphType) return false;

            const defaultContent = [
              paragraphType.create({}, editor.state.schema.text('Update table of contents to populate entries.')),
            ];
            const materializedContent = normalizeTocContent(prepared.content, editor) ?? defaultContent;
            const tocNode = tocType.create(
              {
                instruction: prepared.instruction,
                sdBlockId: prepared.sdBlockId,
                ...(prepared.rightAlignPageNumbers !== undefined
                  ? { rightAlignPageNumbers: prepared.rightAlignPageNumbers }
                  : {}),
              },
              materializedContent,
            );

            try {
              const { tr } = editor.state;
              tr.insert(prepared.pos, tocNode);
              dispatchEditorTransaction(editor, tr);
              return true;
            } catch (error) {
              if (error instanceof RangeError) return false;
              throw error;
            }
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

  syncTocBookmarks(editor, prepared.sources);

  // Re-resolve and return the public TOC id exposed by toc.list/toc.get.
  const postMutationId = resolvePostMutationTocId(editor.state.doc, prepared.sdBlockId);
  return { success: true, toc: buildTocAddress(postMutationId) };
}
