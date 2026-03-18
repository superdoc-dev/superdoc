/**
 * Footnote plan-engine wrappers — bridge footnotes.* operations to the parts system.
 *
 * Mutations flow through `mutatePart` / `compoundMutation` so that
 * `convertedXml['word/footnotes.xml']` (or endnotes) is the canonical store.
 * `converter.footnotes` / `converter.endnotes` are derived caches rebuilt
 * by the notes-part-descriptor's `afterCommit` hook.
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
import { getRevision, checkRevision } from './revision-tracker.js';
import { rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { clearIndexCache } from '../helpers/index-cache.js';
import { DocumentApiAdapterError } from '../errors.js';
import { mutatePart } from '../../core/parts/mutation/mutate-part.js';
import { compoundMutation } from '../../core/parts/mutation/compound-mutation.js';
import {
  getNotesConfig,
  addNoteElement,
  updateNoteElement,
  removeNoteElement,
  bootstrapNotesPart,
  getNoteElements,
} from '../../core/parts/adapters/notes-part-descriptor.js';
import type { NoteEntry } from '../../core/parts/adapters/notes-part-descriptor.js';

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

// ---------------------------------------------------------------------------
// Converter shape
// ---------------------------------------------------------------------------

interface ConverterNotesStore {
  footnotes?: NoteEntry[];
  endnotes?: NoteEntry[];
  footnoteProperties?: Record<string, unknown> | null;
  convertedXml?: Record<string, unknown>;
}

function getConverter(editor: Editor): ConverterNotesStore {
  const converter = (editor as unknown as { converter?: ConverterNotesStore }).converter;
  if (!converter) {
    throw new DocumentApiAdapterError('CAPABILITY_UNAVAILABLE', 'converter not available.');
  }
  return converter;
}

// ---------------------------------------------------------------------------
// ID allocation
// ---------------------------------------------------------------------------

function toNonNegativeInteger(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isInteger(num) || !Number.isFinite(num) || num < 0) return null;
  return num;
}

/**
 * Collect every non-negative integer ID already in use for a note type.
 *
 * Reads from three sources so newly bootstrapped parts (whose derived
 * cache hasn't been rebuilt yet) are still accounted for:
 *   1. PM document references (footnoteReference / endnoteReference nodes)
 *   2. The canonical OOXML part (word/footnotes.xml or word/endnotes.xml)
 *   3. The derived cache (converter.footnotes / converter.endnotes)
 *
 * Special note types (separator, continuationSeparator) use negative IDs
 * by convention and are excluded by the non-negative filter.
 */
function collectUsedNoteIds(editor: Editor, converter: ConverterNotesStore, type: 'footnote' | 'endnote'): Set<number> {
  const used = new Set<number>();
  const config = getNotesConfig(type);

  // 1. PM document references
  for (const ref of findAllFootnotes(editor.state.doc, type)) {
    const parsed = toNonNegativeInteger(ref.noteId);
    if (parsed != null) used.add(parsed);
  }

  // 2. Canonical OOXML part (survives even when the derived cache is stale)
  const ooxmlPart = converter.convertedXml?.[config.partId];
  if (ooxmlPart) {
    for (const el of getNoteElements(ooxmlPart, config.childElementName)) {
      const parsed = toNonNegativeInteger(el.attributes?.['w:id']);
      if (parsed != null) used.add(parsed);
    }
  }

  // 3. Derived cache (may contain entries not yet in OOXML after a sync)
  const cache = converter[config.converterKey];
  if (Array.isArray(cache)) {
    for (const entry of cache) {
      const parsed = toNonNegativeInteger(entry.id);
      if (parsed != null) used.add(parsed);
    }
  }

  return used;
}

/**
 * Allocate the next available note ID by scanning all known sources.
 */
function allocateNextNoteId(editor: Editor, converter: ConverterNotesStore, type: 'footnote' | 'endnote'): string {
  const used = collectUsedNoteIds(editor, converter, type);

  let candidate = 1;
  while (used.has(candidate)) candidate += 1;

  return String(candidate);
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

/**
 * Insert a new footnote/endnote.
 *
 * Uses `compoundMutation` because it touches both:
 * 1. The OOXML notes part (add <w:footnote> element)
 * 2. The PM document (insert footnoteReference/endnoteReference node)
 */
export function footnotesInsertWrapper(
  editor: Editor,
  input: FootnoteInsertInput,
  options?: MutationOptions,
): FootnoteMutationResult {
  rejectTrackedMode('footnotes.insert', options);
  checkRevision(editor, options?.expectedRevision);

  const converter = getConverter(editor);
  const notesConfig = getNotesConfig(input.type);
  const noteId = allocateNextNoteId(editor, converter, input.type);
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

  const { success } = compoundMutation({
    editor,
    source: `footnotes.insert:${input.type}`,
    affectedParts: [notesConfig.partId],
    execute: () => {
      // Bootstrap the notes part inside the transactional path so the
      // compound snapshot correctly records the part as non-existent.
      // On rollback the bootstrapped part is removed automatically.
      bootstrapNotesPart(editor, input.type);

      // 1. Add note element to the canonical OOXML part
      mutatePart({
        editor,
        partId: notesConfig.partId,
        operation: 'mutate',
        source: `footnotes.insert:${input.type}`,
        mutate({ part }) {
          addNoteElement(part, notesConfig, noteId, input.content);
        },
      });

      // 2. Insert the reference node in the PM document
      const node = nodeType.create({ id: noteId });
      const { tr } = editor.state;
      tr.insert(resolved.from, node);
      editor.dispatch(tr);

      clearIndexCache(editor);
      return true;
    },
  });

  if (!success) {
    return footnoteFailure('NO_OP', 'Insert operation produced no change.');
  }

  return footnoteSuccess(address);
}

/**
 * Update footnote/endnote content.
 *
 * Uses `mutatePart` directly — only the OOXML notes part is modified.
 * The derived cache is rebuilt by the `afterCommit` hook.
 */
export function footnotesUpdateWrapper(
  editor: Editor,
  input: FootnoteUpdateInput,
  options?: MutationOptions,
): FootnoteMutationResult {
  rejectTrackedMode('footnotes.update', options);

  const resolved = resolveFootnoteTarget(editor.state.doc, input.target);
  const address: FootnoteAddress = { kind: 'entity', entityType: 'footnote', noteId: resolved.noteId };

  if (options?.dryRun || input.patch.content === undefined) {
    return footnoteSuccess(address);
  }

  const notesConfig = getNotesConfig(resolved.type);

  mutatePart({
    editor,
    partId: notesConfig.partId,
    operation: 'mutate',
    source: `footnotes.update:${resolved.type}`,
    expectedRevision: options?.expectedRevision,
    mutate({ part }) {
      updateNoteElement(part, notesConfig, resolved.noteId, input.patch.content!);
    },
  });

  return footnoteSuccess(address);
}

/**
 * Remove a footnote/endnote.
 *
 * Uses `compoundMutation` because it touches both:
 * 1. The PM document (delete the footnoteReference/endnoteReference node)
 * 2. The OOXML notes part (remove <w:footnote> element if no more references)
 */
export function footnotesRemoveWrapper(
  editor: Editor,
  input: FootnoteRemoveInput,
  options?: MutationOptions,
): FootnoteMutationResult {
  rejectTrackedMode('footnotes.remove', options);
  checkRevision(editor, options?.expectedRevision);

  const resolved = resolveFootnoteTarget(editor.state.doc, input.target);
  const address: FootnoteAddress = { kind: 'entity', entityType: 'footnote', noteId: resolved.noteId };

  if (options?.dryRun) {
    return footnoteSuccess(address);
  }

  const notesConfig = getNotesConfig(resolved.type);

  const { success } = compoundMutation({
    editor,
    source: `footnotes.remove:${resolved.type}`,
    affectedParts: [notesConfig.partId],
    execute: () => {
      // 1. Delete the reference node from the PM document
      const { tr } = editor.state;
      const node = tr.doc.nodeAt(resolved.pos);
      if (!node) return false;

      tr.delete(resolved.pos, resolved.pos + node.nodeSize);
      editor.dispatch(tr);

      // 2. Remove from the OOXML part if no other references remain
      const stillReferenced = findAllFootnotes(editor.state.doc, resolved.type).some(
        (f) => f.noteId === resolved.noteId,
      );

      if (!stillReferenced) {
        mutatePart({
          editor,
          partId: notesConfig.partId,
          operation: 'mutate',
          source: `footnotes.remove:${resolved.type}`,
          mutate({ part }) {
            removeNoteElement(part, notesConfig, resolved.noteId);
          },
        });
      }

      clearIndexCache(editor);
      return true;
    },
  });

  if (!success) {
    return footnoteFailure('NO_OP', 'Remove operation produced no change.');
  }

  return footnoteSuccess(address);
}

/**
 * Configure footnote/endnote numbering and placement.
 *
 * Document-wide settings are written to `word/settings.xml` through the
 * parts system. Section-scoped settings that belong in `sectPr` go through
 * the document mutation path (not yet implemented — falls back to converter
 * cache for backward compatibility).
 */
export function footnotesConfigureWrapper(
  editor: Editor,
  input: FootnoteConfigureInput,
  options?: MutationOptions,
): FootnoteConfigResult {
  rejectTrackedMode('footnotes.configure', options);

  const prElementName = input.type === 'endnote' ? 'w:endnotePr' : 'w:footnotePr';

  // Document-wide config: mutate word/settings.xml
  mutatePart({
    editor,
    partId: 'word/settings.xml',
    operation: 'mutate',
    source: `footnotes.configure:${input.type}`,
    dryRun: options?.dryRun,
    expectedRevision: options?.expectedRevision,
    mutate({ part }) {
      const root = (part as { elements?: Array<{ elements?: unknown[] }> })?.elements?.[0];
      if (!root) return;
      if (!root.elements) root.elements = [];

      // Find or create the footnotePr/endnotePr element
      interface OoxmlElement {
        type?: string;
        name?: string;
        attributes?: Record<string, string>;
        elements?: OoxmlElement[];
      }
      const elements = root.elements as OoxmlElement[];
      let prElement = elements.find((el) => el.name === prElementName);
      if (!prElement) {
        prElement = { type: 'element', name: prElementName, elements: [] };
        elements.push(prElement);
      }
      if (!prElement.elements) prElement.elements = [];

      if (!input.numbering) return;

      // Apply numbering properties as OOXML child elements
      const setOrRemoveChild = (name: string, value: string | undefined) => {
        if (value === undefined) return;
        const children = prElement!.elements!;
        const existing = children.findIndex((el) => el.name === name);
        const newEl: OoxmlElement = { type: 'element', name, attributes: { 'w:val': value } };
        if (existing >= 0) {
          children[existing] = newEl;
        } else {
          children.push(newEl);
        }
      };

      setOrRemoveChild('w:numFmt', input.numbering.format);
      setOrRemoveChild('w:numStart', input.numbering.start !== undefined ? String(input.numbering.start) : undefined);
      if (input.numbering.restartPolicy !== undefined) {
        setOrRemoveChild(
          'w:numRestart',
          RESTART_POLICY_TO_OOXML[input.numbering.restartPolicy] ?? input.numbering.restartPolicy,
        );
      }
      setOrRemoveChild('w:pos', input.numbering.position);
    },
  });

  // Keep the derived footnoteProperties cache in sync so the export path
  // does not overwrite our changes with the stale originalXml snapshot.
  // Only sync for footnotes — converter.footnoteProperties represents
  // w:footnotePr only. Endnote config (w:endnotePr) is a separate element
  // and must not overwrite the footnote cache.
  if (!options?.dryRun && prElementName === 'w:footnotePr') {
    syncFootnotePropertiesCache(editor);
  }

  return configSuccess();
}

/**
 * Refresh `converter.footnoteProperties.originalXml` from the canonical
 * `word/settings.xml` part after a footnote configure mutation.
 *
 * The export path (`applyFootnotePropertiesToSettings`) reads `originalXml`
 * and writes it back to settings.xml, so it must reflect the latest state.
 *
 * Only called for footnote (not endnote) configure — `converter.footnoteProperties`
 * exclusively represents `w:footnotePr`.
 */
function syncFootnotePropertiesCache(editor: Editor): void {
  const converter = getConverter(editor) as ConverterNotesStore & {
    footnoteProperties?: { source?: string; originalXml?: unknown; [k: string]: unknown } | null;
  };
  if (!converter?.footnoteProperties || converter.footnoteProperties.source !== 'settings') return;

  const settingsPart = converter.convertedXml?.['word/settings.xml'] as
    | { elements?: Array<{ elements?: Array<{ name?: string }> }> }
    | undefined;
  const settingsRoot = settingsPart?.elements?.[0];
  const elements = settingsRoot?.elements ?? [];
  const prElement = elements.find((el) => el.name === 'w:footnotePr');

  if (prElement) {
    converter.footnoteProperties.originalXml = structuredClone(prElement);
  } else {
    // The element was removed — clear the cache so export doesn't re-emit it
    converter.footnoteProperties = null;
  }
}

const RESTART_POLICY_TO_OOXML: Record<string, string> = {
  continuous: 'continuous',
  eachSection: 'eachSect',
  eachPage: 'eachPage',
};
