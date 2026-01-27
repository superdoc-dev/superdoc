export const SuperDocEditor = ({
  html = '<p>Start editing...</p>',
  height = '400px',
  maxHeight = '400px',
  onReady = null,
  showExport = true,
  customButtons = null, // Array of {label, onClick, className}
}) => {
  const [ready, setReady] = useState(false);
  const editorRef = useRef(null);
  const containerIdRef = useRef(`editor-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/@harbour-enterprises/superdoc@latest/dist/style.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@harbour-enterprises/superdoc@latest/dist/superdoc.umd.js';
    script.onload = () => {
      setTimeout(() => {
        if (window.SuperDocLibrary) {
          editorRef.current = new window.SuperDocLibrary.SuperDoc({
            selector: `#${containerIdRef.current}`,
            html,
            rulers: true,
            onReady: () => {
              setReady(true);
              if (onReady) onReady(editorRef.current);
            },
          });
        }
      }, 100);
    };
    document.body.appendChild(script);

    return () => editorRef.current?.destroy?.();
  }, []);

  const exportDocx = () => {
    if (editorRef.current?.export) {
      editorRef.current.export();
    }
  };

  return (
    <div className='border rounded-lg bg-white overflow-hidden'>
      {ready && (showExport || customButtons) && (
        <div className='px-3 py-2 bg-gray-50 border-b'>
          {customButtons && (
            <div className='space-y-1 mb-2'>
              {customButtons.map((row, rowIndex) => (
                <div key={rowIndex} className='flex gap-1'>
                  {row.map((btn, i) => (
                    <button
                      key={i}
                      onClick={() => btn.onClick(editorRef.current)}
                      className={
                        btn.className || 'flex-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded hover:bg-gray-200'
                      }
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
          {showExport && (
            <div className='text-right'>
              <button
                onClick={exportDocx}
                className='px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600'
              >
                Export DOCX
              </button>
            </div>
          )}
        </div>
      )}
      <div
        id={containerIdRef.current}
        style={{ minHeight: height, maxHeight, paddingLeft: '5px', overflow: 'scroll' }}
      />
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
