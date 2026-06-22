import { useState, useRef, useEffect } from 'react';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

function generateSdtId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `sdt-${timestamp}-${random}`;
}

export default function App() {
  const [sdtStylesHidden, setSdtStylesHidden] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [sdtMessage, setSdtMessage] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const superdocRef = useRef(null);
  const fileInputRef = useRef(null);
  const dropdownRef = useRef(null);

  const initSuperdoc = (document = null) => {
    superdocRef.current?.destroy();

    const config = {
      selector: '#editor',
      documentMode: 'editing',
      modules: {
        toolbar: {
          selector: '#toolbar',
        },
      },
    };

    if (document) {
      config.document = document;
    }

    const instance = new SuperDoc(config);
    superdocRef.current = instance;
    window.superdoc = instance;

    instance.on('ready', () => {
      console.log('SuperDoc ready');
      setIsReady(true);
    });
  };

  useEffect(() => {
    initSuperdoc();
    return () => {
      superdocRef.current?.destroy();
      superdocRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    if (sdtMessage) {
      const timer = setTimeout(() => setSdtMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [sdtMessage]);

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    initSuperdoc(file);
    e.target.value = '';
  };

  const handleExport = async () => {
    if (!superdocRef.current) return;
    try {
      await superdocRef.current.export();
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed: ' + err.message);
    }
  };

  const getEditor = () => {
    const sd = superdocRef.current;
    return sd?.activeEditor || sd?.editor || sd?.view || sd?.instance || null;
  };

  const createSdt = (kind) => {
    const editor = getEditor();
    const doc = editor?.doc;

    if (!doc?.create?.contentControl) {
      console.error('Content control API not available');
      setSdtMessage('Error: API not available');
      return null;
    }

    const sdtId = generateSdtId();
    const content = kind === 'block' ? 'block SDT - type here to edit' : 'inline SDT - type here to edit';

    if (typeof editor?.commands?.focus === 'function') {
      editor.commands.focus();
    }

    try {
      const result = doc.create.contentControl({
        kind,
        controlType: 'text',
        tag: 'annotation',
        alias: `${kind === 'block' ? 'Block' : 'Inline'} Content Control`,
        lockMode: 'unlocked',
        content,
      });

      if (result.success) {
        console.log(`Created ${kind} SDT with tag: annotation`);
        setSdtMessage(`Created ${kind} annotation SDT`);
        return sdtId;
      } else {
        console.error('Failed to create SDT:', result.failure?.message);
        setSdtMessage(`Error: ${result.failure?.message || 'Unknown error'}`);
        return null;
      }
    } catch (err) {
      console.error('Error creating SDT:', err);
      setSdtMessage(`Error: ${err.message}`);
      return null;
    }
  };

  const handleAddSdt = (kind) => {
    createSdt(kind);
    setDropdownOpen(false);
  };

  const toggleSdtStyles = () => {
    setSdtStylesHidden(!sdtStylesHidden);
  };

  return (
    <div className="app">
      <div className="header">
        <h1>Hidden Style SDTs</h1>
        <span className="version">v1.42.0</span>
        <label className="btn">
          Import DOCX
          <input
            type="file"
            ref={fileInputRef}
            className="file-input"
            accept=".docx"
            onChange={handleImport}
          />
        </label>
        <button className="btn btn-primary" onClick={handleExport}>
          Export DOCX
        </button>
        <div className="separator" />
        <div className={`dropdown ${dropdownOpen ? 'open' : ''}`} ref={dropdownRef}>
          <button
            className="btn btn-secondary"
            onClick={(e) => {
              e.stopPropagation();
              setDropdownOpen(!dropdownOpen);
            }}
          >
            Add SDT ▾
          </button>
          <div className="dropdown-content">
            <button className="dropdown-item" onClick={() => handleAddSdt('inline')}>
              Inline
            </button>
            <button className="dropdown-item" onClick={() => handleAddSdt('block')}>
              Block
            </button>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={toggleSdtStyles}>
          {sdtStylesHidden ? 'Show styles' : 'Hide styles'}
        </button>
        {sdtMessage && <span className="sdt-id-display">{sdtMessage}</span>}
      </div>
      <div id="toolbar" />
      <div id="editor" className={sdtStylesHidden ? 'sdt-styles-hidden' : ''} />
    </div>
  );
}
