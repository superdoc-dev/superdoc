type ProviderEventHandler = (synced?: unknown) => void;

export interface CollaborationSyncProvider {
  synced?: boolean;
  isSynced?: boolean;
  on(event: 'sync' | 'synced', handler: ProviderEventHandler): void;
  off(event: 'sync' | 'synced', handler: ProviderEventHandler): void;
}

function isProviderSynced(provider: CollaborationSyncProvider): boolean {
  return provider.synced === true || provider.isSynced === true;
}

export function onCollaborationProviderSynced(
  provider: CollaborationSyncProvider,
  onSynced: () => void,
): () => void {
  if (isProviderSynced(provider)) {
    onSynced();
    return () => {};
  }

  let settled = false;

  const cleanup = () => {
    if (settled) return;
    settled = true;
    provider.off('sync', handleSync);
    provider.off('synced', handleSynced);
  };
  const finish = () => {
    if (settled) return;
    cleanup();
    onSynced();
  };
  const handleSync: ProviderEventHandler = (synced) => {
    if (synced === true || (synced !== false && isProviderSynced(provider))) finish();
  };
  const handleSynced: ProviderEventHandler = () => finish();

  provider.on('sync', handleSync);
  provider.on('synced', handleSynced);

  // Close the race where the provider syncs between the initial check and wiring.
  if (isProviderSynced(provider)) finish();

  return cleanup;
}
