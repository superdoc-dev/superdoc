import { useEffect, useRef, useState } from 'react';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

type LogEntry = { time: string; type: string; detail: string };

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const commentsRef = useRef<HTMLDivElement>(null);
  const superdocRef = useRef<any>(null);

  const addLog = (type: string, detail: string) => {
    const time = new Date().toLocaleTimeString();
    setLog((prev) => [{ time, type, detail }, ...prev].slice(0, 50));
  };

  useEffect(() => {
    if (!file || !containerRef.current) return;

    superdocRef.current?.destroy();
    superdocRef.current = new SuperDoc({
      selector: containerRef.current,
      document: file,
      documentMode: 'editing',
      user: { name: 'Jane Doe', email: 'jane@example.com' },
      modules: {
        comments: {
          selector: commentsRef.current!,
          allowResolving: true,
        },
      },
      onCommentsUpdate: ({ type, comment }: any) => {
        const who = comment?.creatorName ?? '';
        const text = comment?.commentText?.replace(/<[^>]*>/g, '').slice(0, 40) ?? '';
        addLog(type, who ? `${who}: ${text}` : text);
      },
    });

    return () => {
      superdocRef.current?.destroy();
      superdocRef.current = null;
    };
  }, [file]);

  const addComment = () => {
    const editor = superdocRef.current?.activeEditor;
    if (!editor) return;

    const { from, to } = editor.state.selection;
    if (from === to) {
      alert('Select some text first, then click "Add Comment".');
      return;
    }

    editor.commands.addComment('Please review this section.');
  };

  const exportDocx = () => {
    superdocRef.current?.export({ exportedName: 'commented' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ padding: '0.75rem 1rem', background: '#f5f5f5', borderBottom: '1px solid #ddd', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button onClick={addComment} disabled={!file} style={actionBtn('#7c3aed')}>
          Add Comment
        </button>
        <button onClick={exportDocx} disabled={!file} style={actionBtn('#2563eb')}>
          Export DOCX
        </button>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div ref={containerRef} style={{ flex: 1, overflow: 'auto' }} />
        <div style={{ width: 340, borderLeft: '1px solid #ddd', display: 'flex', flexDirection: 'column' }}>
          <div ref={commentsRef} style={{ flex: 1, overflow: 'auto' }} />
          {log.length > 0 && (
            <div style={{ borderTop: '1px solid #ddd', maxHeight: 180, overflow: 'auto', padding: '0.5rem', fontSize: 12, background: '#fafafa' }}>
              <strong>Events</strong>
              {log.map((entry, i) => (
                <div key={i} style={{ color: '#666', marginTop: 2 }}>
                  <span style={{ color: '#999' }}>{entry.time}</span>{' '}
                  <span style={{ color: '#7c3aed', fontWeight: 500 }}>{entry.type}</span>{' '}
                  {entry.detail}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const actionBtn = (color: string): React.CSSProperties => ({
  padding: '0.35rem 0.75rem',
  border: 'none',
  borderRadius: 4,
  background: color,
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 500,
});
