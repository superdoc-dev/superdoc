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

// ---------------------------------------------------------------------------
// Websocket sync helper
// ---------------------------------------------------------------------------

function isSynced(provider: SyncableProvider): boolean {
  return provider.synced === true || provider.isSynced === true;
}

export function waitForProviderSync(provider: SyncableProvider, timeoutMs: number): Promise<void> {
  if (isSynced(provider)) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup: Array<() => void> = [];

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

    if (provider.on) {
      provider.on('synced', onSync);
      cleanup.push(() => provider.off?.('synced', onSync));

      provider.on('sync', onSync);
      cleanup.push(() => provider.off?.('sync', onSync));
    }

    const timer = setTimeout(() => {
      finish(
        new CliError('COLLABORATION_SYNC_TIMEOUT', `Collaboration sync timed out after ${timeoutMs}ms.`, {
          timeoutMs,
        }),
      );
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
    const providerOptions: { params?: Record<string, string> } = {};
    if (token) {
      providerOptions.params = { token };
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
