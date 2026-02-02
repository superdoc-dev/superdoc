// Main component
export { SuperDocEditor, default } from './SuperDocEditor';

// Types
export type {
  // Component props and ref
  SuperDocEditorProps,
  SuperDocRef,

  // Common types
  DocumentMode,
  UserRole,
  SuperDocUser,
  SuperDocModules,
  SuperDocConfig,
  SuperDocInstance,
  EditorInstance,

  // Options
  ExportOptions,
  TrackedChangesPreferences,
  LayoutEngineOptions,
  ViewOptions,

  // Search
  SearchResult,

  // Event payloads
  ReadyEvent,
  EditorCreateEvent,
  EditorUpdateEvent,
  ContentErrorEvent,
  ExceptionEvent,
} from './types';

// Utilities
export { useStableId } from './utils';
