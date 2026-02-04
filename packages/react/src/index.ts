/**
 * @superdoc-dev/react - Official React wrapper for SuperDoc
 * @packageDocumentation
 * @version 1.0.0
 */

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

  // Callback event types
  SuperDocReadyEvent,
  SuperDocEditorCreateEvent,
  SuperDocEditorUpdateEvent,
  SuperDocContentErrorEvent,
  SuperDocExceptionEvent,
} from './types';
