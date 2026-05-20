/**
 * SD-3233 reproduction harness.
 *
 * Mirrors what `openCollaborativeDocument` does for the collab path:
 * builds a CollaborationProfile, calls createCollaborationRuntime, waits
 * for sync. If the WSS broker is unreachable, this should hang for 10s
 * then emit COLLABORATION_SYNC_TIMEOUT — matching the customer's report.
 *
 * Wires up extra observers (status, connection-error, connection-close)
 * to show what y-websocket is actually doing during the hang, which the
 * CLI silently swallows today.
 *
 * Usage:
 *   bun apps/cli/scripts/repro-sd-3233.ts <url> [documentId]
 *
 * Examples:
 *   bun apps/cli/scripts/repro-sd-3233.ts ws://localhost:1234 superdoc-room    # local — should sync fast
 *   bun apps/cli/scripts/repro-sd-3233.ts wss://nonexistent.invalid/ed test-room  # unreachable wss — should timeout
 *   bun apps/cli/scripts/repro-sd-3233.ts wss://echo.websocket.events test-room   # reachable wss but not a yjs server
 */
import { createCollaborationRuntime } from '../src/lib/collaboration/runtime';
import type { CollaborationProfile } from '../src/lib/collaboration/types';

const url = process.argv[2];
const documentId = process.argv[3] ?? 'sd-3233-repro';

if (!url) {
  console.error('usage: bun apps/cli/scripts/repro-sd-3233.ts <url> [documentId]');
  process.exit(2);
}

const profile: CollaborationProfile = {
  providerType: url.startsWith('wss://') || url.startsWith('ws://') ? 'y-websocket' : 'hocuspocus',
  url,
  documentId,
  syncTimeoutMs: 10_000,
};

console.log(`Connecting: providerType=${profile.providerType} url=${url} documentId=${documentId}`);
const startedAt = Date.now();
const runtime = createCollaborationRuntime(profile);

// Tap raw provider events that the CLI ignores today. These are the missing
// diagnostic surface — uncovering them is the "holistic" half of SD-3233.
const provider = runtime.provider as unknown as {
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
};
if (typeof provider.on === 'function') {
  provider.on('status', (payload: unknown) => {
    const status = (payload as { status?: string })?.status ?? payload;
    console.log(`  [+${Date.now() - startedAt}ms] status: ${JSON.stringify(status)}`);
  });
  provider.on('connection-error', (...args: unknown[]) => {
    console.log(`  [+${Date.now() - startedAt}ms] connection-error:`, args[0]?.constructor?.name ?? args[0]);
  });
  provider.on('connection-close', (...args: unknown[]) => {
    const event = args[0] as { code?: number; reason?: string } | undefined;
    console.log(`  [+${Date.now() - startedAt}ms] connection-close: code=${event?.code} reason="${event?.reason}"`);
  });
  provider.on('synced', () => {
    console.log(`  [+${Date.now() - startedAt}ms] synced`);
  });
}

try {
  await runtime.waitForSync();
  console.log(`\n✓ Sync succeeded after ${Date.now() - startedAt}ms`);
} catch (err) {
  console.log(`\n✗ Sync failed after ${Date.now() - startedAt}ms: ${(err as Error).message}`);
  console.log(`  code: ${(err as { code?: string }).code}`);
} finally {
  runtime.dispose();
}

process.exit(0);
