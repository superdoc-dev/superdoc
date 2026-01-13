// Document types
export * from './document-types';

// Key transformation utilities and types
export * from './key-transform';

// Event types
export * from './event-types';

// Comment types
export type {
  Comment,
  CommentContent,
  CommentJSON,
  CommentThreadingProfile,
  CommentThreadingStyle,
} from './comments-types';

// List numbering helpers
export * from './list-numbering';

// File helpers
export * from './helpers/get-file-object';
export * from './helpers/compare-superdoc-versions';

// Vue directives
export { default as vClickOutside } from './helpers/v-click-outside';

// Note: Vue components like BasicUpload must be imported directly from the components path:
// import BasicUpload from '@superdoc/common/components/BasicUpload.vue'
// This is because .vue files cannot be re-exported from compiled TypeScript in dist/

// Telemetry
export { Telemetry, TelemetryEventNames, customTelemetryEvent } from './Telemetry';
export type {
  // Configuration
  TelemetryConfig,
  // Data structures
  Statistics,
  FileStructure,
  FileInfo,
  DocumentInfo,
  TelemetryError,
  UnknownElement,
  BrowserInfo,
  // Event types
  TelemetryEventName,
  KnownTelemetryEvent,
  CustomTelemetryEvent,
  StatisticCategory,
  BaseTelemetryEvent,
  TelemetryUsageEvent,
  TelemetryParsingReport,
  TelemetryPayload,
  // Data interface
  StatisticData,
} from './Telemetry';

// Collaboration/Awareness
export * from './collaboration/awareness';
