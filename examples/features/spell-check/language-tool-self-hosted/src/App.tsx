import { useEffect, useMemo, useRef, useState } from 'react';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import '../../example-shell.css';
import { createLanguageToolProvider } from './createLanguageToolProvider';

const BASE_URL =
  import.meta.env.VITE_LANGUAGETOOL_URL ?? 'http://localhost:8081/v2/check';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const superdocRef = useRef<any>(null);

  const provider = useMemo(
    () => createLanguageToolProvider({ baseUrl: BASE_URL }),
    [],
  );

  useEffect(() => {
    if (!containerRef.current) return;

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
        defaultLanguage: 'en-US',
        debounceMs: 700,
        visibleFirst: true,
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
          Spell Check — LanguageTool
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
            LanguageTool · Self-hosted
          </span>
          <span
            style={{
              color: '#64748b',
              fontSize: 11,
              fontFamily: 'monospace',
            }}
          >
            {BASE_URL}
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
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>Right-click underlined words for suggestions</span>
        <span>
          Try typing: <em>teh</em>, <em>recieve</em>, <em>mispelled</em>
        </span>
      </div>

      <div ref={containerRef} className="spell-check-editor" />
    </div>
  );
}
