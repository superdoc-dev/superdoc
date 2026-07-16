/**
 * Footnote plan-engine wrappers — bridge footnotes.* operations to the parts system.
 *
 * Mutations flow through `mutatePart` / `compoundMutation` so that
 * `convertedXml['word/footnotes.xml']` (or endnotes) is the canonical store.
 * `converter.footnotes` / `converter.endnotes` are derived caches rebuilt
 * by the notes-part-descriptor's `afterCommit` hook.
 */

import { Selection } from 'prosemirror-state';
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
import { mutatePart, closeUndoGroup } from '../../core/parts/mutation/mutate-part.js';
import { compoundMutation } from '../../core/parts/mutation/compound-mutation.js';
import {
  getNotesConfig,
  addNoteElement,
  updateNoteElement,
  bootstrapNotesPart,
  getNoteElements,
  markSessionManagedNoteId,
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

  // §17.11.14: a footnote reference inside a footnote or endnote makes the
  // document non-conformant (and Word also forbids footnotes in headers and
  // footers). Story editors carry options.parentEditor — reject insertion
  // there so toolbar actions wired to the ACTIVE editor cannot write a
  // footnoteReference into a note story; callers must use the host editor.
  if ((editor.options as { parentEditor?: unknown } | undefined)?.parentEditor) {
    return footnoteFailure(
      'INVALID_TARGET',
      'footnotes.insert: footnotes can only be inserted into the document body, not inside a footnote, endnote, header, or footer.',
    );
  }

  // SD-3400: the default "insert at the current cursor" path (no explicit `at`)
  // writes the marker into the BODY at the body selection head. When the host
  // editor is the target but the user is actively editing a non-body story
  // (header/footer/footnote/endnote session), getActiveStoryLocator() is
  // non-null and the body selection head is NOT where the user is — inserting
  // there silently drops a marker into the body. Reject it, mirroring
  // canInsertNoteAtCursor() for the host-editor path. An explicit `at` targets
  // a caller-chosen body position, so its semantics are preserved untouched.
  if (input.at === undefined) {
    const activeStoryLocator = (
      editor as unknown as { presentationEditor?: { getActiveStoryLocator?: () => unknown } }
    ).presentationEditor?.getActiveStoryLocator?.();
    if (activeStoryLocator != null) {
      return footnoteFailure(
        'INVALID_TARGET',
        'footnotes.insert: cannot insert at the cursor while a header, footer, footnote, or endnote is being edited. Exit the active story or pass an explicit "at" target.',
      );
    }
  }

  const converter = getConverter(editor);
  const notesConfig = getNotesConfig(input.type);
  const noteId = allocateNextNoteId(editor, converter, input.type);
  const address: FootnoteAddress = { kind: 'entity', entityType: 'footnote', noteId };

  if (input.body !== undefined) {
    return footnoteFailure(
      'CAPABILITY_UNAVAILABLE',
      'footnotes.insert structured body content is not supported by the v1 editor runtime.',
    );
  }

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

  // SD-3400: omitting `at` inserts at the current selection head — the natural
  // target for toolbar actions ("place a marker at the current cursor location").
  const resolved = input.at
    ? resolveInlineInsertPosition(editor, input.at, 'footnotes.insert')
    : { from: editor.state.selection.head, to: editor.state.selection.head };

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

      // Session-managed: if undo later removes this marker, export prunes
      // the now-unreferenced element (SD-3400 tombstone symmetry).
      markSessionManagedNoteId(editor, input.type, noteId);
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

  if (input.patch.body !== undefined) {
    return footnoteFailure(
      'CAPABILITY_UNAVAILABLE',
      'footnotes.update structured body content is not supported by the v1 editor runtime.',
    );
  }

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
 * Tombstone semantics (SD-3400): only the PM reference node is deleted; the
 * `w:footnote` element stays in the part so undo restores the note text.
 * Export prunes session-managed ids with no surviving reference.
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

  const removed = removeNoteReferenceAt(editor, {
    pos: resolved.pos,
    noteId: resolved.noteId,
    type: resolved.type,
  });

  if (!removed) {
    return footnoteFailure('NO_OP', 'Remove operation produced no change.');
  }

  return footnoteSuccess(address);
}

/**
 * Remove the single note reference at an exact document position, tombstoning
 * the note: only the PM marker delete happens (history-recorded), while the
 * `w:footnote`/`w:endnote` element stays in the part so undo restores the
 * note text. The id is registered as session-managed; export prunes
 * registered ids with no surviving reference (SD-3400 undo fidelity).
 *
 * Position-addressed (not id-addressed) so callers that already hold the node
 * — the staged Backspace/Delete on a selected marker (SD-3400) — remove
 * exactly that reference even when the same id appears multiple times.
 * {@link footnotesRemoveWrapper} delegates here after resolving its target.
 */
export function removeNoteReferenceAt(
  editor: Editor,
  ref: { pos: number; noteId: string; type: 'footnote' | 'endnote' },
): boolean {
  const notesConfig = getNotesConfig(ref.type);

  const { success } = compoundMutation({
    editor,
    source: `footnotes.remove:${ref.type}`,
    affectedParts: [notesConfig.partId],
    execute: () => {
      // Delete the reference node from the PM document. The body doc is the
      // source of truth for note liveness: band painting, numbering, and the
      // read API all resolve from live markers, so no part write is needed.
      const { tr } = editor.state;
      const node = tr.doc.nodeAt(ref.pos);
      if (!node) return false;

      tr.delete(ref.pos, ref.pos + node.nodeSize);
      editor.dispatch(tr);

      markSessionManagedNoteId(editor, ref.type, ref.noteId);
      clearIndexCache(editor);
      return true;
    },
  });

  // The dropped part mutation used to seal the undo group as a side effect;
  // preserve that grouping so the marker delete never merges with later edits.
  if (success) closeUndoGroup(editor);

  return success;
}

/**
 * SD-3400: remove a note and EVERY body reference to it ("remove on both
 * sides"). Used by the note-area emptied-note commit, where the whole footnote
 * ceases to exist — including multi-reference notes, whose surviving markers
 * would otherwise keep the old (un-emptied) content. The `w:footnote` element
 * is tombstoned (kept in the part) so a single undo restores the whole note;
 * export prunes it while no reference exists.
 *
 * Type-aware: footnote and endnote ids are independent OOXML namespaces, so
 * resolution filters by note type — emptying endnote "2" must never touch
 * footnote "2". The address-based {@link footnotesRemoveWrapper} keeps its
 * single-reference semantics for the document API.
 */
export function removeNoteEverywhere(
  editor: Editor,
  input: { noteId: string; type: 'footnote' | 'endnote' },
): FootnoteMutationResult {
  const refs = findAllFootnotes(editor.state.doc, input.type).filter((f) => f.noteId === input.noteId);
  if (refs.length === 0) {
    return footnoteFailure('NO_OP', `No ${input.type} reference with id "${input.noteId}" found.`);
  }

  const notesConfig = getNotesConfig(input.type);
  const address: FootnoteAddress = { kind: 'entity', entityType: 'footnote', noteId: input.noteId };

  const { success } = compoundMutation({
    editor,
    source: `footnotes.removeEverywhere:${input.type}`,
    affectedParts: [notesConfig.partId],
    execute: () => {
      const { tr } = editor.state;
      // Descending positions keep earlier offsets valid as later refs go.
      [...refs]
        .sort((a, b) => b.pos - a.pos)
        .forEach((ref) => {
          const node = tr.doc.nodeAt(ref.pos);
          if (node) tr.delete(ref.pos, ref.pos + node.nodeSize);
        });
      // Park the caret where the FIRST marker stood (SD-3400 note-area
      // boundary): the emptied-note exit refocuses the body, and without
      // parking the stale pre-session selection silently eats body text on
      // continued Backspace. In-transaction selection is mutation semantics
      // (PM's own delete commands do the same), so every caller gets Word
      // body-side caret placement for free.
      try {
        tr.setSelection(Selection.near(tr.doc.resolve(Math.min(refs[0].pos, tr.doc.content.size)), 1));
      } catch {
        // Position resolution can fail on exotic docs; parking is best-effort.
      }
      editor.dispatch(tr);

      // Tombstone: the note element stays in the part so undo restores the
      // whole note; export prunes registered ids with no surviving reference.
      markSessionManagedNoteId(editor, input.type, input.noteId);
      clearIndexCache(editor);
      return true;
    },
  });

  if (!success) {
    return footnoteFailure('NO_OP', 'Remove operation produced no change.');
  }

  // Preserve the undo-group seal the dropped part mutation used to provide.
  closeUndoGroup(editor);

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
