import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import SuperDocTemplateBuilder from '@superdoc-dev/template-builder';
import type { SuperDocTemplateBuilderHandle } from '@superdoc-dev/template-builder';
import 'superdoc/style.css';
import './App.css';

const AUTOSAVE_DELAY = 500;

// =============================================================================
// Insert Text SDT
// =============================================================================

function insertTextSdt(builderRef: React.RefObject<SuperDocTemplateBuilderHandle | null>, alias: string): boolean {
  if (!builderRef.current) return false;
  return builderRef.current.insertField({
    alias,
    fieldType: 'text',
  });
}

// =============================================================================
// Insert Image SDT
// =============================================================================

function insertImageSdt(
  builderRef: React.RefObject<SuperDocTemplateBuilderHandle | null>,
  dataUri: string,
  fileName: string,
): boolean {
  if (!builderRef.current) return false;
  return builderRef.current.insertBlockField({
    alias: fileName,
    fieldType: 'image',
    presetContent: {
      json: {
        type: 'paragraph',
        content: [
          {
            type: 'image',
            attrs: {
              src: dataUri,
              alt: fileName,
              size: { width: 200, height: 150 },
              wrap: { type: 'Inline' },
            },
          },
        ],
      },
    },
  });
}

// =============================================================================
// Export
// =============================================================================

async function exportTemplate(builderRef: React.RefObject<SuperDocTemplateBuilderHandle | null>): Promise<void> {
  if (!builderRef.current) return;
  await builderRef.current.exportTemplate({ fileName: 'template.docx' });
}

// =============================================================================
// Export (flattened)
// =============================================================================

async function exportFlattened(builderRef: React.RefObject<SuperDocTemplateBuilderHandle | null>): Promise<void> {
  const superdoc = builderRef.current?.getSuperDoc();
  if (!superdoc) return;
  await superdoc.export({
    exportType: ['docx'],
    exportedName: 'final-document',
    isFinalDoc: true,
    triggerDownload: true,
  });
}

// =============================================================================
// App
// =============================================================================

export default function App() {
  const builderRef = useRef<SuperDocTemplateBuilderHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textSdtInputRef = useRef<HTMLInputElement>(null);
  const autosaveTimeoutRef = useRef<number | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Loading...');
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [showTextSdtInput, setShowTextSdtInput] = useState(false);
  const [textSdtValue, setTextSdtValue] = useState('');

  // Load existing document from server on mount
  useEffect(() => {
    fetch('/api/document/exists')
      .then((res) => res.json())
      .then(({ exists }) => {
        if (exists) {
          setDocumentUrl('/api/document?' + Date.now());
        }
      })
      .catch(() => setSaveStatus('Server not running'));
  }, []);

  // Focus input when popover opens
  useEffect(() => {
    if (showTextSdtInput && textSdtInputRef.current) {
      textSdtInputRef.current.focus();
    }
  }, [showTextSdtInput]);

  const setupAutosave = useCallback(() => {
    const superdoc = builderRef.current?.getSuperDoc();
    const editor = superdoc?.activeEditor;
    if (!editor) return;

    const save = async () => {
      setSaveStatus('Saving...');
      try {
        const blob = await builderRef.current?.exportTemplate({ triggerDownload: false });
        if (!blob) {
          setSaveStatus('Save failed');
          return;
        }
        const formData = new FormData();
        formData.append('document', blob, 'document.docx');
        await fetch('/api/document', { method: 'POST', body: formData });
        setSaveStatus('Saved');
      } catch (err) {
        console.error('Save failed:', err);
        setSaveStatus('Save failed');
      }
    };

    editor.on('update', () => {
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = window.setTimeout(save, AUTOSAVE_DELAY);
    });

    setSaveStatus('Ready');
  }, []);

  const handleDeleteDocument = useCallback(() => {
    setSaveStatus('Deleting...');
    setIsReady(false);
    fetch('/api/document', { method: 'DELETE' })
      .then(() => {
        setDocumentUrl(null);
        setSaveStatus('');
      })
      .catch(() => setSaveStatus('Delete failed'));
  }, []);

  const handleFileUpload = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !file.name.endsWith('.docx')) return;

    const formData = new FormData();
    formData.append('document', file);
    setSaveStatus('Uploading...');
    setIsReady(false);

    fetch('/api/document', { method: 'POST', body: formData })
      .then((res) => res.json())
      .then(() => {
        setDocumentUrl('/api/document?' + Date.now());
        setSaveStatus('');
      })
      .catch(() => setSaveStatus('Upload failed'));
  }, []);

  const handleInsertImageSdt = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      insertImageSdt(builderRef, reader.result as string, file.name);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleInsertTextSdt = useCallback(() => {
    if (!textSdtValue.trim()) return;
    insertTextSdt(builderRef, textSdtValue.trim());
    setTextSdtValue('');
    setShowTextSdtInput(false);
  }, [textSdtValue]);

  const handleTextSdtKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleInsertTextSdt();
      } else if (e.key === 'Escape') {
        setShowTextSdtInput(false);
        setTextSdtValue('');
      }
    },
    [handleInsertTextSdt],
  );

  const documentConfig = useMemo(
    () => (documentUrl ? { source: documentUrl, mode: 'editing' as const } : null),
    [documentUrl],
  );

  const handleReady = useCallback(() => {
    setIsReady(true);
    setupAutosave();
  }, [setupAutosave]);

  return (
    <div className='app'>
      <header>
        <div className='title-row'>
          <h1>Template Builder Demo</h1>
          <span className='save-status'>{saveStatus || '\u00A0'}</span>
        </div>
        <div className='controls'>
          <button onClick={handleDeleteDocument} disabled={!documentUrl}>
            Delete Document
          </button>
          <input
            type='file'
            accept='.docx'
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
          <button onClick={() => fileInputRef.current?.click()}>Upload Document</button>

          <div className='dropdown-container'>
            <button onClick={() => setShowTextSdtInput(!showTextSdtInput)} disabled={!isReady}>
              Insert Text SDT
            </button>
            {showTextSdtInput && (
              <div className='dropdown-popover'>
                <input
                  ref={textSdtInputRef}
                  type='text'
                  placeholder='Field name...'
                  value={textSdtValue}
                  onChange={(e) => setTextSdtValue(e.target.value)}
                  onKeyDown={handleTextSdtKeyDown}
                />
                <button onClick={handleInsertTextSdt}>Insert</button>
              </div>
            )}
          </div>

          <input
            type='file'
            accept='image/*'
            ref={imageInputRef}
            style={{ display: 'none' }}
            onChange={handleInsertImageSdt}
          />
          <button onClick={() => imageInputRef.current?.click()} disabled={!isReady}>
            Insert Image SDT
          </button>

          <button onClick={() => exportTemplate(builderRef)} disabled={!isReady}>
            Export
          </button>
          <button onClick={() => exportFlattened(builderRef)} disabled={!isReady}>
            Export (flattened)
          </button>
        </div>
      </header>

      {documentConfig ? (
        <SuperDocTemplateBuilder
          ref={builderRef}
          document={documentConfig}
          onReady={handleReady}
          documentHeight='calc(100vh - 80px)'
        />
      ) : (
        <div className='empty-state'>
          <p>No document loaded</p>
          <button onClick={() => fileInputRef.current?.click()}>Upload a .docx file to get started</button>
        </div>
      )}
    </div>
  );
}
