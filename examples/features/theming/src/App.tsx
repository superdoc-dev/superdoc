import { useEffect, useRef, useState } from 'react';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import { themes, presets, themeLabels, type ThemeKey } from './themes';

const allThemeClasses = [
  ...Object.values(themes).filter(Boolean),
  ...Object.values(presets),
] as string[];

function applyTheme(key: ThemeKey) {
  const html = document.documentElement;
  allThemeClasses.forEach((cls) => html.classList.remove(cls));

  if (key === 'default') return;
  const cls = (presets as any)[key] ?? (themes as any)[key];
  if (cls) html.classList.add(cls);
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [theme, setTheme] = useState<ThemeKey>('default');
  const containerRef = useRef<HTMLDivElement>(null);
  const superdocRef = useRef<any>(null);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!containerRef.current) return;

    superdocRef.current?.destroy();
    superdocRef.current = new SuperDoc({
      selector: containerRef.current,
      document: file ?? undefined,
      documentMode: 'editing',
      user: { name: 'Jane Doe', email: 'jane@example.com' },
      modules: { toolbar: true },
    });

    return () => {
      superdocRef.current?.destroy();
      superdocRef.current = null;
    };
  }, [file]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
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
        <label style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>
          Theme
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemeKey)}
            style={{
              marginLeft: 8,
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid #475569',
              background: '#334155',
              color: '#e2e8f0',
              fontSize: 13,
            }}
          >
            {Object.entries(themeLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <input
          type="file"
          accept=".docx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ color: '#e2e8f0', fontSize: 13 }}
        />

        <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 'auto' }}>
          createTheme() demo — select a theme and load a .docx to see it in action
        </span>
      </header>

      <div ref={containerRef} style={{ flex: 1, overflow: 'auto' }} />
    </div>
  );
}
