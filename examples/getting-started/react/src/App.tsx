import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const superdocRef = useRef<SuperDoc | null>(null);

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  };

  useEffect(() => {
    if (!containerRef.current) return;

    superdocRef.current = new SuperDoc({
      selector: containerRef.current,
      document: file,
    });

    return () => {
      superdocRef.current?.destroy();
      superdocRef.current = null;
    };
  }, [file]);

  return (
    <>
      <div style={{ padding: '1rem', background: '#f5f5f5' }}>
        <input type="file" accept=".docx" onChange={handleFile} />
      </div>
      <div ref={containerRef} style={{ height: 'calc(100vh - 60px)' }} />
    </>
  );
}
