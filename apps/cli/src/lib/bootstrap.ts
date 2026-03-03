import { Doc as YDoc, type YMapEvent } from 'yjs';
import type { OnMissing } from './collaboration';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default time (ms) to wait for competing bootstrap claims to propagate
 * through the Yjs provider. 1500ms covers most real-world deployments
 * including cross-region sync (~200-400ms RTT with margin).
 */
export const DEFAULT_BOOTSTRAP_SETTLING_MS = 1500;

/**
 * Default upper bound (ms) for the random jitter applied before writing a
 * bootstrap claim. Jitter desynchronizes concurrent clients so one claim
 * has time to propagate before the other is written.
 */
export const DEFAULT_BOOTSTRAP_JITTER_MS = 150;

/**
 * Time (ms) to observe the meta map after seeding for evidence that another
 * client also seeded (competing finalized markers).
 */
const POST_SEED_OBSERVE_MS = 200;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RoomState = 'populated' | 'empty';

export type BootstrapDecision =
  | { action: 'seed'; source: 'doc' | 'blank' }
  | { action: 'join' }
  | { action: 'error'; reason: string };

export type BootstrapMarker = {
  version: 1;
  clientId: number;
  seededAt: string;
  source: string;
};

/**
 * Debug snapshot captured when a competing bootstrap marker is observed.
 * Surfaced in CLI output so operators can diagnose race conditions.
 */
export type ObservedCompetitor = {
  observedOtherClientId: number;
  observedSource: string;
  observedAt: string;
};

/**
 * Result of a bootstrap claim attempt.
 *
 * `granted` — this client won the claim.
 * `denied`  — another client's marker was observed; includes debug details.
 */
export type ClaimResult = { granted: true } | { granted: false; competitor: ObservedCompetitor };

/**
 * Result of post-seed race detection. When `raceSuspected` is true, a
 * competing finalized marker was observed shortly after seeding, which
 * strongly suggests (but cannot prove) that two clients both seeded.
 *
 * This is best-effort detection — absence of a competitor does not guarantee
 * exactly-once seeding. Network latency can hide competing markers beyond
 * the observation window.
 */
export type RaceDetectionResult = { raceSuspected: false } | { raceSuspected: true; competitor: ObservedCompetitor };

// ---------------------------------------------------------------------------
// Room state detection
// ---------------------------------------------------------------------------

export function detectRoomState(ydoc: YDoc): RoomState {
  const fragment = ydoc.getXmlFragment('supereditor');
  if (fragment.length > 0) return 'populated';

  const metaMap = ydoc.getMap('meta');
  // A pending-only bootstrap marker does NOT count as populated — the
  // claimer may have crashed before seeding actual content.  Only
  // finalized markers (source !== 'pending') or other meta keys count.
  for (const [key, value] of metaMap.entries()) {
    if (key === 'bootstrap') {
      const marker = value as Record<string, unknown> | undefined;
      if (marker && marker.source !== 'pending') return 'populated';
      continue;
    }
    return 'populated';
  }

  return 'empty';
}

// ---------------------------------------------------------------------------
// Bootstrap decision
// ---------------------------------------------------------------------------

export function resolveBootstrapDecision(
  roomState: RoomState,
  onMissing: OnMissing,
  hasDoc: boolean,
): BootstrapDecision {
  if (roomState === 'populated') return { action: 'join' };

  switch (onMissing) {
    case 'seedFromDoc':
      return { action: 'seed', source: hasDoc ? 'doc' : 'blank' };
    case 'blank':
      return { action: 'seed', source: 'blank' };
    case 'error':
      return { action: 'error', reason: 'Collaboration room is empty and onMissing is set to "error".' };
  }
}

// ---------------------------------------------------------------------------
// Bootstrap marker
// ---------------------------------------------------------------------------

export function writeBootstrapMarker(ydoc: YDoc, source: string): void {
  const metaMap = ydoc.getMap('meta');
  const marker: BootstrapMarker = {
    version: 1,
    clientId: ydoc.clientID,
    seededAt: new Date().toISOString(),
    source,
  };
  metaMap.set('bootstrap', marker);
}

// ---------------------------------------------------------------------------
// Helpers shared by claim + race detection
// ---------------------------------------------------------------------------

function readBootstrapMarker(ydoc: YDoc): BootstrapMarker | undefined {
  return ydoc.getMap('meta').get('bootstrap') as BootstrapMarker | undefined;
}

function snapshotCompetitor(marker: BootstrapMarker): ObservedCompetitor {
  return {
    observedOtherClientId: marker.clientId,
    observedSource: marker.source,
    observedAt: new Date().toISOString(),
  };
}

/**
 * Observe the meta map's `bootstrap` key for changes by another client.
 * Returns a disposable that captures the first competing marker seen.
 *
 * Filters on the `bootstrap` key only (ignores unrelated meta writes).
 */
function observeCompetitor(ydoc: YDoc): {
  getCompetitor(): ObservedCompetitor | null;
  dispose(): void;
} {
  const myClientId = ydoc.clientID;
  const metaMap = ydoc.getMap('meta');
  let competitor: ObservedCompetitor | null = null;

  const handler = (event: YMapEvent<unknown>) => {
    if (!event.keysChanged.has('bootstrap')) return;
    const marker = metaMap.get('bootstrap') as BootstrapMarker | undefined;
    if (marker && marker.clientId !== myClientId && !competitor) {
      competitor = snapshotCompetitor(marker);
    }
  };
  metaMap.observe(handler);

  return {
    getCompetitor: () => competitor,
    dispose: () => metaMap.unobserve(handler),
  };
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Bootstrap claim
// ---------------------------------------------------------------------------

/**
 * Attempt to claim bootstrap ownership for this client.
 *
 * Writes a pending marker, applies random jitter + settling delay, then
 * checks whether this client still owns the marker. An `observe` handler
 * reactively detects competing markers that arrive at any point — not just
 * at the end of the settling window.
 *
 * **Guarantee level: best-effort.** If network propagation takes longer
 * than `jitterMs + settlingMs`, two clients can both believe they won.
 * Use `detectBootstrapRace()` after seeding to surface suspected races.
 *
 * @param ydoc - The Yjs document shared across the collaboration room.
 * @param settlingMs - Time to wait for competing claims to propagate.
 * @param jitterMs - Upper bound for random delay before writing the claim.
 *                   Desynchronizes concurrent clients. Pass 0 to disable.
 * @returns Claim result with debug info when denied.
 */
export async function claimBootstrap(
  ydoc: YDoc,
  settlingMs: number,
  jitterMs: number = DEFAULT_BOOTSTRAP_JITTER_MS,
): Promise<ClaimResult> {
  // Random jitter reduces perfect-collision starts between concurrent clients.
  await sleep(Math.floor(Math.random() * jitterMs));

  const metaMap = ydoc.getMap('meta');
  metaMap.set('bootstrap', {
    version: 1,
    clientId: ydoc.clientID,
    seededAt: new Date().toISOString(),
    source: 'pending',
  });

  const observer = observeCompetitor(ydoc);
  try {
    await sleep(settlingMs);

    const competitor = observer.getCompetitor();
    if (competitor) return { granted: false, competitor };

    const marker = readBootstrapMarker(ydoc);
    if (marker?.clientId === ydoc.clientID) {
      return { granted: true };
    }

    // Marker was overwritten or unexpectedly removed — claim denied.
    return {
      granted: false,
      competitor: marker
        ? snapshotCompetitor(marker)
        : { observedOtherClientId: 0, observedSource: 'unknown', observedAt: new Date().toISOString() },
    };
  } finally {
    observer.dispose();
  }
}

// ---------------------------------------------------------------------------
// Post-seed race detection
// ---------------------------------------------------------------------------

/**
 * Observe the bootstrap marker briefly after seeding to detect whether
 * another client also finalized a seed (suggesting a dual-seed race).
 *
 * **Guarantee level: best-effort.** A `raceSuspected: false` result does
 * NOT guarantee exactly-once seeding — competing markers may arrive after
 * the observation window closes.
 *
 * @param ydoc - The Yjs document shared across the collaboration room.
 * @param observeMs - How long to watch for competing finalized markers.
 * @returns Race detection result with debug info when suspected.
 */
export async function detectBootstrapRace(
  ydoc: YDoc,
  observeMs: number = POST_SEED_OBSERVE_MS,
): Promise<RaceDetectionResult> {
  const observer = observeCompetitor(ydoc);
  try {
    await sleep(observeMs);

    const competitor = observer.getCompetitor();
    if (competitor) return { raceSuspected: true, competitor };
    return { raceSuspected: false };
  } finally {
    observer.dispose();
  }
}
