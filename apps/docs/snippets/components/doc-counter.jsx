export const DocCounter = ({ height = '350px' }) => {
  const [documents, setDocuments] = useState(new Map());
  const [currentDoc, setCurrentDoc] = useState(null);
  const [ready, setReady] = useState(false);
  const [log, setLog] = useState([]);
  const superdocRef = useRef(null);
  const containerIdRef = useRef(`editor-${Math.random().toString(36).substr(2, 9)}`);

  const addLog = (message) => {
    setLog((prev) => [...prev, { time: new Date().toLocaleTimeString(), message }]);
  };

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/superdoc@latest/dist/style.css';
    document.head.appendChild(link);

    // Buffer polyfill — required by the UMD build for document hashing
    const bufferScript = document.createElement('script');
    bufferScript.src = 'https://cdn.jsdelivr.net/npm/buffer@6/index.min.js';
    bufferScript.onload = () => {
      window.Buffer = window.buffer.Buffer;

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/superdoc@latest/dist/superdoc.umd.js';
      script.onload = () => setTimeout(() => initializeSuperdoc(), 100);
      document.body.appendChild(script);
    };
    document.body.appendChild(bufferScript);

    return () => superdocRef.current?.destroy?.();
  }, []);

  const getEditor = () => {
    return superdocRef.current?.activeEditor || superdocRef.current?.editor;
  };

  const trackDocument = async (name) => {
    const editor = getEditor();
    if (!editor) {
      setCurrentDoc({ name, identifier: null, hasGuid: false });
      return;
    }

    let identifier = null;
    let guid = null;

    try {
      identifier = await editor.getDocumentIdentifier();
      guid = editor.getDocumentGuid();
    } catch (e) {
      addLog(`Error: ${e?.message || e}`);
    }

    if (identifier) {
      setDocuments((prev) => {
        const next = new Map(prev);
        if (next.has(identifier)) {
          const existing = next.get(identifier);
          next.set(identifier, { ...existing, opens: existing.opens + 1 });
          addLog(`Re-opened "${name}" — same identifier, still counts as 1`);
        } else {
          next.set(identifier, { name, opens: 1, hasGuid: !!guid });
          addLog(`New document "${name}" — identifier: ${identifier.slice(0, 12)}...`);
        }
        return next;
      });
    }

    setCurrentDoc({ name, identifier, hasGuid: !!guid });
  };

  const initializeSuperdoc = (file = null) => {
    if (superdocRef.current) {
      superdocRef.current.destroy?.();
    }

    setReady(false);

    const config = {
      selector: `#${containerIdRef.current}`,
      telemetry: { enabled: false },
      onReady: async () => {
        setReady(true);
        if (file) {
          await trackDocument(file.name);
        }
      },
    };

    if (file) {
      config.document = { data: file, type: 'docx' };
    } else {
      config.html = '<p>Upload a DOCX file to see how document counting works.</p>';
    }

    if (window.SuperDocLibrary) {
      superdocRef.current = new window.SuperDocLibrary.SuperDoc(config);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file?.name.endsWith('.docx')) return;
    addLog(`Uploading "${file.name}"...`);
    initializeSuperdoc(file);
    e.target.value = '';
  };

  const handleExportAndReimport = async () => {
    if (!superdocRef.current?.export) return;

    addLog('Exporting document...');
    const blob = await superdocRef.current.export();

    if (!blob) {
      addLog('Export returned no data');
      return;
    }

    const name = currentDoc?.name || 'document.docx';
    const file = new File([blob], name, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    addLog('Re-importing exported document...');
    initializeSuperdoc(file);
  };

  const uniqueCount = documents.size;

  return (
    <div className='border rounded-lg bg-white overflow-hidden'>
      {/* Header with counter */}
      <div
        style={{
          background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
          color: 'white',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: '28px', fontWeight: 700, lineHeight: 1 }}>{uniqueCount}</div>
          <div style={{ fontSize: '11px', opacity: 0.85, marginTop: '2px' }}>
            Unique document{uniqueCount !== 1 ? 's' : ''} counted
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {ready && currentDoc && (
            <button
              onClick={handleExportAndReimport}
              style={{
                padding: '6px 12px',
                background: 'rgba(255,255,255,0.2)',
                color: 'white',
                fontSize: '12px',
                borderRadius: '6px',
                cursor: 'pointer',
                border: '1px solid rgba(255,255,255,0.3)',
              }}
            >
              Export & re-import
            </button>
          )}
          <label
            style={{
              padding: '6px 12px',
              background: 'white',
              color: '#2563eb',
              fontSize: '12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Upload DOCX
            <input type='file' accept='.docx' onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      {/* Document list */}
      {documents.size > 0 && (
        <div style={{ padding: '8px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>
            Documents counting toward usage:
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {Array.from(documents.entries()).map(([id, doc]) => (
              <div
                key={id}
                style={{
                  fontSize: '11px',
                  padding: '3px 8px',
                  background: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '4px',
                }}
              >
                <span style={{ fontWeight: 500 }}>{doc.name}</span>
                {doc.opens > 1 && (
                  <span style={{ color: '#3b82f6', marginLeft: '4px' }}>(opened {doc.opens}x — still 1)</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Editor */}
      <div id={containerIdRef.current} style={{ minHeight: height, paddingLeft: '5px', overflow: 'scroll' }} />

      {/* Event log */}
      {log.length > 0 && (
        <div
          style={{
            padding: '8px 16px',
            background: '#1e293b',
            borderTop: '1px solid #e5e7eb',
            maxHeight: '120px',
            overflowY: 'auto',
            fontFamily: 'monospace',
          }}
        >
          {log.map((entry, i) => (
            <div key={i} style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.6 }}>
              <span style={{ color: '#64748b' }}>{entry.time}</span>{' '}
              <span style={{ color: '#e2e8f0' }}>{entry.message}</span>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        #${containerIdRef.current} .superdoc__layers {
          max-width: 660px !important;
        }
        #${containerIdRef.current} .super-editor-container {
          min-width: unset !important;
          min-height: unset !important;
          width: 100% !important;
        }
        #${containerIdRef.current} .super-editor {
          max-width: 100% !important;
          width: 100% !important;
          color: #000;
        }
        #${containerIdRef.current} .editor-element {
          min-height: ${height} !important;
          width: 100% !important;
          min-width: unset !important;
          transform: none !important;
        }
        #${containerIdRef.current} .editor-element {
          h1,
          h2,
          h3,
          h4,
          h5,
          strong {
            color: #000;
          }
        }
      `}</style>
    </div>
  );
};
