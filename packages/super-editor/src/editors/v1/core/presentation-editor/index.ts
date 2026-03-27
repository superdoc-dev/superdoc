/**
 * PresentationEditor module
 *
 * This module contains the PresentationEditor class and all its related
 * helper modules for layout-based document rendering.
 */

// Main class
export { PresentationEditor } from './PresentationEditor.js';

// Selection bridge types
export type { SelectionCommandContext } from './PresentationEditor.js';

// Public types
export type {
  PageSize,
  PageMargins,
  VirtualizationOptions,
  RemoteUserInfo,
  RemoteCursorState,
  PresenceOptions,
  FlowMode,
  LayoutEngineOptions,
  TrackedChangesOverrides,
  PresentationEditorOptions,
  RemoteCursorsRenderPayload,
  LayoutUpdatePayload,
  ImageSelectedEvent,
  ImageDeselectedEvent,
  TelemetryEvent,
} from './types.js';

// Proofing types (public contract)
export type {
  ProofingProvider,
  ProofingCapabilities,
  ProofingCheckRequest,
  ProofingCheckResult,
  ProofingSegment,
  ProofingSegmentMetadata,
  ProofingIssue,
  ProofingIssueKind,
  ProofingConfig,
  ProofingStatus,
  ProofingError,
} from './proofing/types.js';
