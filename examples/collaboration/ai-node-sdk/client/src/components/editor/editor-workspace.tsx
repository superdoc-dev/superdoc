import { useEffect, useMemo, useState } from 'react';
import { SuperDocEditor } from '@superdoc-dev/react';
import { Doc as YDoc } from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Loader2 } from 'lucide-react';

interface EditorWorkspaceProps {
  roomId: string;
  displayName: string;
}

const COLLAB_URL = import.meta.env.VITE_COLLAB_WS_URL ?? 'ws://localhost:8081';

// ─── Module-level cache ──────────────────────────────────────────────────────
// Survives Vite HMR so document state isn't lost when editing frontend code.

interface CachedRoom {
  roomId: string;
  ydoc: YDoc;
  provider: WebsocketProvider;
}

let cached: CachedRoom | null = null;

function getOrCreateRoom(roomId: string): CachedRoom {
  if (cached && cached.roomId === roomId) return cached;

  // Different room — tear down the old one
  if (cached) {
    cached.provider.disconnect();
    cached.provider.destroy();
    cached.ydoc.destroy();
  }

  const ydoc = new YDoc();
  const provider = new WebsocketProvider(COLLAB_URL, roomId, ydoc);
  cached = { roomId, ydoc, provider };
  return cached;
}

// Clean up on full page unload (not HMR)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (cached) {
      cached.provider.disconnect();
      cached.provider.destroy();
      cached.ydoc.destroy();
      cached = null;
    }
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EditorWorkspace({ roomId, displayName }: EditorWorkspaceProps) {
  const [synced, setSynced] = useState(false);

  const room = useMemo(() => getOrCreateRoom(roomId), [roomId]);

  useEffect(() => {
    // Already synced from a previous mount (HMR)
    if (room.provider.synced) {
      setSynced(true);
      return;
    }

    const onSync = (isSynced: boolean) => {
      if (isSynced) setSynced(true);
    };

    room.provider.on('sync', onSync);
    return () => { room.provider.off('sync', onSync); };
  }, [room]);

  const modules = useMemo(() => ({
    collaboration: {
      ydoc: room.ydoc,
      provider: room.provider,
    },
  }), [room]);

  const user = useMemo(() => ({
    name: displayName,
    email: `${displayName.toLowerCase().replace(/\s+/g, '-')}@example.com`,
  }), [displayName]);

  if (!synced) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Syncing document...</span>
      </div>
    );
  }

  return (
    <SuperDocEditor
      documentMode="editing"
      modules={modules as any}
      user={user}
      rulers
      style={{ width: '100%', height: '100%' }}
    />
  );
}
