// Main component
export { SuperDocEditor, default } from './SuperDocEditor';

// Types - extracted from superdoc package for convenience
export type {
  // Component props and ref
  SuperDocEditorProps,
  SuperDocRef,

  // Core types (extracted from superdoc constructor)
  DocumentMode,
  UserRole,
  SuperDocUser,
  SuperDocModules,
  SuperDocConfig,
  SuperDocInstance,

  // Callback props
  CallbackProps,

  // Callback event types
  Editor,
  SuperDocReadyEvent,
  SuperDocEditorCreateEvent,
  SuperDocEditorUpdateEvent,
  SuperDocContentErrorEvent,
  SuperDocExceptionEvent,
} from './types';
