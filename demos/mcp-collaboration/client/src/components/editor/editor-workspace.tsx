import { useEffect, useMemo, useState } from 'react';
import { SuperDocEditor, type SuperDocModules } from '@superdoc-dev/react';
import { Doc as YDoc } from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Loader2 } from 'lucide-react';
import {
  onCollaborationProviderSynced,
  type CollaborationSyncProvider,
} from '../../lib/provider-sync';

interface EditorWorkspaceProps {
  roomId: string;
  displayName: string;
}

const COLLAB_URL = import.meta.env.VITE_COLLAB_WS_URL ?? 'ws://127.0.0.1:8081';

// ─── Module-level cache ──────────────────────────────────────────────────────
// Survives Vite HMR so document state isn't lost when editing frontend code.

interface CachedRoom {
  roomId: string;
  ydoc: YDoc;
  provider: WebsocketProvider;
}

interface EditorWorkspaceHotData {
  cachedRoom?: CachedRoom | null;
}

const hotData = import.meta.hot?.data as EditorWorkspaceHotData | undefined;
let cached: CachedRoom | null = hotData?.cachedRoom ?? null;

function destroyCachedRoom() {
  if (!cached) return;
  cached.provider.disconnect();
  cached.provider.destroy();
  cached.ydoc.destroy();
  cached = null;
}

function getOrCreateRoom(roomId: string): CachedRoom {
  if (cached && cached.roomId === roomId) return cached;

  // Different room — tear down the old one
  destroyCachedRoom();

  const ydoc = new YDoc();
  const provider = new WebsocketProvider(COLLAB_URL, roomId, ydoc);
  cached = { roomId, ydoc, provider };
  return cached;
}

// Clean up on full page unload, while preserving the room across HMR.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', destroyCachedRoom);
  import.meta.hot?.dispose((data: EditorWorkspaceHotData) => {
    data.cachedRoom = cached;
    window.removeEventListener('beforeunload', destroyCachedRoom);
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EditorWorkspace({ roomId, displayName }: EditorWorkspaceProps) {
  const [synced, setSynced] = useState(false);

  const room = useMemo(() => getOrCreateRoom(roomId), [roomId]);

  useEffect(() => {
    setSynced(false);
    return onCollaborationProviderSynced(
      room.provider as unknown as CollaborationSyncProvider,
      () => setSynced(true),
    );
  }, [room]);

  const modules = useMemo<SuperDocModules>(
    () => ({
      collaboration: {
        ydoc: room.ydoc,
        provider: room.provider,
      },
    }),
    [room],
  );

  const user = useMemo(
    () => ({
      name: displayName,
      email: `${displayName.toLowerCase().replace(/\s+/g, '-')}@example.com`,
    }),
    [displayName],
  );

  if (!synced) {
    return (
      <div className='flex h-full items-center justify-center'>
        <Loader2 className='h-5 w-5 animate-spin text-muted-foreground' />
        <span className='ml-2 text-sm text-muted-foreground'>Syncing document...</span>
      </div>
    );
  }

  return (
    <SuperDocEditor
      documentMode='editing'
      modules={modules}
      user={user}
      rulers
      style={{ width: '100%', height: '100%' }}
    />
  );
}
