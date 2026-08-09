import { useEffect, useRef, useState } from 'react';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const superdocRef = useRef<SuperDoc | null>(null);
  const exportingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!mountRef.current) return;

    let active = true;
    let opened = false;
    let loadFailed = false;
    setReady(false);
    const superdoc = new SuperDoc({
      selector: mountRef.current,
      document: '/sample.docx',
      onReady: () => {
        if (!active || loadFailed) return;
        opened = true;
        setReady(true);
      },
      onException: ({ error }) => {
        if (!opened) {
          loadFailed = true;
          if (active) setReady(false);
        }
        console.error('SuperDoc could not open the document.', error);
      },
    });
    superdocRef.current = superdoc;

    return () => {
      active = false;
      if (superdocRef.current === superdoc) superdocRef.current = null;
      superdoc.destroy();
    };
  }, []);

  async function exportDocument() {
    if (exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    try {
      await superdocRef.current?.export({ exportType: ['docx'], exportedName: 'sample-edited' });
    } catch (error) {
      console.error('SuperDoc could not export the document.', error);
    } finally {
      exportingRef.current = false;
      if (superdocRef.current) setExporting(false);
    }
  }

  return (
    <main>
      <button disabled={!ready || exporting} onClick={() => void exportDocument()} type='button'>
        Export DOCX
      </button>
      <div ref={mountRef} />
    </main>
  );
}
