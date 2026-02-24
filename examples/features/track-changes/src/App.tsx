import { useEffect, useRef, useState } from 'react';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

type DocumentMode = 'editing' | 'suggesting' | 'viewing';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<DocumentMode>('suggesting');
  const containerRef = useRef<HTMLDivElement>(null);
  const commentsRef = useRef<HTMLDivElement>(null);
  const superdocRef = useRef<any>(null);

  useEffect(() => {
    if (!file || !containerRef.current) return;

    superdocRef.current?.destroy();
    superdocRef.current = new SuperDoc({
      selector: containerRef.current,
      document: file,
      documentMode: mode,
      user: { name: 'Jane Doe', email: 'jane@example.com' },
      modules: {
        comments: {
          selector: commentsRef.current!,
          allowResolving: true,
        },
      },
    });

    return () => {
      superdocRef.current?.destroy();
      superdocRef.current = null;
    };
  }, [file]);

  const changeMode = (newMode: DocumentMode) => {
    setMode(newMode);
    superdocRef.current?.setDocumentMode(newMode);
  };

  const acceptAll = () => superdocRef.current?.activeEditor?.commands.acceptAllTrackedChanges();
  const rejectAll = () => superdocRef.current?.activeEditor?.commands.rejectAllTrackedChanges();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ padding: '0.75rem 1rem', background: '#f5f5f5', borderBottom: '1px solid #ddd', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />

        <div style={{ display: 'flex', gap: '0.25rem', background: '#e5e5e5', borderRadius: 6, padding: 2 }}>
          {(['editing', 'suggesting', 'viewing'] as const).map((m) => (
            <button
              key={m}
              onClick={() => changeMode(m)}
              style={{
                padding: '0.35rem 0.75rem',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                background: mode === m ? '#fff' : 'transparent',
                boxShadow: mode === m ? '0 1px 2px rgba(0,0,0,.1)' : 'none',
                fontWeight: mode === m ? 600 : 400,
              }}
            >
              {m}
            </button>
          ))}
        </div>

        <button onClick={acceptAll} style={actionBtn('#22863a')}>Accept All</button>
        <button onClick={rejectAll} style={actionBtn('#cb2431')}>Reject All</button>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div ref={containerRef} style={{ flex: 1, overflow: 'auto' }} />
        <div ref={commentsRef} style={{ width: 320, borderLeft: '1px solid #ddd', overflow: 'auto' }} />
      </div>
    </div>
  );
}

const actionBtn = (color: string): React.CSSProperties => ({
  padding: '0.35rem 0.75rem',
  border: `1px solid ${color}`,
  borderRadius: 4,
  background: 'white',
  color,
  cursor: 'pointer',
  fontWeight: 500,
});
