/**
 * Footnote plan-engine wrappers — bridge footnotes.* operations to the adapter layer.
 */

import type { Editor } from '../../core/Editor.js';
import type {
  FootnoteListInput,
  FootnotesListResult,
  FootnoteGetInput,
  FootnoteInfo,
  FootnoteInsertInput,
  FootnoteUpdateInput,
  FootnoteRemoveInput,
  FootnoteMutationResult,
  FootnoteConfigureInput,
  FootnoteConfigResult,
  FootnoteAddress,
  MutationOptions,
  ReceiptFailureCode,
} from '@superdoc/document-api';
import { buildDiscoveryResult } from '@superdoc/document-api';
import {
  findAllFootnotes,
  resolveFootnoteTarget,
  extractFootnoteInfo,
  buildFootnoteDiscoveryItem,
} from '../helpers/footnote-resolver.js';
import { paginate, resolveInlineInsertPosition } from '../helpers/adapter-utils.js';
import { getRevision } from './revision-tracker.js';
import { executeDomainCommand } from './plan-wrappers.js';
import { rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { clearIndexCache } from '../helpers/index-cache.js';
import { executeOutOfBandMutation } from '../out-of-band-mutation.js';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

function footnoteSuccess(address: FootnoteAddress): FootnoteMutationResult {
  return { success: true, footnote: address };
}

function footnoteFailure(code: ReceiptFailureCode, message: string): FootnoteMutationResult {
  return { success: false, failure: { code, message } };
}

function configSuccess(): FootnoteConfigResult {
  return { success: true };
}

function configFailure(code: ReceiptFailureCode, message: string): FootnoteConfigResult {
  return { success: false, failure: { code, message } };
}

function receiptApplied(receipt: ReturnType<typeof executeDomainCommand>): boolean {
  return receipt.steps[0]?.effect === 'changed';
}

type FootnoteEntry = {
  id: string;
  type?: string | null;
  content: unknown[];
  originalXml?: unknown;
};

type LegacyNoteMap = Record<string, { content?: string }>;

interface ConverterNotesStore {
  footnotes?: FootnoteEntry[] | LegacyNoteMap;
  endnotes?: FootnoteEntry[] | LegacyNoteMap;
}

function isLegacyNoteMap(value: unknown): value is LegacyNoteMap {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function textToFootnoteContentNodes(text: string): unknown[] {
  const lines = text.split(/\r?\n/);
  return lines.map((line) => ({
    type: 'paragraph',
    content: line.length > 0 ? [{ type: 'text', text: line }] : [],
  }));
}

function normalizeLegacyNoteMap(map: LegacyNoteMap): FootnoteEntry[] {
  return Object.entries(map).map(([id, value]) => ({
    id: String(id),
    content: textToFootnoteContentNodes(value?.content ?? ''),
  }));
}

function ensureNoteEntries(converter: ConverterNotesStore, kind: 'footnotes' | 'endnotes'): FootnoteEntry[] {
  const current = converter[kind];
  if (Array.isArray(current)) return current;

  if (isLegacyNoteMap(current)) {
    const normalized = normalizeLegacyNoteMap(current);
    converter[kind] = normalized;
    return normalized;
  }

  const initialized: FootnoteEntry[] = [];
  converter[kind] = initialized;
  return initialized;
}

function toNonNegativeInteger(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isInteger(num) || !Number.isFinite(num) || num < 0) return null;
  return num;
}

function allocateNextNoteId(editor: Editor, type: 'footnote' | 'endnote', entries: FootnoteEntry[]): string {
  let maxId = 0;

  for (const ref of findAllFootnotes(editor.state.doc, type)) {
    const parsed = toNonNegativeInteger(ref.noteId);
    if (parsed != null) maxId = Math.max(maxId, parsed);
  }

  for (const entry of entries) {
    const parsed = toNonNegativeInteger(entry.id);
    if (parsed != null) maxId = Math.max(maxId, parsed);
  }

  return String(maxId + 1);
}

function upsertNoteEntry(entries: FootnoteEntry[], noteId: string, content: string): void {
  const existing = entries.find((entry) => String(entry.id) === noteId);
  if (existing) {
    existing.content = textToFootnoteContentNodes(content);
    return;
  }

  entries.push({
    id: noteId,
    content: textToFootnoteContentNodes(content),
  });
}

function removeNoteEntry(entries: FootnoteEntry[], noteId: string): void {
  const index = entries.findIndex((entry) => String(entry.id) === noteId);
  if (index >= 0) entries.splice(index, 1);
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export function footnotesListWrapper(editor: Editor, query?: FootnoteListInput): FootnotesListResult {
  const doc = editor.state.doc;
  const revision = getRevision(editor);
  const footnotes = findAllFootnotes(doc, query?.type);

  const allItems = footnotes.map((f) => buildFootnoteDiscoveryItem(editor, f, revision));
  const { total, items: paged } = paginate(allItems, query?.offset, query?.limit);
  const effectiveLimit = query?.limit ?? total;

  return buildDiscoveryResult({
    evaluatedRevision: revision,
    total,
    items: paged,
    page: { limit: effectiveLimit, offset: query?.offset ?? 0, returned: paged.length },
  });
}

export function footnotesGetWrapper(editor: Editor, input: FootnoteGetInput): FootnoteInfo {
  const resolved = resolveFootnoteTarget(editor.state.doc, input.target);
  return extractFootnoteInfo(editor, resolved);
}

// ---------------------------------------------------------------------------
// Mutation operations
// ---------------------------------------------------------------------------

export function footnotesInsertWrapper(
  editor: Editor,
  input: FootnoteInsertInput,
  options?: MutationOptions,
): FootnoteMutationResult {
  rejectTrackedMode('footnotes.insert', options);

  const converter = (editor as unknown as { converter?: ConverterNotesStore }).converter;
  if (!converter) {
    throw new DocumentApiAdapterError('CAPABILITY_UNAVAILABLE', 'footnotes.insert: converter not available.');
  }

  const noteStoreKey = input.type === 'endnote' ? 'endnotes' : 'footnotes';
  const noteEntries = ensureNoteEntries(converter, noteStoreKey);
  const noteId = allocateNextNoteId(editor, input.type, noteEntries);
  const address: FootnoteAddress = { kind: 'entity', entityType: 'footnote', noteId };

  if (options?.dryRun) {
    return footnoteSuccess(address);
  }

  const nodeTypeName = input.type === 'endnote' ? 'endnoteReference' : 'footnoteReference';
  const nodeType = editor.schema.nodes[nodeTypeName];

  if (!nodeType) {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      `footnotes.insert: node type "${nodeTypeName}" is not registered in the schema.`,
    );
  }

  const resolved = resolveInlineInsertPosition(editor, input.at, 'footnotes.insert');

  const receipt = executeDomainCommand(
    editor,
    () => {
      const node = nodeType.create({ id: noteId });
      const { tr } = editor.state;
      tr.insert(resolved.from, node);
      editor.dispatch(tr);

      // Keep converter note content in exporter-compatible array form.
      upsertNoteEntry(noteEntries, noteId, input.content);

      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) {
    return footnoteFailure('NO_OP', 'Insert operation produced no change.');
  }

  return footnoteSuccess(address);
}

export function footnotesUpdateWrapper(
  editor: Editor,
  input: FootnoteUpdateInput,
  options?: MutationOptions,
): FootnoteMutationResult {
  rejectTrackedMode('footnotes.update', options);

  const resolved = resolveFootnoteTarget(editor.state.doc, input.target);
  const address: FootnoteAddress = { kind: 'entity', entityType: 'footnote', noteId: resolved.noteId };

  if (options?.dryRun) {
    return footnoteSuccess(address);
  }

  // Footnote content is stored in the converter's footnote/endnote parts.
  // This is an out-of-band mutation since it modifies XML parts, not PM state.
  const converter = (editor as unknown as { converter?: ConverterNotesStore }).converter;
  if (!converter) {
    throw new DocumentApiAdapterError('CAPABILITY_UNAVAILABLE', 'footnotes.update: converter not available.');
  }
  const noteStoreKey = resolved.type === 'footnote' ? 'footnotes' : 'endnotes';
  const noteEntries = ensureNoteEntries(converter, noteStoreKey);

  executeOutOfBandMutation(
    editor,
    (dryRun) => {
      if (input.patch.content === undefined) {
        return { changed: false, payload: undefined };
      }

      if (!dryRun) {
        upsertNoteEntry(noteEntries, resolved.noteId, input.patch.content);
      }

      return { changed: true, payload: undefined };
    },
    { dryRun: options?.dryRun ?? false, expectedRevision: options?.expectedRevision },
  );

  return footnoteSuccess(address);
}

export function footnotesRemoveWrapper(
  editor: Editor,
  input: FootnoteRemoveInput,
  options?: MutationOptions,
): FootnoteMutationResult {
  rejectTrackedMode('footnotes.remove', options);

  const resolved = resolveFootnoteTarget(editor.state.doc, input.target);
  const address: FootnoteAddress = { kind: 'entity', entityType: 'footnote', noteId: resolved.noteId };

  if (options?.dryRun) {
    return footnoteSuccess(address);
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      const node = tr.doc.nodeAt(resolved.pos);
      if (node) {
        tr.delete(resolved.pos, resolved.pos + node.nodeSize);
        editor.dispatch(tr);
        const converter = (editor as unknown as { converter?: ConverterNotesStore }).converter;
        if (converter) {
          const noteStoreKey = resolved.type === 'footnote' ? 'footnotes' : 'endnotes';
          const noteEntries = ensureNoteEntries(converter, noteStoreKey);
          const stillReferenced = findAllFootnotes(editor.state.doc, resolved.type).some(
            (f) => f.noteId === resolved.noteId,
          );
          if (!stillReferenced) {
            removeNoteEntry(noteEntries, resolved.noteId);
          }
        }
        clearIndexCache(editor);
        return true;
      }
      return false;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) {
    return footnoteFailure('NO_OP', 'Remove operation produced no change.');
  }

  return footnoteSuccess(address);
}

export function footnotesConfigureWrapper(
  editor: Editor,
  input: FootnoteConfigureInput,
  options?: MutationOptions,
): FootnoteConfigResult {
  rejectTrackedMode('footnotes.configure', options);

  interface FootnotePropertiesStore {
    footnoteProperties?: Record<string, unknown> | null;
    convertedXml?: Record<string, unknown>;
  }

  const converter = (editor as unknown as { converter?: FootnotePropertiesStore }).converter;
  if (!converter) {
    throw new DocumentApiAdapterError('CAPABILITY_UNAVAILABLE', 'footnotes.configure: converter not available.');
  }

  executeOutOfBandMutation(
    editor,
    (dryRun) => {
      if (dryRun) return { changed: true, payload: undefined };

      // Ensure the footnoteProperties object exists
      if (!converter.footnoteProperties) {
        converter.footnoteProperties = { source: 'settings' };
      }
      const props = converter.footnoteProperties;

      // Apply numbering config fields to converter state (w:footnotePr / w:endnotePr)
      if (input.numbering) {
        if (input.numbering.format !== undefined) props.numFmt = input.numbering.format;
        if (input.numbering.start !== undefined) props.numStart = String(input.numbering.start);
        if (input.numbering.restartPolicy !== undefined) {
          props.numRestart = RESTART_POLICY_TO_OOXML[input.numbering.restartPolicy] ?? input.numbering.restartPolicy;
        }
        if (input.numbering.position !== undefined) props.pos = input.numbering.position;
      }

      // Store the type so the exporter knows which part to update
      props.noteType = input.type;
      if (input.scope) props.scope = input.scope;

      return { changed: true, payload: undefined };
    },
    { dryRun: options?.dryRun ?? false, expectedRevision: options?.expectedRevision },
  );

  return configSuccess();
}

const RESTART_POLICY_TO_OOXML: Record<string, string> = {
  continuous: 'continuous',
  eachSection: 'eachSect',
  eachPage: 'eachPage',
};
