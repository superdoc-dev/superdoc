import { createClient, type BaseUserMeta, type JsonObject, type Room } from '@liveblocks/client';
import { LiveblocksYjsProvider } from '@liveblocks/yjs';
import WS from 'ws';
import { Doc as YDoc } from 'yjs';
import { CliError } from '../errors';
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

    // Listen for room errors (terminal auth/permission failures)
    const unsubError = room.subscribe('error', (error) => {
      const code = error.code;
      // Liveblocks error codes 4001, 4003, 4005 indicate auth/permission failures
      if (code === 4001 || code === 4003 || code === 4005) {
        finish(
          new CliError('COLLABORATION_AUTH_FAILED', `Liveblocks room error (${code}): ${error.message}`, {
            providerType: 'liveblocks',
            errorCode: code,
          }),
        );
      } else if (code === 4004) {
        // Room not found / permanently deleted
        finish(
          new CliError('COLLABORATION_CONNECTION_FAILED', `Liveblocks room error (${code}): ${error.message}`, {
            providerType: 'liveblocks',
            errorCode: code,
          }),
        );
      }
      // Other codes are transient — let timeout catch them
    });
    cleanup.push(() => unsubError());

    // Sync timeout as fallback
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
