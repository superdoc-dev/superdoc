/**
 * Deterministic collaboration detection for out-of-band mutation gating.
 *
 * Both the capability checker and execution-time gates call this single
 * helper to determine whether collaboration is active. This prevents drift
 * between the two call sites.
 *
 * Decision rule: returns `true` if a Yjs provider **exists and has ever
 * synced**. Once collaboration has been established, stylesheet mutations
 * are blocked even during transient disconnects.
 *
 * | Provider state                         | Result  | Rationale                                |
 * |----------------------------------------|---------|------------------------------------------|
 * | No provider registered                 | `false` | No collaboration possible.               |
 * | Provider registered, pre-initial-sync  | `false` | No peers have synced yet.                |
 * | Provider connected and synced          | `true`  | Peers are active.                        |
 * | Provider disconnected (temporary)      | `true`  | Provider will reconnect; would diverge.  |
 * | Provider destroyed/removed             | `false` | Collaboration fully torn down.           |
 */

import type { Editor } from '../core/Editor.js';

/** Minimal shape of a Yjs collaboration provider as seen on editor.options. */
interface CollaborationProvider {
  synced?: boolean;
  isSynced?: boolean;
  destroy?: () => void;
}

/**
 * Tracks providers that have ever reached a synced state.
 *
 * Once a provider syncs, it stays "has ever synced" even if `synced` flips
 * back to `false` during a transient disconnect. This prevents a race where
 * a temporary network blip re-opens the mutation gate.
 */
const everSyncedProviders = new WeakSet<object>();

/** Returns `true` if the provider is currently reporting a synced state. */
function isProviderCurrentlySynced(provider: CollaborationProvider): boolean {
  return provider.synced === true || provider.isSynced === true;
}

/**
 * Returns `true` when collaboration is active and out-of-band mutations
 * should be blocked.
 */
export function isCollaborationActive(editor: Editor): boolean {
  const provider = (editor.options as { collaborationProvider?: CollaborationProvider | null }).collaborationProvider;

  if (!provider) return false;

  // Latch: once synced, always considered active for this provider instance.
  if (isProviderCurrentlySynced(provider)) {
    everSyncedProviders.add(provider);
    return true;
  }

  return everSyncedProviders.has(provider);
}
