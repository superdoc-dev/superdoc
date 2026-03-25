import { CliError } from '../errors';
import type {
  CollaborationInput,
  CollaborationProfile,
  CollaborationSummary,
  LiveblocksCollaborationInput,
  LiveblocksCollaborationProfile,
  WebSocketCollaborationInput,
  WebSocketCollaborationProfile,
} from './types';

// ---------------------------------------------------------------------------
// Profile resolution (input → normalized profile)
// ---------------------------------------------------------------------------

function resolveWebSocketProfile(input: WebSocketCollaborationInput, sessionId: string): WebSocketCollaborationProfile {
  return {
    providerType: input.providerType,
    url: input.url,
    documentId: input.documentId?.trim() || sessionId,
    tokenEnv: input.tokenEnv,
    syncTimeoutMs: input.syncTimeoutMs,
    onMissing: input.onMissing,
    bootstrapSettlingMs: input.bootstrapSettlingMs,
  };
}

function resolveLiveblocksProfile(input: LiveblocksCollaborationInput): LiveblocksCollaborationProfile {
  return {
    providerType: 'liveblocks',
    documentId: input.roomId,
    publicApiKey: input.publicApiKey,
    authEndpoint: input.authEndpoint,
    authHeadersEnv: input.authHeadersEnv,
    syncTimeoutMs: input.syncTimeoutMs,
    onMissing: input.onMissing,
    bootstrapSettlingMs: input.bootstrapSettlingMs,
  };
}

export function resolveCollaborationProfile(input: CollaborationInput, sessionId: string): CollaborationProfile {
  if (input.providerType === 'liveblocks') {
    return resolveLiveblocksProfile(input);
  }
  return resolveWebSocketProfile(input, sessionId);
}

// ---------------------------------------------------------------------------
// Token resolution (websocket providers only)
// ---------------------------------------------------------------------------

export function resolveCollaborationToken(profile: CollaborationProfile): string | undefined {
  if (profile.providerType === 'liveblocks') return undefined;
  if (!profile.tokenEnv) return undefined;

  const token = process.env[profile.tokenEnv];
  if (!token) {
    throw new CliError('MISSING_REQUIRED', `Missing collaboration token env var: ${profile.tokenEnv}`, {
      tokenEnv: profile.tokenEnv,
    });
  }
  return token;
}

// ---------------------------------------------------------------------------
// Public output summary (strips auth config)
// ---------------------------------------------------------------------------

export function toPublicCollaborationSummary(profile: CollaborationProfile): CollaborationSummary {
  const summary: CollaborationSummary = {
    providerType: profile.providerType,
    documentId: profile.documentId,
  };

  if (profile.providerType !== 'liveblocks') {
    summary.url = profile.url;
  }

  return summary;
}
