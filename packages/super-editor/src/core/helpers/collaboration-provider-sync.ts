import type { CollaborationProvider } from '../types/EditorConfig.js';

type ProviderEventHandler = (...args: unknown[]) => void;

function markProviderSynced(provider: CollaborationProvider): void {
  try {
    provider.synced = true;
  } catch {
    // Some providers expose readonly getters.
  }
  try {
    provider.isSynced = true;
  } catch {
    // Some providers expose readonly getters.
  }
}

/**
 * Returns true when the provider reports a synced state.
 * Some providers use `synced`, others use `isSynced`.
 */
export function isCollaborationProviderSynced(provider: CollaborationProvider | null | undefined): boolean {
  return Boolean(provider && (provider.synced === true || provider.isSynced === true));
}

/**
 * Run `onSynced` once the provider is synced.
 *
 * Supports providers that emit:
 * - `synced` (no args)
 * - `sync` (boolean arg, e.g. Liveblocks emits `false` then `true`)
 *
 * Returns a cleanup function that removes listeners when called before sync.
 */
export function onCollaborationProviderSynced(
  provider: CollaborationProvider | null | undefined,
  onSynced: () => void,
): () => void {
  if (!provider) return () => {};

  if (isCollaborationProviderSynced(provider)) {
    onSynced();
    return () => {};
  }

  const on = typeof provider.on === 'function' ? provider.on.bind(provider) : null;
  const off = typeof provider.off === 'function' ? provider.off.bind(provider) : null;

  // If the provider has no event API, we cannot wait for a sync signal.
  // Proceed optimistically to avoid deadlocking flows like replaceFile().
  if (!on) {
    onSynced();
    return () => {};
  }

  let settled = false;

  const cleanup = () => {
    if (settled) return;
    settled = true;
    off?.('synced', handleSynced as ProviderEventHandler);
    off?.('sync', handleSync as ProviderEventHandler);
  };

  const finish = () => {
    if (settled) return;
    cleanup();
    onSynced();
  };

  const handleSynced = () => {
    markProviderSynced(provider);
    finish();
  };

  const handleSync = (synced?: unknown) => {
    // Some providers emit sync(false) before sync(true).
    if (synced === false) return;
    if (synced === true || isCollaborationProviderSynced(provider)) {
      markProviderSynced(provider);
      finish();
    }
  };

  on('synced', handleSynced as ProviderEventHandler);
  on('sync', handleSync as ProviderEventHandler);

  // Guard against races where sync completed between initial check and listener wiring.
  if (isCollaborationProviderSynced(provider)) {
    finish();
  }

  return cleanup;
}
