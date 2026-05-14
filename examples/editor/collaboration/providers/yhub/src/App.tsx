import { useEffect, useRef, useState } from 'react';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import 'superdoc/style.css';
import { SuperDoc } from 'superdoc';

const WS_URL = (import.meta.env.VITE_YHUB_URL as string) || 'ws://127.0.0.1:8081/v1/collaboration';
const DOCUMENT_ID = (import.meta.env.VITE_DOCUMENT_ID as string) || 'superdoc-dev-room';
const AUTH_TOKEN = (import.meta.env.VITE_AUTH_TOKEN as string) || 'YOUR_PRIVATE_TOKEN';
const USER_ID = (import.meta.env.VITE_USER_ID as string) || `user-${Math.floor(Math.random() * 1000)}`;

export default function App() {
  const superdocRef = useRef<any>(null);
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(WS_URL, DOCUMENT_ID, ydoc, {
      params: { token: AUTH_TOKEN, userId: USER_ID },
    });

    const onSync = (isSynced: boolean) => {
      if (!isSynced || superdocRef.current) return;
      superdocRef.current = new SuperDoc({
        selector: '#superdoc',
        documentMode: 'editing',
        user: { name: USER_ID, email: `${USER_ID}@example.com` },
        modules: {
          collaboration: { ydoc, provider },
        },
        onAwarenessUpdate: ({ states }: any) => setUsers(states),
      });
    };

    provider.on('sync', onSync);

    return () => {
      provider.off('sync', onSync);
      superdocRef.current?.destroy();
      provider.destroy();
    };
  }, []);

  return (
    <div className="app">
      <header>
        <h1>SuperDoc + YHub</h1>
        <div className="users">
          {users.map((u, i) => (
            <span key={u.clientId ?? i} className="user" style={{ background: u.color || '#666' }}>
              {u.name}
            </span>
          ))}
        </div>
      </header>
      <main>
        <div id="superdoc" className="superdoc-container" />
      </main>
    </div>
  );
}
