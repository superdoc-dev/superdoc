'use client';

import { useState, useRef } from 'react';
import { SuperDocEditor, SuperDocRef, DocumentMode } from '@superdoc-dev/react';
import '@superdoc-dev/react/style.css';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<DocumentMode>('editing');
  const editorRef = useRef<SuperDocRef>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleExport = async () => {
    await editorRef.current?.getInstance()?.export({ triggerDownload: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-100">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-zinc-900">
          SuperDoc + Next.js
        </h1>

        <div className="flex items-center gap-4">
          {/* Mode Toggle */}
          {file && (
            <>
              <div className="flex rounded-lg border border-zinc-200">
                <button
                  onClick={() => setMode('editing')}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    mode === 'editing'
                      ? 'bg-zinc-900 text-white'
                      : 'text-zinc-600 hover:text-zinc-900'
                  } rounded-l-md`}
                >
                  Edit
                </button>
                <button
                  onClick={() => setMode('viewing')}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    mode === 'viewing'
                      ? 'bg-zinc-900 text-white'
                      : 'text-zinc-600 hover:text-zinc-900'
                  } rounded-r-md`}
                >
                  View
                </button>
              </div>

              <button
                onClick={handleExport}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                Export DOCX
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 flex-col">
        {!file ? (
          /* File Upload UI */
          <div className="flex flex-1 items-center justify-center p-8">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-white p-12 transition-colors hover:border-blue-500 hover:bg-blue-50">
              <svg
                className="mb-4 h-12 w-12 text-zinc-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span className="mb-2 text-lg font-medium text-zinc-700">
                Upload a DOCX file
              </span>
              <span className="text-sm text-zinc-500">
                Click to browse or drag and drop
              </span>
              <input
                type="file"
                accept=".docx"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>
        ) : (
          /* SuperDoc Editor */
          <div className="flex-1">
            <SuperDocEditor
              ref={editorRef}
              document={file}
              documentMode={mode}
              user={{
                name: 'Demo User',
                email: 'demo@example.com',
              }}
              onReady={() => console.log('SuperDoc is ready!')}
              onEditorUpdate={() => console.log('Document updated')}
              renderLoading={() => (
                <div className="flex h-full items-center justify-center">
                  <div className="text-zinc-500">Loading document...</div>
                </div>
              )}
              style={{ height: 'calc(100vh - 73px)' }}
            />
          </div>
        )}
      </main>
    </div>
  );
}
