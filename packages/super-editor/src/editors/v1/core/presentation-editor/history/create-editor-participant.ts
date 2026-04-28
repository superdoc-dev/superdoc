/**
 * Helpers for building `HistoryParticipant` instances from concrete editors.
 *
 * Keep this file small and declarative — every surface that joins unified
 * history should enter through one of these factories so the key/surface/
 * adapter trio stays consistent across the codebase.
 */

import type { Editor } from '../../Editor.js';
import { BODY_STORY_KEY } from '../../../document-api-adapters/story-runtime/story-key.js';
import { EditorHistorySnapshotAdapter } from './editor-history-snapshot-adapter.js';
import type { HistoryParticipant, DocumentHistorySurface } from './types.js';

const HEADER_FOOTER_KEY_PREFIX = 'hf:part:';

/** Stable participant key for the main document editor. */
export const BODY_PARTICIPANT_KEY = BODY_STORY_KEY;

/** Stable participant key for a header/footer editor identified by its DOCX refId. */
export const buildHeaderFooterParticipantKey = (refId: string): string => `${HEADER_FOOTER_KEY_PREFIX}${refId}`;

export const createBodyParticipant = (editor: Editor): HistoryParticipant => ({
  key: BODY_PARTICIPANT_KEY,
  surface: 'body',
  adapter: new EditorHistorySnapshotAdapter(editor),
});

export const createHeaderFooterParticipant = (
  editor: Editor,
  descriptor: { id: string; kind: 'header' | 'footer' },
): HistoryParticipant => ({
  key: buildHeaderFooterParticipantKey(descriptor.id),
  surface: descriptor.kind,
  adapter: new EditorHistorySnapshotAdapter(editor),
});

/**
 * Build a note/endnote participant.
 *
 * Unlike body/header/footer, the note participant owns two extra hooks:
 *
 *   - `flushAfterReplay` runs the runtime's commit callback against the host
 *     editor so coordinator-driven undo/redo writes the new PM state back to
 *     the canonical OOXML part and the document renders the change.
 *   - `onInvalidated` lets the registry tear down the dormant editor when
 *     its reachable history is purged.
 */
export const createNoteParticipant = (input: {
  storyKey: string;
  storyType: 'footnote' | 'endnote';
  editor: Editor;
  flushAfterReplay?: (action: 'undo' | 'redo') => void;
  onInvalidated?: () => void;
}): HistoryParticipant => {
  const surface: DocumentHistorySurface = input.storyType === 'footnote' ? 'note' : 'endnote';
  return {
    key: input.storyKey,
    surface,
    adapter: new EditorHistorySnapshotAdapter(input.editor),
    flushAfterReplay: input.flushAfterReplay,
    onInvalidated: input.onInvalidated,
  };
};
