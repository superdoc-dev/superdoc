// Collaboration module — re-exports for backward-compatible imports.
//
// All existing `import { ... } from '../lib/collaboration'` paths continue
// to work through this barrel.

export { ENV_VAR_NAME_PATTERN } from './types';

export type {
  CollaborationInput,
  CollaborationProfile,
  CollaborationProviderType,
  CollaborationRuntime,
  CollaborationSummary,
  LiveblocksCollaborationInput,
  LiveblocksCollaborationProfile,
  OnMissing,
  SyncableProvider,
  WebSocketCollaborationInput,
  WebSocketCollaborationProfile,
  WebSocketProviderType,
} from './types';

export {
  buildShorthandCollaborationInput,
  DEFAULT_SHORTHAND_COLLABORATION_PROVIDER_TYPE,
  parseCollaborationInput,
} from './parse';

export { resolveCollaborationProfile, resolveCollaborationToken, toPublicCollaborationSummary } from './resolve';

export { createCollaborationRuntime } from './runtime';
