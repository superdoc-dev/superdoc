import { useMemo, useRef, useState } from 'react';
import { SuperDocEditor } from '@superdoc-dev/react';
import type { ChangeEvent } from 'react';
import type {
  SuperDocRef,
  SuperDocViewportChangeEvent,
  SuperDocZoomChangeEvent,
} from '@superdoc-dev/react';
import '@superdoc-dev/react/style.css';

const SAMPLE_DOCUMENT = '/test_file.docx';
const TOOLBAR_MODULES = {
  toolbar: {
    groups: {
      left: ['zoom'],
    },
  },
};
const FIT_WIDTH_ZOOM = {
  mode: 'fit-width' as const,
  fitWidth: {
    min: 50,
    max: 100,
    padding: 32,
  },
};

type DocumentSource = string | File;

export default function App() {
  const editorRef = useRef<SuperDocRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [document, setDocument] = useState<DocumentSource>(SAMPLE_DOCUMENT);
  const [documentName, setDocumentName] = useState('Sample document');
  const [zoom, setZoom] = useState<SuperDocZoomChangeEvent>({ zoom: 100, mode: 'fit-width' });
  const [metrics, setMetrics] = useState<SuperDocViewportChangeEvent | null>(null);

  const fitLabel = useMemo(() => {
    if (!metrics) return 'Measuring';
    return `${Math.round(metrics.fitZoom)}% fit`;
  }, [metrics]);

  const openFilePicker = () => fileInputRef.current?.click();

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setDocument(file);
    setDocumentName(file.name);
    setMetrics(null);
  };

  const restoreFitWidth = () => {
    editorRef.current?.getInstance()?.setZoomMode('fit-width');
  };

  const resetSample = () => {
    setDocument(SAMPLE_DOCUMENT);
    setDocumentName('Sample document');
    setMetrics(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="title-group">
          <h1>Responsive zoom</h1>
          <p>{documentName}</p>
        </div>

        <div className="controls">
          <button type="button" className="button secondary" onClick={openFilePicker}>
            Open DOCX
          </button>
          <button type="button" className="button secondary" onClick={resetSample}>
            Sample
          </button>
          <button type="button" className="button primary" onClick={restoreFitWidth}>
            Fit width
          </button>
          <input ref={fileInputRef} type="file" accept=".docx" onChange={handleFileChange} hidden />
        </div>
      </header>

      <div className="status-bar">
        <span>
          Zoom <strong>{Math.round(zoom.zoom)}%</strong>
        </span>
        <span>
          Mode <strong>{zoom.mode}</strong>
        </span>
        <span>
          Target <strong>{fitLabel}</strong>
        </span>
        {metrics ? (
          <span>
            Width <strong>{Math.round(metrics.availableWidth)}px</strong>
          </span>
        ) : null}
      </div>

      <main className="workspace">
        <SuperDocEditor
          ref={editorRef}
          document={document}
          documentMode="editing"
          user={{ name: 'Alex Doe', email: 'alex@example.com' }}
          modules={TOOLBAR_MODULES}
          zoom={FIT_WIDTH_ZOOM}
          contained
          onZoomChange={setZoom}
          onViewportChange={setMetrics}
          className="responsive-editor"
          style={{ height: '100%' }}
        />
      </main>
    </div>
  );
}
