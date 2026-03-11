/**
 * Compound mutation: parts + ProseMirror dispatch as one atomic unit.
 *
 * Snapshots converter state before running the execute callback. If execute
 * returns false or throws, all state is restored to the pre-mutation snapshot.
 *
 * Use this whenever a `mutatePart` call is followed by a PM dispatch to
 * guarantee that parts and document state stay in sync.
 */

import type { Editor } from '../../Editor.js';
import type { PartId } from '../types.js';
import { getRevision, restoreRevision } from '../../../document-api-adapters/plan-engine/revision-tracker.js';
import { getPart, hasPart, setPart, removePart, clonePart } from '../store/part-store.js';

// ---------------------------------------------------------------------------
// Converter shape (minimal interface)
// ---------------------------------------------------------------------------

interface ConverterForSnapshot {
  convertedXml?: Record<string, unknown>;
  numbering?: unknown;
  translatedNumbering?: unknown;
  footnotes?: unknown;
  endnotes?: unknown;
  footnoteProperties?: unknown;
  documentModified?: boolean;
  documentGuid?: string | null;
}

function getConverter(editor: Editor): ConverterForSnapshot | undefined {
  return (editor as unknown as { converter?: ConverterForSnapshot }).converter;
}

// ---------------------------------------------------------------------------
// Snapshot / Restore
// ---------------------------------------------------------------------------

interface CompoundSnapshot {
  partEntries: Map<string, { existed: boolean; data: unknown }>;
  numbering: unknown;
  translatedNumbering: unknown;
  footnotes: unknown;
  endnotes: unknown;
  footnoteProperties: unknown;
  revision: string;
  documentModified: boolean;
  documentGuid: string | null;
}

/**
 * Capture pre-mutation state for the specified parts plus converter metadata.
 *
 * Always snapshots `converter.numbering`, `converter.translatedNumbering`,
 * revision, `documentModified`, and `documentGuid` — these are cheap to clone
 * and critical for correctness. `affectedParts` controls which `convertedXml`
 * entries are additionally snapshotted.
 */
function takeSnapshot(editor: Editor, partIds: Set<string>): CompoundSnapshot {
  const converter = getConverter(editor);

  const partEntries = new Map<string, { existed: boolean; data: unknown }>();
  if (converter?.convertedXml) {
    for (const partId of partIds) {
      const id = partId as PartId;
      const existed = hasPart(editor, id);
      partEntries.set(partId, {
        existed,
        data: existed ? clonePart(getPart(editor, id)) : undefined,
      });
    }
  }

  return {
    partEntries,
    numbering: converter?.numbering ? clonePart(converter.numbering) : undefined,
    translatedNumbering: converter?.translatedNumbering ? clonePart(converter.translatedNumbering) : undefined,
    footnotes: converter?.footnotes ? clonePart(converter.footnotes) : undefined,
    endnotes: converter?.endnotes ? clonePart(converter.endnotes) : undefined,
    footnoteProperties: converter?.footnoteProperties ? clonePart(converter.footnoteProperties) : undefined,
    revision: getRevision(editor),
    documentModified: converter?.documentModified ?? false,
    documentGuid: converter?.documentGuid ?? null,
  };
}

/**
 * Restore converter and part store to a previously captured snapshot.
 */
function restoreFromSnapshot(editor: Editor, snapshot: CompoundSnapshot): void {
  const converter = getConverter(editor);
  if (!converter) return;

  if (converter.convertedXml) {
    for (const [partId, entry] of snapshot.partEntries) {
      const id = partId as PartId;
      if (entry.existed) {
        setPart(editor, id, entry.data);
      } else {
        removePart(editor, id);
      }
    }
  }

  if (snapshot.numbering !== undefined) converter.numbering = snapshot.numbering;
  if (snapshot.translatedNumbering !== undefined) converter.translatedNumbering = snapshot.translatedNumbering;
  if (snapshot.footnotes !== undefined) converter.footnotes = snapshot.footnotes;
  if (snapshot.endnotes !== undefined) converter.endnotes = snapshot.endnotes;
  if (snapshot.footnoteProperties !== undefined) converter.footnoteProperties = snapshot.footnoteProperties;
  converter.documentModified = snapshot.documentModified;
  converter.documentGuid = snapshot.documentGuid;
  restoreRevision(editor, snapshot.revision);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CompoundMutationRequest {
  editor: Editor;
  source: string;
  /**
   * Part IDs that may be mutated during `execute()`. These `convertedXml`
   * entries are snapshotted before execute runs and restored on failure.
   *
   * Converter-level metadata (numbering, translatedNumbering, revision,
   * documentModified, documentGuid) is always snapshotted regardless of
   * this list.
   */
  affectedParts?: string[];
  /**
   * Execute parts mutations and PM dispatch. Return `true` on success.
   * If this returns `false` or throws, all state is rolled back.
   */
  execute: () => boolean;
}

export interface CompoundMutationResult {
  success: boolean;
}

// ---------------------------------------------------------------------------
// Compound depth tracking for publisher buffering
// ---------------------------------------------------------------------------

interface EditorWithCompoundState {
  _compoundDepth?: number;
  _partPublisher?: { flush(): void; drop(): void };
}

function getCompoundState(editor: Editor): EditorWithCompoundState {
  return editor as unknown as EditorWithCompoundState;
}

/**
 * Execute parts mutations and a PM dispatch as one atomic unit.
 *
 * 1. Increment compound depth (publisher buffers instead of publishing)
 * 2. Snapshot affected parts + converter metadata
 * 3. Run `execute()` (which calls mutatePart + PM dispatch internally)
 * 4. On failure (returns false or throws): restore snapshot, drop buffer
 * 5. On success at depth 0: flush buffered events to Yjs
 */
export function compoundMutation(request: CompoundMutationRequest): CompoundMutationResult {
  const { editor, execute, affectedParts = [] } = request;
  const state = getCompoundState(editor);

  // Track nesting depth for publisher buffering
  state._compoundDepth = (state._compoundDepth ?? 0) + 1;

  const snapshot = takeSnapshot(editor, new Set(affectedParts));

  let success: boolean;
  try {
    success = execute();
  } catch (err) {
    state._compoundDepth = (state._compoundDepth ?? 1) - 1;
    restoreFromSnapshot(editor, snapshot);
    if (state._compoundDepth === 0) state._partPublisher?.drop();
    throw err;
  }

  state._compoundDepth = (state._compoundDepth ?? 1) - 1;

  if (!success) {
    restoreFromSnapshot(editor, snapshot);
    if (state._compoundDepth === 0) state._partPublisher?.drop();
  } else if (state._compoundDepth === 0) {
    state._partPublisher?.flush();
  }

  return { success };
}
