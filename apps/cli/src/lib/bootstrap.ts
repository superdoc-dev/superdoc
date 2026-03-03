import { Doc as YDoc } from 'yjs';
import type { OnMissing } from './collaboration';

export const DEFAULT_BOOTSTRAP_SETTLING_MS = 300;

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

export async function claimBootstrap(ydoc: YDoc, settlingMs: number): Promise<boolean> {
  const metaMap = ydoc.getMap('meta');
  metaMap.set('bootstrap', {
    version: 1,
    clientId: ydoc.clientID,
    seededAt: new Date().toISOString(),
    source: 'pending',
  });

  if (settlingMs > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, settlingMs));
  }

  const marker = metaMap.get('bootstrap') as BootstrapMarker | undefined;
  return marker?.clientId === ydoc.clientID;
}
