import { createClient, type BaseUserMeta, type JsonObject, type Room } from '@liveblocks/client';
import { LiveblocksYjsProvider } from '@liveblocks/yjs';
import WS from 'ws';
import { Doc as YDoc } from 'yjs';
import { CliError, type CliErrorCode } from '../errors';
import { isRecord } from '../guards';
import { DEFAULT_SYNC_TIMEOUT_MS } from './runtime';
import type { CollaborationRuntime, LiveblocksCollaborationProfile } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTH_FETCH_CEILING_MS = 15_000;

// ---------------------------------------------------------------------------
// Node polyfill helper
// ---------------------------------------------------------------------------

function buildNodePolyfills(): { WebSocket: unknown; fetch: typeof fetch; atob: typeof atob } {
  return {
    WebSocket: WS as unknown,
    fetch: globalThis.fetch,
    atob:
      typeof globalThis.atob === 'function'
        ? globalThis.atob
        : (data: string) => Buffer.from(data, 'base64').toString('binary'),
  };
}

// ---------------------------------------------------------------------------
// Auth headers resolution
// ---------------------------------------------------------------------------

function resolveAuthHeaders(profile: LiveblocksCollaborationProfile): Record<string, string> {
  if (!profile.authHeadersEnv) return {};

  const envValue = process.env[profile.authHeadersEnv];
  if (!envValue) {
    throw new CliError('MISSING_REQUIRED', `Missing auth headers env var: ${profile.authHeadersEnv}`, {
      authHeadersEnv: profile.authHeadersEnv,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(envValue);
  } catch {
    throw new CliError('VALIDATION_ERROR', `Env var ${profile.authHeadersEnv} must contain valid JSON.`, {
      authHeadersEnv: profile.authHeadersEnv,
    });
  }

  if (!isRecord(parsed)) {
    throw new CliError('VALIDATION_ERROR', `Env var ${profile.authHeadersEnv} must contain a JSON object.`, {
      authHeadersEnv: profile.authHeadersEnv,
    });
  }

  for (const [key, val] of Object.entries(parsed)) {
    if (typeof val !== 'string') {
      throw new CliError(
        'VALIDATION_ERROR',
        `Env var ${profile.authHeadersEnv}: header "${key}" must be a string value.`,
        { authHeadersEnv: profile.authHeadersEnv, key },
      );
    }
  }

  return parsed as Record<string, string>;
}

// ---------------------------------------------------------------------------
// Auth endpoint callback builder
// ---------------------------------------------------------------------------

function buildAuthEndpointCallback(
  profile: LiveblocksCollaborationProfile,
  syncTimeoutMs: number,
): (room: string) => Promise<{ token: string }> {
  const endpoint = profile.authEndpoint!;
  const customHeaders = resolveAuthHeaders(profile);
  const fetchTimeoutMs = Math.min(syncTimeoutMs, AUTH_FETCH_CEILING_MS);

  return async (room: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);

    try {
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...customHeaders },
          body: JSON.stringify({ room }),
          signal: controller.signal,
        });
      } catch (fetchError) {
        const isAbort = fetchError instanceof Error && fetchError.name === 'AbortError';
        throw new CliError(
          'COLLABORATION_AUTH_FAILED',
          isAbort
            ? `Auth endpoint timed out after ${fetchTimeoutMs}ms: ${endpoint}`
            : `Auth endpoint fetch failed: ${endpoint}`,
          { endpoint, providerType: 'liveblocks', authMode: 'authEndpoint' },
        );
      }

      if (!response.ok) {
        throw new CliError('COLLABORATION_AUTH_FAILED', `Auth endpoint returned ${response.status}: ${endpoint}`, {
          endpoint,
          status: response.status,
          providerType: 'liveblocks',
          authMode: 'authEndpoint',
        });
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new CliError('COLLABORATION_AUTH_FAILED', `Auth endpoint returned non-JSON response: ${endpoint}`, {
          endpoint,
          providerType: 'liveblocks',
          authMode: 'authEndpoint',
        });
      }

      // Validate response contains a token before passing to Liveblocks.
      // Without this check, a malformed response (e.g. `{}`) would silently
      // fall through and produce a non-deterministic downstream error.
      if (!isRecord(body) || typeof body.token !== 'string') {
        throw new CliError(
          'COLLABORATION_AUTH_FAILED',
          `Auth endpoint returned a response without a valid "token" field: ${endpoint}`,
          { endpoint, providerType: 'liveblocks', authMode: 'authEndpoint' },
        );
      }

      // Return full parsed body — Liveblocks client may use additional fields
      return body as { token: string };
    } finally {
      clearTimeout(timer);
    }
  };
}

// ---------------------------------------------------------------------------
// Liveblocks WebSocket close code classification
// ---------------------------------------------------------------------------
//
// Liveblocks WebsocketCloseCodes range semantics (from @liveblocks/core):
//   40xx → terminal disconnect (no retry)
//   41xx → token expired, reauthorize
//   4999 → explicit close-without-retry
//
// In the CLI there is no interactive re-auth flow, so 41xx codes are also
// terminal. We classify each well-known code into the most specific CLI error
// code so that callers get actionable remediation guidance.

type RoomErrorClassification = {
  errorCode: CliErrorCode;
  label: string;
};

const LIVEBLOCKS_CLOSE_CODE_MAP: Record<number, RoomErrorClassification> = {
  // 40xx — terminal disconnect
  4000: { errorCode: 'COLLABORATION_CONNECTION_FAILED', label: 'invalid message format' },
  4001: { errorCode: 'COLLABORATION_AUTH_FAILED', label: 'not allowed (forbidden)' },
  4003: { errorCode: 'COLLABORATION_CAPACITY_EXCEEDED', label: 'max concurrent connections (account)' },
  4005: { errorCode: 'COLLABORATION_CAPACITY_EXCEEDED', label: 'max concurrent connections (room)' },
  4006: { errorCode: 'COLLABORATION_CONNECTION_FAILED', label: 'room ID was updated' },

  // 41xx — reauthorize (terminal in CLI context)
  4100: { errorCode: 'COLLABORATION_AUTH_FAILED', label: 'kicked from room' },
  4109: { errorCode: 'COLLABORATION_AUTH_FAILED', label: 'token expired' },

  // Explicit no-retry sentinel
  4999: { errorCode: 'COLLABORATION_CONNECTION_FAILED', label: 'server closed without retry' },
};

export function classifyLiveblocksCloseCode(code: number): RoomErrorClassification | null {
  const known = LIVEBLOCKS_CLOSE_CODE_MAP[code];
  if (known) return known;

  // Catch-all for any 40xx code not individually mapped — Liveblocks treats
  // the entire 4000-4099 range as "disconnect, do not retry".
  if (code >= 4000 && code < 4100) {
    return { errorCode: 'COLLABORATION_CONNECTION_FAILED', label: 'terminal room error' };
  }

  // -1 is a connection-level failure surfaced by the Liveblocks client.
  if (code === -1) {
    return { errorCode: 'COLLABORATION_CONNECTION_FAILED', label: 'connection failed' };
  }

  // Anything else (1xxx transient, unknown) — not terminal, let timeout handle it.
  return null;
}

// ---------------------------------------------------------------------------
// Custom waitForSync for Liveblocks
// ---------------------------------------------------------------------------

function waitForLiveblocksSync(provider: LiveblocksYjsProvider, room: Room, timeoutMs: number): Promise<void> {
  if (provider.synced) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup: Array<() => void> = [];

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      for (const run of cleanup) run();
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    // Listen for provider sync
    const onSync = (synced: boolean) => {
      if (synced) finish();
    };
    provider.on('sync', onSync);
    cleanup.push(() => provider.off('sync', onSync));

    // Listen for room errors — classify and fail fast on terminal codes.
    // Prefer the typed source-of-truth field (`error.context.code`) here.
    const unsubError = room.subscribe('error', (error) => {
      const code = error.context?.code;
      if (typeof code !== 'number') return;

      const classification = classifyLiveblocksCloseCode(code);
      if (!classification) return; // Transient — let timeout handle it

      finish(
        new CliError(
          classification.errorCode,
          `Liveblocks room error (${code}, ${classification.label}): ${error.message}`,
          { providerType: 'liveblocks', errorCode: code },
        ),
      );
    });
    cleanup.push(() => unsubError());

    // Sync timeout as fallback for transient errors
    const timer = setTimeout(() => {
      finish(
        new CliError('COLLABORATION_SYNC_TIMEOUT', `Collaboration sync timed out after ${timeoutMs}ms.`, {
          timeoutMs,
          providerType: 'liveblocks',
        }),
      );
    }, timeoutMs);
    cleanup.push(() => clearTimeout(timer));
  });
}

// ---------------------------------------------------------------------------
// Liveblocks runtime factory
// ---------------------------------------------------------------------------

export function createLiveblocksRuntime(profile: LiveblocksCollaborationProfile): CollaborationRuntime {
  const syncTimeoutMs = profile.syncTimeoutMs ?? DEFAULT_SYNC_TIMEOUT_MS;

  // Build client options
  const clientOptions: Record<string, unknown> = {
    polyfills: buildNodePolyfills(),
  };

  if (profile.publicApiKey) {
    clientOptions.publicApiKey = profile.publicApiKey;
  } else if (profile.authEndpoint) {
    clientOptions.authEndpoint = buildAuthEndpointCallback(profile, syncTimeoutMs);
  }

  const client = createClient(clientOptions as Parameters<typeof createClient>[0]);
  const { room, leave } = client.enterRoom<JsonObject, never, BaseUserMeta, never>(profile.documentId);
  const ydoc = new YDoc({ gc: false });
  const provider = new LiveblocksYjsProvider(room, ydoc);

  return {
    ydoc,
    provider,
    waitForSync: () => waitForLiveblocksSync(provider, room, syncTimeoutMs),
    dispose() {
      // Order matters: unsubscribe → provider.destroy → leave → ydoc.destroy
      provider.destroy();
      leave();
      ydoc.destroy();
    },
  };
}
