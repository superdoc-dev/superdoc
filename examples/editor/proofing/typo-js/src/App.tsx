import { useEffect, useRef, useState } from 'react';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import '../../example-shell.css';
import { createTypoJsProvider } from './createTypoJsProvider';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [provider, setProvider] = useState<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const superdocRef = useRef<any>(null);

  useEffect(() => {
    createTypoJsProvider().then(setProvider);
  }, []);

  useEffect(() => {
    if (!provider || !containerRef.current) return;

    superdocRef.current?.destroy();
    superdocRef.current = new SuperDoc({
      selector: containerRef.current,
      document: file ?? undefined,
      documentMode: 'editing',
      user: { name: 'Jane Doe', email: 'jane@example.com' },
      modules: { toolbar: true },
      proofing: {
        enabled: true,
        provider,
        defaultLanguage: 'en_US',
        debounceMs: 200,
        maxSuggestions: 5,
        allowIgnoreWord: true,
      },
    });

    return () => {
      superdocRef.current?.destroy();
      superdocRef.current = null;
    };
  }, [provider, file]);

  return (
    <div className="spell-check-example">
      <header
        style={{
          padding: '0.75rem 1rem',
          background: '#1e293b',
          borderBottom: '1px solid #334155',
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 14 }}>
          Spell Check — Typo.js
        </span>

        <input
          type="file"
          accept=".docx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ color: '#e2e8f0', fontSize: 13 }}
        />

        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span
            style={{
              padding: '0.25rem 0.5rem',
              borderRadius: 4,
              background: '#334155',
              color: '#94a3b8',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            Typo.js · Local
          </span>
          <span style={{ color: '#64748b', fontSize: 12 }}>
            Try typing: <em>teh</em>, <em>recieve</em>, <em>mispelled</em>
          </span>
        </span>
      </header>

      <div
        style={{
          padding: '0.35rem 1rem',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          fontSize: 12,
          color: '#64748b',
        }}
      >
        Right-click underlined words for suggestions
      </div>

      <div ref={containerRef} className="spell-check-editor" />
    </div>
  );
}
