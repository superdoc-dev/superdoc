import { useEffect, useRef, useState, useCallback } from 'react';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { Doc as YDoc } from 'yjs';
import { SuperDoc, DocxZipper, SuperConverter } from 'superdoc';
import 'superdoc/style.css';

// =============================================================================
// Types
// =============================================================================

interface Version {
  id: string;
  label?: string;
  createdAt: string;
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

// Derive WebSocket URL from API URL (same host, different protocol).
// Simple single-port setup for demo purposes.
function getWsUrl(): string {
  const url = new URL(API_URL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/'; // WebSocket at root, not /api
  return url.toString().replace(/\/$/, ''); // Remove trailing slash
}
const WS_URL = getWsUrl();
const BLANK_DOC_URL = '/blank.docx';

// =============================================================================
// Room ID Management
// =============================================================================

function generateRoomId(): string {
  return `room-${Math.random().toString(36).slice(2, 10)}`;
}

function getRoomIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('room');
}

function setRoomIdInUrl(roomId: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomId);
  window.history.replaceState({}, '', url.toString());
}

function getOrCreateRoomId(): string {
  let roomId = getRoomIdFromUrl();
  if (!roomId) {
    roomId = generateRoomId();
    setRoomIdInUrl(roomId);
  }
  return roomId;
}

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
   * Save a new version.
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
   * Download a version blob.
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
  editor.commands.selectAll();
  editor.commands.insertContent(documentJson, { contentType: 'schema' });
  setTimeout(() => editor.commands.acceptAllTrackedChanges?.(), 100);
}

const generateUserId = () => `User ${Math.floor(Math.random() * 1000)}`;

// =============================================================================
// Component
// =============================================================================

export default function App() {
  // ---------------------------------------------------------------------------
  // Refs
  // ---------------------------------------------------------------------------
  const superdocRef = useRef<any>(null);
  const previewSuperdocRef = useRef<any>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const ydocRef = useRef<YDoc | null>(null);

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [roomId] = useState(() => getOrCreateRoomId());
  const [users, setUsers] = useState<any[]>([]);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [selectedVersionBlob, setSelectedVersionBlob] = useState<Blob | null>(null);
  const [isReady, setIsReady] = useState(false);
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
  // Register document with backend
  // ---------------------------------------------------------------------------
  const registerDocument = useCallback(async (blob: Blob) => {
    try {
      const result = await Docs.upload(blob, 'document.docx', roomId);
      setDocumentId(result.documentId);
      log('document-registered', { documentId: result.documentId });
    } catch (e) {
      log('document-register-error', { error: String(e) });
    }
  }, [roomId]);

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  useEffect(() => {
    log('initializing', { wsUrl: WS_URL, apiUrl: API_URL, roomId: roomId });

    const ydoc = new YDoc();
    ydocRef.current = ydoc;

    const provider = new HocuspocusProvider({
      url: WS_URL,
      name: roomId,
      document: ydoc,
    });
    providerRef.current = provider;

    provider.on('synced', async () => {
      log('synced', { roomId: roomId });

      // Check if this is a fresh room (no content yet)
      const xmlFragment = ydoc.getXmlFragment('prosemirror');
      const isEmpty = xmlFragment.length === 0;

      // Always fetch blank.docx to seed empty rooms with valid structure
      let initialDoc: Blob | undefined;
      if (isEmpty) {
        try {
          const response = await fetch(BLANK_DOC_URL);
          initialDoc = await response.blob();
          log('blank-doc-loaded', { size: initialDoc.size });
        } catch (e) {
          log('blank-doc-error', { error: String(e) });
        }
      }

      superdocRef.current = new SuperDoc({
        selector: '#superdoc-editor',
        documentMode: 'suggesting',
        document: initialDoc,
        user: currentUser,
        comments: { visible: false },
        modules: {
          // Provider-agnostic mode: we manage our own Yjs doc and provider
          // (using Hocuspocus here for convenience)
          collaboration: { ydoc, provider },
          trackChanges: { enabled: true, visible: false },
        },
        onReady: async () => {
          log('superdoc-ready');
          setIsReady(true);
          // Show document in "final" mode (hides TC marks) while still tracking changes
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
        onAwarenessUpdate: ({ states }: any) => {
          setUsers(states.filter((s: any) => s.user));
        },
      });
    });

    return () => {
      log('cleanup');
      superdocRef.current?.destroy();
      previewSuperdocRef.current?.destroy();
      provider.destroy();
      superdocRef.current = null;
      previewSuperdocRef.current = null;
      providerRef.current = null;
      ydocRef.current = null;
    };
  }, [currentUser, registerDocument, roomId]);

  // ---------------------------------------------------------------------------
  // Save Version
  // ---------------------------------------------------------------------------
  const saveVersion = useCallback(async () => {
    const superdoc = superdocRef.current;
    const editor = superdoc?.activeEditor;
    if (!editor || !superdoc || !documentId) return;

    try {
      log('saving-version', { documentId });

      // Export current document state as DOCX
      const blobs = await superdoc.exportEditorsToDOCX?.();
      const docxBlob = blobs?.[0];
      if (!docxBlob) {
        log('save-version-error', { error: 'Failed to export DOCX' });
        return;
      }

      // Save version
      const result = await Versions.save(documentId, docxBlob, `Saved by ${currentUser.name}`);
      log('version-saved', { versionId: result.id });
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
    try {
      log('downloading-version-for-preview', { versionId: version.id });
      const blob = await Versions.download(documentId, version.id);
      setSelectedVersionBlob(blob);
    } catch (e) {
      log('download-version-error', { error: String(e) });
    }
  }, [documentId]);

  const closePreview = useCallback(() => {
    setSelectedVersion(null);
    setSelectedVersionBlob(null);
    previewSuperdocRef.current?.destroy();
    previewSuperdocRef.current = null;
  }, []);

  useEffect(() => {
    if (!selectedVersion || !selectedVersionBlob) {
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

      log('initializing-preview', { versionId: selectedVersion.id });
      previewSuperdocRef.current?.destroy();
      previewSuperdocRef.current = new SuperDoc({
        selector: '#superdoc-preview',
        documentMode: 'viewing',
        document: selectedVersionBlob,
        modules: {
          trackChanges: { visible: true, mode: 'review' },
        },
      });
    };

    initPreview();
    return () => {
      previewSuperdocRef.current?.destroy();
      previewSuperdocRef.current = null;
    };
  }, [selectedVersion, selectedVersionBlob]);

  // ---------------------------------------------------------------------------
  // Revert to Version
  // ---------------------------------------------------------------------------
  const revertToVersion = useCallback(async (version: Version) => {
    const editor = superdocRef.current?.activeEditor;
    if (!editor || !documentId) return;

    try {
      log('reverting-to-version', { versionId: version.id });

      // Call backend revert (this updates collab room)
      await Versions.revert(documentId, version.id);
      log('revert-complete', { versionId: version.id });

      // Download the blob to update local editor
      const blob = await Versions.download(documentId, version.id);
      await replaceEditorContent(editor, blob);

      closePreview();
    } catch (error) {
      log('revert-error', { error: String(error) });
    }
  }, [documentId, closePreview]);

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
            <span style={{ marginLeft: '1rem', color: '#94a3b8' }}>
              Room: {roomId} <span style={{ fontSize: '0.75rem' }}>(share URL to collaborate)</span>
            </span>
          </p>
        </div>
        <div style={styles.headerActions}>
          <div style={styles.users}>
            {users.map((u, i) => (
              <span key={i} style={{ ...styles.userBadge, background: u.user?.color || '#666' }}>
                {u.user?.name}
              </span>
            ))}
          </div>
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
                  <div style={styles.versionMeta}>{version.label || version.id}</div>
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
              {selectedVersionBlob ? (
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
  users: {
    display: 'flex',
    gap: '0.5rem',
  },
  userBadge: {
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    color: 'white',
    fontSize: '0.875rem',
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
