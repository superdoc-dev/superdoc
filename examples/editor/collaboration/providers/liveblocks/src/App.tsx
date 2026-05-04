import { createClient } from '@liveblocks/client';
import { LiveblocksYjsProvider } from '@liveblocks/yjs';
import { CSSProperties, useEffect, useRef, useState } from 'react';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import * as Y from 'yjs';

const PUBLIC_KEY = import.meta.env.VITE_LIVEBLOCKS_PUBLIC_KEY as string;
const ROOM_ID = (import.meta.env.VITE_ROOM_ID as string) || 'superdoc-room';

// ---------------------------------------------------------------------------
// Hook: useSuperdocCollaboration
// ---------------------------------------------------------------------------

interface CollaborationState {
  users: any[];
  synced: boolean;
}

function useSuperdocCollaboration(userName: string): CollaborationState {
  const superdocRef = useRef<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!PUBLIC_KEY) return;

    const client = createClient({ publicApiKey: PUBLIC_KEY });
    const { room, leave } = client.enterRoom(ROOM_ID);
    const ydoc = new Y.Doc();
    const provider = new LiveblocksYjsProvider(room, ydoc);

    provider.on('sync', (isSynced: boolean) => {
      if (!isSynced) return;
      // Guard: only create SuperDoc once. Liveblocks fires 'sync' again on
      // reconnect, which would create duplicate editors writing to the same
      // Y.js doc — corrupting the room state (code 1011).
      if (superdocRef.current) return;
      setSynced(true);

      superdocRef.current = new SuperDoc({
        selector: '#superdoc',
        documentMode: 'editing',
        user: { name: userName, email: `${userName.toLowerCase().replace(' ', '-')}@example.com` },
        modules: {
          collaboration: { ydoc, provider },
        },
        onAwarenessUpdate: ({ states }: any) => setUsers(states),
        onEditorCreate: ({ editor }: any) => {
          if (import.meta.env.DEV) {
            (window as any).editor = editor;
          }
        },
      });
    });

    return () => {
      superdocRef.current?.destroy();
      superdocRef.current = null;
      setSynced(false);
      provider.destroy();
      leave();
    };
  }, [userName]);

  return { users, synced };
}

// ---------------------------------------------------------------------------
// Component: App
// ---------------------------------------------------------------------------

const connectingStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 200,
  color: '#888',
};

const missingKeyStyle: CSSProperties = { padding: '2rem' };

export default function App() {
  const [userName] = useState(() => `User ${Math.floor(Math.random() * 1000)}`);
  const { users, synced } = useSuperdocCollaboration(userName);

  if (!PUBLIC_KEY) {
    return <div style={missingKeyStyle}>Add VITE_LIVEBLOCKS_PUBLIC_KEY to .env</div>;
  }

  return (
    <div className='app'>
      <header>
        <h1>SuperDoc + Liveblocks</h1>
        <div className='users'>
          {users.map((u) => (
            <span key={u.clientId} className='user' style={{ background: u.color || '#666' }}>
              {u.name || u.email}
            </span>
          ))}
        </div>
      </header>
      <main>
        {!synced && <div style={connectingStyle}>Connecting…</div>}
        <div id='superdoc' className='superdoc-container' />
      </main>
    </div>
  );
}
