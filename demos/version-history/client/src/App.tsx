import { useEffect, useRef, useState, useCallback } from 'react';
import { Doc as YDoc, encodeStateAsUpdate, applyUpdate } from 'yjs';
import { SuperDoc, DocxZipper, SuperConverter } from 'superdoc';
import 'superdoc/style.css';

// =============================================================================
// Types
// =============================================================================

interface Version {
  id: string;
  label?: string;
  createdAt: string;
  sizeBytes?: number;
  isYjsState?: boolean;
}

interface CollaboratorUser {
  name: string;
  email: string;
  color?: string;
}

// =============================================================================
// Constants
// =============================================================================

const API_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3001/api';
const BLANK_DOC_URL = '/blank.docx';

// =============================================================================
// Logging
// =============================================================================

function log(event: string, data?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString().slice(11, 23);
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  console.log(`[${timestamp}] [client] ${event}${dataStr}`);
}

// =============================================================================
// API Client
// =============================================================================

async function apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  log(`→ ${method} ${path}`, body ? { body } : undefined);
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) {
    log(`← ${method} ${path} ERROR`, { status: response.status, error: data.error });
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  log(`← ${method} ${path}`, data);
  return data as T;
}

// =============================================================================
// VERSIONS - Version operations and polling
// =============================================================================

const Versions = {
  _log(msg: string): void {
    const ts = new Date().toISOString().slice(11, 23);
    console.log(`[${ts}] [client][versions] ${msg}`);
  },

  /**
   * List all versions for a document.
   */
  async list(documentId: string): Promise<Version[]> {
    const response = await fetch(`${API_URL}/documents/${documentId}/versions`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.versions;
  },

  /**
   * Save a new version (DOCX blob - legacy).
   */
  async save(documentId: string, blob: Blob, label?: string): Promise<Version> {
    const formData = new FormData();
    formData.append('file', blob, 'version.docx');
    if (label) formData.append('label', label);

    this._log(`→ POST /documents/${documentId}/versions`);
    const response = await fetch(`${API_URL}/documents/${documentId}/versions`, {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    this._log(`← ✓`);
    return data;
  },

  /**
   * Save a new version from Yjs state (much smaller than DOCX).
   */
  async saveYjsState(documentId: string, yjsState: Uint8Array, label?: string): Promise<Version> {
    // Convert Uint8Array to base64 in chunks to avoid stack overflow
    const chunkSize = 8192;
    let binary = '';
    for (let i = 0; i < yjsState.length; i += chunkSize) {
      const chunk = yjsState.subarray(i, Math.min(i + chunkSize, yjsState.length));
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    const base64 = btoa(binary);
    this._log(`→ POST /documents/${documentId}/versions/yjs (${yjsState.byteLength} bytes)`);
    const response = await fetch(`${API_URL}/documents/${documentId}/versions/yjs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yjsState: base64, label }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    this._log(`← ✓ saved ${data.sizeBytes} bytes`);
    return data;
  },

  /**
   * Download a version blob (DOCX - legacy).
   */
  async download(documentId: string, versionId: string): Promise<Blob> {
    this._log(`→ GET /documents/${documentId}/versions/${versionId}/download`);
    const response = await fetch(`${API_URL}/documents/${documentId}/versions/${versionId}/download`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    this._log(`← ✓`);
    return blob;
  },

  /**
   * Download a version's Yjs state.
   */
  async downloadYjsState(documentId: string, versionId: string): Promise<Uint8Array> {
    this._log(`→ GET /documents/${documentId}/versions/${versionId}/yjs`);
    const response = await fetch(`${API_URL}/documents/${documentId}/versions/${versionId}/yjs`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    // Decode base64 to Uint8Array
    const binary = atob(data.yjsState);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    this._log(`← ✓ downloaded ${bytes.byteLength} bytes`);
    return bytes;
  },

  /**
   * Revert to a previous version.
   */
  async revert(documentId: string, versionId: string): Promise<void> {
    this._log(`→ POST /documents/${documentId}/versions/${versionId}/revert`);
    const response = await fetch(`${API_URL}/documents/${documentId}/versions/${versionId}/revert`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    this._log(`← ✓`);
  },

  /**
   * Start polling for versions.
   * Optional polling for simplicity. Can use WS messages instead.
   */
  startPolling(documentId: string, onUpdate: (versions: Version[]) => void, intervalMs = 2000): () => void {
    const ts = () => new Date().toISOString().slice(11, 23);
    const log = (msg: string) => console.log(`[${ts()}] [client] ${msg}`);

    log(`started polling /documents/${documentId}/versions every ${intervalMs}ms`);

    const poll = async () => {
      try {
        const versions = await this.list(documentId);
        onUpdate(versions);
      } catch (e) {
        log(`failed: ${e}`);
      }
    };

    poll();
    const interval = setInterval(poll, intervalMs);

    return () => clearInterval(interval);
  },
};

// =============================================================================
// DOCS - Document operations
// =============================================================================

const Docs = {
  /**
   * Upload/register a document with the backend.
   */
  async upload(blob: Blob, filename: string, roomId?: string): Promise<{ documentId: string; filename: string }> {
    log('→ POST /documents', { filename, roomId, size: blob.size });
    const formData = new FormData();
    formData.append('file', blob, filename);
    if (roomId) formData.append('roomId', roomId);

    const response = await fetch(`${API_URL}/documents`, { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    log('← POST /documents', data);
    return data;
  },
};

// =============================================================================
// TC PERMISSIONS - Server-side gating for tracked changes
// =============================================================================

const TCPermissions = {
  _allowed: true, // Cached permission state

  /**
   * Fetch current permission state from server.
   */
  async fetch(): Promise<boolean> {
    try {
      const response = await fetch(`${API_URL}/tc-permissions`);
      const data = await response.json();
      this._allowed = data.allowed;
      log('tc-permissions-fetched', { allowed: this._allowed });
      return this._allowed;
    } catch (e) {
      log('tc-permissions-error', { error: String(e) });
      return this._allowed;
    }
  },

  /**
   * Set permission state on server.
   */
  async set(allowed: boolean): Promise<void> {
    const response = await fetch(`${API_URL}/tc-permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowed }),
    });
    const data = await response.json();
    this._allowed = data.allowed;
    log('tc-permissions-set', { allowed: this._allowed });
  },

  /**
   * Permission resolver callback for SuperDoc.
   * Called synchronously when user tries to accept/reject a tracked change.
   */
  resolver(payload: { permission: string; trackedChange: any }): boolean {
    return TCPermissions._allowed;
  },
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parse a DOCX blob into document JSON format.
 * Requires an editor instance for schema resolution.
 */
async function docxToJson(blob: Blob, editor: any): Promise<object> {
  const zipper = new DocxZipper();
  const arrayBuffer = await blob.arrayBuffer();
  const files = await zipper.getDocxData(arrayBuffer);

  const converter = new SuperConverter({
    docx: files,
    media: zipper.media,
    fonts: zipper.fonts,
  });

  // TODO: SUPERDOC V2 MIGRATION - PM INTERNAL
  const documentJson = converter.getSchema(editor);
  if (!documentJson) throw new Error('Failed to convert DOCX');
  return documentJson;
}

/**
 * Replace the entire editor content with a DOCX blob.
 * Broadcasts via Yjs to all collaborators.
 */
async function replaceEditorContent(editor: any, blob: Blob): Promise<void> {
  const documentJson = await docxToJson(blob, editor);
  // TODO: SUPERDOC V2 MIGRATION - DEPRECATED
  editor.commands.selectAll();
  // TODO: SUPERDOC V2 MIGRATION - DEPRECATED
  editor.commands.insertContent(documentJson, { contentType: 'schema' });
  // TODO: SUPERDOC V2 MIGRATION - DEPRECATED
  setTimeout(() => editor.commands.acceptAllTrackedChanges?.(), 100);
}

const generateUserId = () => `User ${Math.floor(Math.random() * 1000)}`;

/**
 * Minimal no-op provider for viewing Yjs state without real sync.
 */
class NoOpProvider {
  awareness = {
    setLocalState: () => {},
    setLocalStateField: () => {},
    getLocalState: () => ({}),
    getStates: () => new Map(),
    on: () => {},
    off: () => {},
    destroy: () => {},
  };

  on(event: string, callback: (synced: boolean) => void) {
    // Emit sync immediately when registered
    if (event === 'sync' || event === 'synced') {
      setTimeout(() => callback(true), 0);
    }
  }

  off() {}
  destroy() {}
  connect() {}
  disconnect() {}
}

// =============================================================================
// Component
// =============================================================================

export default function App() {
  // ---------------------------------------------------------------------------
  // Refs
  // ---------------------------------------------------------------------------
  const superdocRef = useRef<any>(null);
  const previewSuperdocRef = useRef<any>(null);
  const ydocRef = useRef<YDoc | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [selectedVersionBlob, setSelectedVersionBlob] = useState<Blob | null>(null);
  const [selectedVersionYjsState, setSelectedVersionYjsState] = useState<Uint8Array | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [tcAllowed, setTcAllowed] = useState(true);
  const [currentUser] = useState<CollaboratorUser>(() => {
    const name = generateUserId();
    return {
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '')}@example.com`,
    };
  });

  // ---------------------------------------------------------------------------
  // Poll for versions (optional polling for simplicity, can use WS instead)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!documentId) return;
    return Versions.startPolling(documentId, setVersions);
  }, [documentId]);

  // ---------------------------------------------------------------------------
  // Fetch TC permissions on load
  // ---------------------------------------------------------------------------
  useEffect(() => {
    TCPermissions.fetch().then(setTcAllowed);
  }, []);

  const toggleTcPermissions = useCallback(async () => {
    const newValue = !tcAllowed;
    await TCPermissions.set(newValue);
    setTcAllowed(newValue);
  }, [tcAllowed]);

  // ---------------------------------------------------------------------------
  // Register document with backend
  // ---------------------------------------------------------------------------
  const registerDocument = useCallback(async (blob: Blob) => {
    try {
      const result = await Docs.upload(blob, 'document.docx');
      setDocumentId(result.documentId);
      log('document-registered', { documentId: result.documentId });
    } catch (e) {
      log('document-register-error', { error: String(e) });
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Initialization (no real-time collab - Yjs used only for snapshots)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    log('initializing', { apiUrl: API_URL });

    const init = async () => {
      // Fetch blank.docx to seed the editor
      let initialDoc: Blob | undefined;
      try {
        const response = await fetch(BLANK_DOC_URL);
        initialDoc = await response.blob();
        log('blank-doc-loaded', { size: initialDoc.size });
      } catch (e) {
        log('blank-doc-error', { error: String(e) });
      }

      // Create local ydoc for snapshot capture
      const ydoc = new YDoc();
      ydocRef.current = ydoc;

      superdocRef.current = new SuperDoc({
        selector: '#superdoc-editor',
        documentMode: 'suggesting',
        document: initialDoc,
        user: currentUser,
        comments: { visible: false },
        permissionResolver: TCPermissions.resolver,
        modules: {
          // Use NoOpProvider - no real-time collab, Yjs just for snapshots
          collaboration: { ydoc, provider: new NoOpProvider() as any },
          trackChanges: { enabled: true, visible: false },
        },
        onReady: async () => {
          log('superdoc-ready');
          setIsReady(true);
          superdocRef.current?.setTrackedChangesPreferences?.({ mode: 'final' });

          // Register document with backend
          const superdoc = superdocRef.current;
          if (superdoc) {
            try {
              const blobs = await superdoc.exportEditorsToDOCX?.();
              const blob = blobs?.[0];
              if (blob) {
                await registerDocument(blob);
              }
            } catch (e) {
              log('export-for-register-error', { error: String(e) });
            }
          }
        },
      });
    };

    init();

    return () => {
      log('cleanup');
      superdocRef.current?.destroy();
      previewSuperdocRef.current?.destroy();
      superdocRef.current = null;
      previewSuperdocRef.current = null;
      ydocRef.current = null;
    };
  }, [currentUser, registerDocument]);

  // ---------------------------------------------------------------------------
  // Save Version (using Yjs state - much smaller than DOCX)
  // ---------------------------------------------------------------------------
  const saveVersion = useCallback(async () => {
    const superdoc = superdocRef.current;
    const editor = superdoc?.activeEditor;
    const ydoc = ydocRef.current;
    if (!editor || !superdoc || !documentId || !ydoc) return;

    try {
      // Capture Yjs state (includes tracked changes from this edit session)
      const yjsState = encodeStateAsUpdate(ydoc);
      log('saving-version', { documentId, sizeBytes: yjsState.byteLength });

      // Save version using Yjs state (much smaller than DOCX)
      const result = await Versions.saveYjsState(documentId, yjsState, `Saved by ${currentUser.name}`);
      log('version-saved', { versionId: result.id, sizeBytes: result.sizeBytes });

      // Accept all tracked changes to clear for next session
      // This way the next save will show fresh TC from this point forward
      editor.commands.acceptAllTrackedChanges?.();
    } catch (e) {
      log('save-version-error', { error: String(e) });
    }
  }, [documentId, currentUser.name]);

  // ---------------------------------------------------------------------------
  // View Version
  // ---------------------------------------------------------------------------
  const viewVersion = useCallback(async (version: Version) => {
    if (!documentId) return;
    setSelectedVersion(version);
    setSelectedVersionBlob(null);
    setSelectedVersionYjsState(null);

    try {
      // Try Yjs state first (much smaller and shows TC)
      if (version.isYjsState) {
        log('downloading-yjs-state-for-preview', { versionId: version.id });
        const yjsState = await Versions.downloadYjsState(documentId, version.id);
        setSelectedVersionYjsState(yjsState);
      } else {
        // Fall back to DOCX blob for legacy versions
        log('downloading-blob-for-preview', { versionId: version.id });
        const blob = await Versions.download(documentId, version.id);
        setSelectedVersionBlob(blob);
      }
    } catch (e) {
      log('download-version-error', { error: String(e) });
    }
  }, [documentId]);

  const closePreview = useCallback(() => {
    setSelectedVersion(null);
    setSelectedVersionBlob(null);
    setSelectedVersionYjsState(null);
    previewSuperdocRef.current?.destroy();
    previewSuperdocRef.current = null;
  }, []);

  useEffect(() => {
    // Need either blob or Yjs state to show preview
    if (!selectedVersion || (!selectedVersionBlob && !selectedVersionYjsState)) {
      previewSuperdocRef.current?.destroy();
      previewSuperdocRef.current = null;
      return;
    }

    const initPreview = () => {
      const previewEl = document.getElementById('superdoc-preview');
      if (!previewEl) {
        setTimeout(initPreview, 50);
        return;
      }

      log('initializing-preview', { versionId: selectedVersion.id, isYjsState: !!selectedVersionYjsState });
      previewSuperdocRef.current?.destroy();

      if (selectedVersionYjsState) {
        // Create preview from Yjs state - shows tracked changes
        const previewYdoc = new YDoc();
        applyUpdate(previewYdoc, selectedVersionYjsState);

        previewSuperdocRef.current = new SuperDoc({
          selector: '#superdoc-preview',
          documentMode: 'viewing',
          modules: {
            collaboration: {
              ydoc: previewYdoc,
              provider: new NoOpProvider() as any,
            },
            trackChanges: { visible: true, mode: 'review' },
          },
        });
      } else if (selectedVersionBlob) {
        // Legacy: Create preview from DOCX blob
        previewSuperdocRef.current = new SuperDoc({
          selector: '#superdoc-preview',
          documentMode: 'viewing',
          document: selectedVersionBlob,
          modules: {
            trackChanges: { visible: true, mode: 'review' },
          },
        });
      }
    };

    initPreview();
    return () => {
      previewSuperdocRef.current?.destroy();
      previewSuperdocRef.current = null;
    };
  }, [selectedVersion, selectedVersionBlob, selectedVersionYjsState]);

  // ---------------------------------------------------------------------------
  // Revert to Version (wholesale replacement)
  // ---------------------------------------------------------------------------
  const revertToVersion = useCallback(async (version: Version) => {
    if (!documentId) return;

    try {
      log('reverting-to-version', { versionId: version.id, isYjsState: version.isYjsState });

      // Call backend revert (updates version pointer)
      await Versions.revert(documentId, version.id);
      log('revert-complete', { versionId: version.id });

      if (version.isYjsState) {
        // For Yjs versions: Download state and replace editor completely
        const yjsState = await Versions.downloadYjsState(documentId, version.id);
        log('wholesale-replacement', { sizeBytes: yjsState.byteLength });

        // Destroy current instance
        superdocRef.current?.destroy();
        superdocRef.current = null;

        // Create fresh ydoc with the reverted state
        const newYdoc = new YDoc();
        applyUpdate(newYdoc, yjsState);
        ydocRef.current = newYdoc;

        superdocRef.current = new SuperDoc({
          selector: '#superdoc-editor',
          documentMode: 'suggesting',
          user: currentUser,
          comments: { visible: false },
          permissionResolver: TCPermissions.resolver,
          modules: {
            collaboration: { ydoc: newYdoc, provider: new NoOpProvider() as any },
            trackChanges: { enabled: true, visible: false },
          },
          onReady: () => {
            log('revert-superdoc-ready');
            setIsReady(true);
            superdocRef.current?.setTrackedChangesPreferences?.({ mode: 'final' });
          },
        });

        setIsReady(false);
      } else {
        // For DOCX versions: Download blob and replace editor content
        const editor = superdocRef.current?.activeEditor;
        if (editor) {
          const blob = await Versions.download(documentId, version.id);
          await replaceEditorContent(editor, blob);
        }
      }

      closePreview();
    } catch (error) {
      log('revert-error', { error: String(error) });
    }
  }, [documentId, currentUser, closePreview]);

  // ---------------------------------------------------------------------------
  // Upload Document
  // ---------------------------------------------------------------------------
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.endsWith('.docx')) return;

    const editor = superdocRef.current?.activeEditor;
    if (!editor) return;

    try {
      log('uploading-document', { filename: file.name, size: file.size });
      await replaceEditorContent(editor, file);
      log('document-uploaded');
    } catch (error) {
      log('upload-error', { error: String(error) });
    }

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const formatTimestamp = (dateStr: string) =>
    new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(dateStr));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Version History Demo</h1>
          <p style={styles.subtitle}>
            Editing as <strong>{currentUser.name}</strong>
          </p>
        </div>
        <div style={styles.headerActions}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <button
            onClick={openFilePicker}
            disabled={!isReady}
            style={{ ...styles.secondaryButton, opacity: isReady ? 1 : 0.5 }}
          >
            Open DOCX
          </button>
          <button
            onClick={toggleTcPermissions}
            style={{
              ...styles.secondaryButton,
              background: tcAllowed ? '#dcfce7' : '#fee2e2',
              color: tcAllowed ? '#166534' : '#991b1b',
            }}
          >
            TC: {tcAllowed ? 'Allowed' : 'Blocked'}
          </button>
          <button
            onClick={saveVersion}
            disabled={!isReady || !documentId}
            style={{ ...styles.primaryButton, opacity: isReady && documentId ? 1 : 0.5 }}
          >
            Save Version
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div style={styles.main}>
        <div style={styles.editorPane}>
          <div id="superdoc-editor" style={styles.editor} />
        </div>

        <aside style={styles.sidebar}>
          <h2 style={styles.sidebarTitle}>Version History</h2>
          {versions.length === 0 ? (
            <p style={styles.emptyState}>
              No versions saved yet. Make some edits and click "Save Version".
            </p>
          ) : (
            <ul style={styles.versionList}>
              {versions.map((version) => (
                <li
                  key={version.id}
                  style={{
                    ...styles.versionItem,
                    background: selectedVersion?.id === version.id ? '#e8f4f8' : undefined,
                  }}
                  onClick={() => viewVersion(version)}
                >
                  <div style={styles.versionTimestamp}>{formatTimestamp(version.createdAt)}</div>
                  <div style={styles.versionMeta}>
                    {version.label || version.id}
                    {version.sizeBytes && (
                      <span style={{ marginLeft: '0.5rem', color: '#10b981' }}>
                        ({(version.sizeBytes / 1024).toFixed(1)} KB)
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {/* Version Preview Modal */}
      {selectedVersion && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={styles.modalTitle}>
                  Version from {formatTimestamp(selectedVersion.createdAt)}
                </h3>
                <p style={styles.modalSubtitle}>{selectedVersion.label || selectedVersion.id}</p>
              </div>
              <div style={styles.modalActions}>
                <button onClick={() => revertToVersion(selectedVersion)} style={styles.primaryButton}>
                  Revert to this version
                </button>
                <button onClick={closePreview} style={styles.secondaryButton}>
                  Close
                </button>
              </div>
            </div>
            <div style={styles.modalBody}>
              {selectedVersionBlob || selectedVersionYjsState ? (
                <div id="superdoc-preview" style={styles.previewEditor} />
              ) : (
                <p style={styles.emptyState}>Loading version...</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Styles
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
  // Layout
  container: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'system-ui, sans-serif',
  },
  main: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },

  // Header
  header: {
    padding: '1rem 1.5rem',
    background: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    margin: 0,
    fontSize: '1.5rem',
    fontWeight: 600,
  },
  subtitle: {
    margin: '0.25rem 0 0',
    fontSize: '0.875rem',
    color: '#64748b',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },

  // Buttons
  primaryButton: {
    padding: '0.5rem 1rem',
    background: '#0f766e',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 600,
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  secondaryButton: {
    padding: '0.5rem 1rem',
    background: '#f1f5f9',
    color: '#475569',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontWeight: 500,
    fontSize: '0.875rem',
    cursor: 'pointer',
  },

  // Editor
  editorPane: {
    flex: 1,
    overflow: 'auto',
    background: '#f1f5f9',
  },
  editor: {
    height: '100%',
    minHeight: '600px',
  },

  // Sidebar
  sidebar: {
    width: '300px',
    borderLeft: '1px solid #e2e8f0',
    background: 'white',
    overflow: 'auto',
  },
  sidebarTitle: {
    padding: '1rem',
    margin: 0,
    fontSize: '1rem',
    fontWeight: 600,
    borderBottom: '1px solid #e2e8f0',
  },
  emptyState: {
    padding: '1rem',
    color: '#64748b',
    fontSize: '0.875rem',
  },
  versionList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  versionItem: {
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #f1f5f9',
    cursor: 'pointer',
  },
  versionTimestamp: {
    fontWeight: 600,
    fontSize: '0.875rem',
  },
  versionMeta: {
    fontSize: '0.75rem',
    color: '#64748b',
    marginTop: '0.25rem',
  },

  // Modal
  modal: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: 'white',
    borderRadius: '12px',
    width: '90vw',
    maxWidth: '1000px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  modalHeader: {
    padding: '1rem 1.5rem',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    margin: 0,
    fontSize: '1.25rem',
  },
  modalSubtitle: {
    margin: '0.25rem 0 0',
    fontSize: '0.875rem',
    color: '#64748b',
  },
  modalActions: {
    display: 'flex',
    gap: '0.5rem',
  },
  modalBody: {
    flex: 1,
    overflow: 'auto',
    background: '#f8fafc',
  },
  previewEditor: {
    minHeight: '400px',
  },
};
