import { useEffect, useRef, useState } from 'react';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const superdocRef = useRef<any>(null);

  useEffect(() => {
    if (!file || !containerRef.current) return;

    superdocRef.current?.destroy();
    superdocRef.current = new SuperDoc({
      selector: containerRef.current,
      document: file,
      toolbar: '#toolbar',
      modules: {
        toolbar: {
          // Arrange built-in buttons into groups
          groups: {
            left: ['undo', 'redo'],
            center: [
              'linkedStyles',
              'bold',
              'italic',
              'underline',
              'color',
              'highlight',
              'textAlign',
              'list',
              'numberedlist',
            ],
            right: ['zoom'],
          },
          // Remove buttons you don't need
          excludeItems: ['image', 'ruler', 'search', 'copyFormat', 'table'],
          // Add a custom button
          customButtons: [
            {
              type: 'button',
              name: 'clear',
              tooltip: 'Clear formatting',
              icon: eraserIcon,
              group: 'center',
              command: () => {
                superdocRef.current?.activeEditor?.commands.clearFormat();
              },
            },
          ],
        },
      },
    });

    return () => {
      superdocRef.current?.destroy();
      superdocRef.current = null;
    };
  }, [file]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ padding: '0.75rem 1rem', background: '#f5f5f5', borderBottom: '1px solid #ddd', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <input type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </header>

      <div id="toolbar" />
      <div ref={containerRef} style={{ flex: 1, overflow: 'auto' }} />
    </div>
  );
}

const eraserIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L13.8 2.4c.8-.8 2-.8 2.8 0L21 6.8c.8.8.8 2 0 2.8L12 18"/></svg>`;
