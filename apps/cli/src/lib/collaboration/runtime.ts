import { HocuspocusProvider } from '@hocuspocus/provider';
import { WebsocketProvider } from 'y-websocket';
import { Doc as YDoc } from 'yjs';
import { CliError } from '../errors';
import { createLiveblocksRuntime } from './liveblocks';
import { resolveCollaborationToken } from './resolve';
import type {
  CollaborationProfile,
  CollaborationRuntime,
  SyncableProvider,
  WebSocketCollaborationProfile,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_SYNC_TIMEOUT_MS = 10_000;
const SYNC_POLL_INTERVAL_MS = 25;
/**
 * SD-3233: cap the number of recent connection-close events surfaced on
 * COLLABORATION_SYNC_TIMEOUT. Five is enough to convey the failure
 * pattern (typical y-websocket exponential backoff lands ~7 failures
 * inside the 10s default window) without unbounded memory growth.
 */
const MAX_CAPTURED_FAILURES = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape of a single failed WebSocket connect attempt, captured during
 * `waitForProviderSync` and surfaced on the timeout error's `details`
 * to give callers actionable diagnostics. See SD-3233.
 */
export type ProviderConnectionFailure = {
  /** Milliseconds elapsed since the sync wait started. */
  at: number;
  /** WebSocket close code (1006 for abnormal closure, 1015 TLS handshake, 4xxx custom). */
  code?: number;
  /** Human-readable close reason from the provider (e.g. "Failed to connect"). */
  reason?: string;
};

// ---------------------------------------------------------------------------
// Websocket sync helper
// ---------------------------------------------------------------------------

function isSynced(provider: SyncableProvider): boolean {
  return provider.synced === true || provider.isSynced === true;
}

/**
 * Best-effort extraction of `code` and `reason` from a y-websocket /
 * Hocuspocus `connection-close` event payload. The runtime types are
 * loose (browser CloseEvent or close-event-shaped object), so we accept
 * `unknown` and narrow defensively.
 */
function toFailureRecord(event: unknown, startedAt: number): ProviderConnectionFailure {
  const record: ProviderConnectionFailure = { at: Date.now() - startedAt };
  if (event && typeof event === 'object') {
    const e = event as { code?: unknown; reason?: unknown };
    if (typeof e.code === 'number') record.code = e.code;
    if (typeof e.reason === 'string' && e.reason.length > 0) record.reason = e.reason;
  }
  return record;
}

export function waitForProviderSync(provider: SyncableProvider, timeoutMs: number): Promise<void> {
  if (isSynced(provider)) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup: Array<() => void> = [];
    const failures: ProviderConnectionFailure[] = [];
    const startedAt = Date.now();

    const finish = (error?: CliError) => {
      if (settled) return;
      settled = true;
      for (const run of cleanup) {
        run();
      }
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    const onSync = (value?: unknown) => {
      if (value === false) return;
      finish();
    };

    // SD-3233: capture failed connect attempts so a 10s timeout surfaces
    // the actual close reason (DNS, TLS, refused, auth, etc.) instead of
    // a generic timeout. y-websocket pairs every connect failure with a
    // `connection-close` event carrying the structured code/reason; the
    // sibling `connection-error` is intentionally NOT subscribed because
    // it adds no information beyond the close event.
    const onConnectionClose = (event: unknown) => {
      failures.push(toFailureRecord(event, startedAt));
      if (failures.length > MAX_CAPTURED_FAILURES) {
        failures.splice(0, failures.length - MAX_CAPTURED_FAILURES);
      }
    };

    if (provider.on) {
      provider.on('synced', onSync);
      cleanup.push(() => provider.off?.('synced', onSync));

      provider.on('sync', onSync);
      cleanup.push(() => provider.off?.('sync', onSync));

      provider.on('connection-close', onConnectionClose);
      cleanup.push(() => provider.off?.('connection-close', onConnectionClose));
    }

    const timer = setTimeout(() => {
      const details: Record<string, unknown> = { timeoutMs };
      if (failures.length > 0) {
        details.attempts = failures.length;
        details.lastErrors = failures;
      }
      finish(new CliError('COLLABORATION_SYNC_TIMEOUT', `Collaboration sync timed out after ${timeoutMs}ms.`, details));
    }, timeoutMs);
    cleanup.push(() => clearTimeout(timer));

    const poll = setInterval(() => {
      if (isSynced(provider)) {
        finish();
      }
    }, SYNC_POLL_INTERVAL_MS);
    cleanup.push(() => clearInterval(poll));
  });
}

// ---------------------------------------------------------------------------
// Websocket runtime factories
// ---------------------------------------------------------------------------

function createWebSocketRuntime(profile: WebSocketCollaborationProfile): CollaborationRuntime {
  const token = resolveCollaborationToken(profile);
  const ydoc = new YDoc({ gc: false });
  const syncTimeoutMs = profile.syncTimeoutMs ?? DEFAULT_SYNC_TIMEOUT_MS;

  let provider: SyncableProvider;
  if (profile.providerType === 'y-websocket') {
    const params: Record<string, string> = { ...(profile.params ?? {}) };
    if (token) {
      params.token = token;
    }
    const providerOptions: { params?: Record<string, string> } = {};
    if (Object.keys(params).length > 0) {
      providerOptions.params = params;
    }
    provider = new WebsocketProvider(
      profile.url,
      profile.documentId,
      ydoc,
      providerOptions,
    ) as unknown as SyncableProvider;
  } else {
    provider = new HocuspocusProvider({
      url: profile.url,
      document: ydoc,
      name: profile.documentId,
      token: token ?? '',
      parameters: profile.params,
      preserveConnection: false,
    }) as unknown as SyncableProvider;
  }

  return {
    ydoc,
    provider,
    waitForSync: () => waitForProviderSync(provider, syncTimeoutMs),
    dispose() {
      provider.disconnect?.();
      provider.destroy?.();
      ydoc.destroy();
    },
  };
}

// ---------------------------------------------------------------------------
// Provider registry (simple map dispatch)
// ---------------------------------------------------------------------------

export function createCollaborationRuntime(profile: CollaborationProfile): CollaborationRuntime {
  if (profile.providerType === 'liveblocks') {
    return createLiveblocksRuntime(profile);
  }
  return createWebSocketRuntime(profile);
}
