import { useState, useRef, useCallback } from 'react';
import { mergePDFs } from './mergePDFs';
import { convertDocxToPdf } from './convertDocxToPdf';

interface UploadedFile {
  id: string;
  name: string;
  type: 'pdf' | 'docx';
  data: ArrayBuffer;
}

export function App() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [merging, setMerging] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const apiKey = import.meta.env.VITE_SUPERDOC_API_KEY ?? '';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    const newFiles: UploadedFile[] = [];
    for (const file of Array.from(selectedFiles)) {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.name.toLowerCase().endsWith('.docx');

      if (!isPdf && !isDocx) continue;

      const data = await file.arrayBuffer();
      newFiles.push({
        id: crypto.randomUUID(),
        name: file.name,
        type: isPdf ? 'pdf' : 'docx',
        data,
      });
    }

    setFiles(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      setFiles(prev => {
        const newFiles = [...prev];
        const [draggedItem] = newFiles.splice(draggedIndex, 1);
        newFiles.splice(dragOverIndex, 0, draggedItem);
        return newFiles;
      });
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [draggedIndex, dragOverIndex]);

  const handleMerge = useCallback(async () => {
    if (files.length === 0) return;

    setMerging(true);
    try {
      const pdfBuffers: ArrayBuffer[] = [];

      for (const file of files) {
        if (file.type === 'pdf') {
          pdfBuffers.push(file.data);
        } else if (file.type === 'docx') {
          const convertedPdf = await convertDocxToPdf(file.data, file.name, apiKey);
          pdfBuffers.push(convertedPdf);
        }
      }

      const mergedBytes = await mergePDFs(pdfBuffers);
      const blob = new Blob([new Uint8Array(mergedBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = 'merged.pdf';
      link.click();

      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to merge PDFs:', error);
      alert(`Failed to merge PDFs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setMerging(false);
    }
  }, [files]);

  const pdfCount = files.filter(f => f.type === 'pdf').length;
  const docxCount = files.filter(f => f.type === 'docx').length;

  return (
    <div className="app">
      <header className="app-header">
        <h1>PDF Merge</h1>
        <p className="subtitle">Upload PDFs and DOCX files, reorder them by dragging, then merge into a single PDF.</p>
      </header>

      <main className="app-main">
        <div className="upload-area">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileSelect}
            id="file-input"
            className="file-input"
          />
          <label htmlFor="file-input" className="upload-button">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 4V16M4 10H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Add Documents
          </label>
        </div>

        {files.length > 0 && (
          <>
            <div className="file-list">
              <div className="file-list-header">
                <span className="file-count">
                  {files.length} file{files.length !== 1 ? 's' : ''}
                  {pdfCount > 0 && docxCount > 0 && ` (${pdfCount} PDF, ${docxCount} DOCX)`}
                </span>
                <span className="drag-hint">Drag to reorder</span>
              </div>
              <ul className="files">
                {files.map((file, index) => (
                  <li
                    key={file.id}
                    className={`file-item ${draggedIndex === index ? 'dragging' : ''} ${dragOverIndex === index ? 'drag-over' : ''}`}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                  >
                    <span className="file-order">{index + 1}</span>
                    <span className="drag-handle">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="5" cy="4" r="1.5" fill="currentColor"/>
                        <circle cx="11" cy="4" r="1.5" fill="currentColor"/>
                        <circle cx="5" cy="8" r="1.5" fill="currentColor"/>
                        <circle cx="11" cy="8" r="1.5" fill="currentColor"/>
                        <circle cx="5" cy="12" r="1.5" fill="currentColor"/>
                        <circle cx="11" cy="12" r="1.5" fill="currentColor"/>
                      </svg>
                    </span>
                    <span className={`file-type ${file.type}`}>{file.type.toUpperCase()}</span>
                    <span className="file-name">{file.name}</span>
                    <button
                      className="remove-button"
                      onClick={() => removeFile(file.id)}
                      title="Remove file"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="actions">
              <button
                className="merge-button"
                onClick={handleMerge}
                disabled={merging || files.length === 0}
              >
                {merging ? 'Merging...' : 'Merge to PDF'}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
