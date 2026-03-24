import type { Doc as YDoc } from 'yjs';

// ---------------------------------------------------------------------------
// Shared fields
// ---------------------------------------------------------------------------

export type CollaborationProviderType = 'hocuspocus' | 'y-websocket' | 'liveblocks';
export type WebSocketProviderType = 'hocuspocus' | 'y-websocket';
export type OnMissing = 'seedFromDoc' | 'blank' | 'error';

type SharedCollaborationFields = {
  syncTimeoutMs?: number;
  onMissing?: OnMissing;
  bootstrapSettlingMs?: number;
};

// ---------------------------------------------------------------------------
// Public input shapes (what SDK users send)
// ---------------------------------------------------------------------------

export type WebSocketCollaborationInput = SharedCollaborationFields & {
  providerType: WebSocketProviderType;
  url: string;
  documentId?: string;
  tokenEnv?: string;
};

export type LiveblocksCollaborationInput = SharedCollaborationFields & {
  providerType: 'liveblocks';
  roomId: string;
  publicApiKey?: string;
  authEndpoint?: string;
  authHeadersEnv?: string;
};

export type CollaborationInput = WebSocketCollaborationInput | LiveblocksCollaborationInput;

// ---------------------------------------------------------------------------
// Internal normalized profiles (documentId always present)
// ---------------------------------------------------------------------------

export type WebSocketCollaborationProfile = SharedCollaborationFields & {
  providerType: WebSocketProviderType;
  url: string;
  documentId: string;
  tokenEnv?: string;
};

export type LiveblocksCollaborationProfile = SharedCollaborationFields & {
  providerType: 'liveblocks';
  documentId: string;
  publicApiKey?: string;
  authEndpoint?: string;
  authHeadersEnv?: string;
};

export type CollaborationProfile = WebSocketCollaborationProfile | LiveblocksCollaborationProfile;

// ---------------------------------------------------------------------------
// Public output summary (safe for CLI/SDK output — no auth config)
// ---------------------------------------------------------------------------

export type CollaborationSummary = {
  providerType: CollaborationProviderType;
  documentId: string;
  url?: string;
};

// ---------------------------------------------------------------------------
// Runtime interface
// ---------------------------------------------------------------------------

export type CollaborationRuntime = {
  ydoc: YDoc;
  provider: unknown;
  waitForSync(): Promise<void>;
  dispose(): void;
};

// ---------------------------------------------------------------------------
// Internal provider interface (websocket providers only)
// ---------------------------------------------------------------------------

export type SyncableProvider = {
  on?(event: string, handler: (...args: unknown[]) => void): void;
  off?(event: string, handler: (...args: unknown[]) => void): void;
  disconnect?(): void;
  destroy?(): void;
  synced?: boolean;
  isSynced?: boolean;
};

// ---------------------------------------------------------------------------
// Shared validation constants
// ---------------------------------------------------------------------------

export const ENV_VAR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
