import '@harbour-enterprises/superdoc/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from './components/Header.jsx';
import AssignmentHeader from './components/AssignmentHeader.jsx';
import Drawer from './components/Drawer.jsx';
import { SuperDoc } from '@harbour-enterprises/superdoc';
import NickPDF from '/nick.pdf?url';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import * as pdfjsViewer from 'pdfjs-dist/web/pdf_viewer.mjs';

const defaultWhiteboardOpacity = 1;
const disabledWhiteboardOpacity = 0.5;

const App = () => {
  const superdocRef = useRef(null);
  const docFileRef = useRef(null);

  // UI state only (do not store SuperDoc instance in state).
  const [whiteboardReady, setWhiteboardReady] = useState(false);
  const [whiteboardEnabled, setWhiteboardEnabled] = useState(true);
  const [activeTool, setActiveTool] = useState('select');

  const toolButtons = useMemo(() => [
    { id: 'select', label: 'Select' },
    { id: 'text', label: 'Text' },
    { id: 'draw', label: 'Draw' },
    { id: 'erase', label: 'Erase' },
  ], []);

  const registerStickers = useCallback(() => {
    const superdoc = superdocRef.current;
    if (!superdoc?.whiteboard) return;
    superdoc.whiteboard.register('stickers', [
      { id: 'check-mark', label: 'Check Mark', src: '/stickers/check-mark.svg', width: 40, height: 40 },
      { id: 'nice', label: 'Nice!', src: '/stickers/nice.svg', width: 40, height: 40 },
      { id: 'needs-improvement', label: 'Needs improvement', src: '/stickers/needs-improvement.svg', width: 40, height: 40 },
    ]);
  }, []);

  const registerComments = useCallback(() => {
    const superdoc = superdocRef.current;
    if (!superdoc?.whiteboard) return;
    superdoc.whiteboard.register('comments', [
      { id: 'great-job', text: 'Great job!' },
      { id: 'expand-this', text: 'Expand this' },
      { id: 'your-references', text: 'Where are your references?' },
    ]);
  }, []);

  const attachEventListeners = useCallback(() => {
    const superdoc = superdocRef.current;
    if (!superdoc) return;
    superdoc.on('whiteboard:change', (data) => {
      console.log('whiteboard:change', { data });
    });
    superdoc.on('whiteboard:tool', (tool) => {
      setActiveTool(tool);
    });
  }, []);

  const onWhiteboardReady = useCallback((whiteboard) => {
    setWhiteboardReady(true);
    setActiveTool(whiteboard?.getTool?.() ?? 'select');
    registerStickers();
    registerComments();
    attachEventListeners();
  }, [attachEventListeners, registerComments, registerStickers]);

  // (Re)initialize SuperDoc with current file.
  const initSuperDoc = useCallback(() => {
    if (superdocRef.current?.destroy) {
      superdocRef.current.destroy();
      superdocRef.current = null;
    }

    const superdocInstance = new SuperDoc({
      selector: '#superdoc',
      document: { data: docFileRef.current },
      toolbar: 'superdoc-toolbar',
      licenseKey: 'public_license_key_superdocinternal_ad7035140c4b',
      telemetry: { enabled: false },
      modules: {
        comments: {},
        toolbar: {
          selector: '#superdoc-toolbar',
          responsiveToContainer: true,
          excludeItems: [
            'acceptTrackedChangeBySelection',
            'rejectTrackedChangeOnSelection',
            'zoom',
            'documentMode',
          ],
        },
        pdf: {
          pdfLib: pdfjsLib,
          pdfViewer: pdfjsViewer,
          setWorker: true,
          textLayerMode: 0,
        },
        whiteboard: {
          enabled: whiteboardEnabled,
        },
      },
      user: {
        name: 'Sarah Smith',
        email: 'sarah.smith@example.com',
      },
      onCommentsUpdate: (data) => {
        console.log(`onCommentsUpdate:`, { data });
      },
    });

    superdocRef.current = superdocInstance;
    window.superdoc = superdocInstance;

    superdocInstance.on('whiteboard:ready', ({ whiteboard }) => {
      onWhiteboardReady(whiteboard);
    });
  }, [onWhiteboardReady]);

  // Load selected file and boot SuperDoc.
  const handleNewFile = useCallback(async (fileName) => {
    let url;
    let fileType;
    let fileNameStr;

    switch (fileName) {
      case 'nick':
        url = NickPDF;
        fileType = 'application/pdf';
        fileNameStr = 'nick.pdf';
        break;
      default:
        return;
    }

    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], fileNameStr, { type: fileType });
      docFileRef.current = file;
      initSuperDoc();
    } catch (err) {
      console.error('Error fetching file:', err);
    }
  }, [initSuperDoc]);

  const handleToolSelect = useCallback((tool) => {
    setActiveTool(tool);
    superdocRef.current?.whiteboard?.setTool(tool);
  }, []);

  const toggleWhiteboard = useCallback(() => {
    setWhiteboardEnabled((prev) => {
      const enabled = !prev;
      const opacity = enabled ? defaultWhiteboardOpacity : disabledWhiteboardOpacity;
      superdocRef.current?.whiteboard?.setEnabled(enabled);
      superdocRef.current?.whiteboard?.setOpacity(opacity);
      return enabled;
    });
  }, []);

  const exportWhiteboard = useCallback(() => {
    const data = superdocRef.current?.whiteboard?.getWhiteboardData();
    if (!data) return;
    console.log('[Whiteboard] export', { data });
    console.log('[Whiteboard] export json:', JSON.stringify(data, null, 2));
  }, []);

  const importWhiteboard = useCallback(() => {
    const json = window.prompt('Paste whiteboard JSON');
    if (!json) return;
    try {
      const data = JSON.parse(json);
      superdocRef.current?.whiteboard?.setWhiteboardData(data);
    } catch (err) {
      console.error('Invalid JSON', err);
    }
  }, []);

  // Initial load + cleanup on unmount.
  useEffect(() => {
    handleNewFile('nick');
    return () => {
      if (superdocRef.current?.destroy) {
        superdocRef.current.destroy();
        superdocRef.current = null;
      }
    };
  }, [handleNewFile]);

  return (
    <div className="app">
      <Header />

      <div className="app-container">
        <div className="app-container-view">
          <div className="container">
            <AssignmentHeader />

            <div className="main-content">
              <div className="document-viewer">
                <div className="viewer-header">
                  <h3>Document Viewer</h3>
                  {whiteboardReady && (
                    <div className="whiteboard-toolbar">
                      <div className="whiteboard-tools">
                        {toolButtons.map((tool) => (
                          <button
                            key={tool.id}
                            className={`whiteboard-tool-btn${activeTool === tool.id ? ' is-active' : ''}`}
                            onClick={() => handleToolSelect(tool.id)}
                          >
                            {tool.label}
                          </button>
                        ))}
                      </div>

                      <div className="whiteboard-controls">
                        <button className="whiteboard-toggle" onClick={toggleWhiteboard}>
                          {whiteboardEnabled ? 'Whiteboard On' : 'Whiteboard Off'}
                        </button>
                        <button className="whiteboard-action" onClick={exportWhiteboard}>
                          Export
                        </button>
                        <button className="whiteboard-action" onClick={importWhiteboard}>
                          Import
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div id="superdoc-toolbar"></div>
                <div id="superdoc"></div>
              </div>
            </div>
          </div>
        </div>

        <Drawer onSelectFile={handleNewFile} />
      </div>
    </div>
  );
};

export default App;
