import { useEffect, useRef, useState } from 'react';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const WS_URL = (import.meta.env.VITE_HOCUSPOCUS_URL as string) || 'ws://localhost:1234';
const ROOM_ID = (import.meta.env.VITE_ROOM_ID as string) || 'superdoc-hocuspocus-example';

function hasSuperDocContent(ydoc: Y.Doc) {
  return (
    ydoc.getXmlFragment('supereditor').length > 0 ||
    ydoc.getMap('parts').size > 0 ||
    ydoc.getMap('meta').has('docx')
  );
}

export default function App() {
  const superdocRef = useRef<SuperDoc | null>(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [isReady, setIsReady] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const ydoc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: WS_URL,
      name: ROOM_ID,
      document: ydoc,
    });

    const handleStatus = ({ status }: { status: string }) => {
      setConnectionStatus(status);
    };

    const handleSynced = () => {
      if (superdocRef.current) return;

      // Client-side empty check keeps the example small. In production,
      // gate DOCX seeding once per room from your backend (room metadata
      // or a lock) so concurrent first clients cannot both seed.
      const shouldSeedFromDocx = !hasSuperDocContent(ydoc);

      superdocRef.current = new SuperDoc({
        selector: '#superdoc',
        documentMode: 'editing',
        ...(shouldSeedFromDocx
          ? {
              document: {
                id: ROOM_ID,
                type: 'docx',
                url: '/seed.docx',
                name: 'seed.docx',
                isNewFile: true,
              },
            }
          : {}),
        user: {
          name: `User ${Math.floor(Math.random() * 1000)}`,
          email: 'user@example.com',
        },
        modules: {
          collaboration: { ydoc, provider },
        },
        onReady: () => setIsReady(true),
      });
    };

    provider.on('status', handleStatus);
    provider.on('synced', handleSynced);

    return () => {
      provider.off('status', handleStatus);
      provider.off('synced', handleSynced);
      superdocRef.current?.destroy();
      superdocRef.current = null;
      provider.destroy();
      ydoc.destroy();
    };
  }, []);

  const exportDocx = async () => {
    if (!superdocRef.current) return;

    setIsExporting(true);

    try {
      const blob = await superdocRef.current.export({
        triggerDownload: false,
        isFinalDoc: true,
      });

      if (!(blob instanceof Blob)) return;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${ROOM_ID}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="app">
      <header className="toolbar">
        <div>
          <h1>SuperDoc + Hocuspocus</h1>
          <p>
            {ROOM_ID} - {connectionStatus} - {isReady ? 'ready' : 'syncing'}
          </p>
        </div>

        <button type="button" onClick={exportDocx} disabled={!isReady || isExporting}>
          {isExporting ? 'Exporting...' : 'Export DOCX'}
        </button>
      </header>

      <main>
        <div id="superdoc" className="superdoc-container" />
      </main>
    </div>
  );
}
