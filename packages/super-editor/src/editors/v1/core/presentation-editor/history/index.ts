export { DocumentHistoryCoordinator } from './DocumentHistoryCoordinator.js';
export type { DocumentHistoryCoordinatorOptions } from './DocumentHistoryCoordinator.js';
export { EditorHistorySnapshotAdapter } from './editor-history-snapshot-adapter.js';
export { readEditorHistorySnapshot } from './editor-history-snapshot-adapter.js';
export { BatchHistoryAdapter } from './batch-history-adapter.js';
export type { BatchHistoryRecord } from './batch-history-adapter.js';
export {
  BODY_PARTICIPANT_KEY,
  buildHeaderFooterParticipantKey,
  createBodyParticipant,
  createHeaderFooterParticipant,
  createNoteParticipant,
} from './create-editor-participant.js';
export { NoteEditorRegistry } from './NoteEditorRegistry.js';
export type { NoteCommitHook, NoteEditorRegistryOptions } from './NoteEditorRegistry.js';
export type {
  DocumentHistoryState,
  DocumentHistorySurface,
  GlobalHistoryEntry,
  HistoryParticipant,
  HistorySnapshotAdapter,
  ParticipantHistorySnapshot,
  PurgeReason,
  UnifiedHistoryCueEvent,
} from './types.js';
