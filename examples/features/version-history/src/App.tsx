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
  timestamp: Date;
  savedBy: string;
  documentBlob: Blob;
}

interface CollaboratorUser {
  name: string;
  email: string;
  color?: string;
}

// =============================================================================
// Constants
// =============================================================================

const WS_URL = (import.meta.env.VITE_HOCUSPOCUS_URL as string) || 'ws://localhost:1234';
const ROOM_ID = (import.meta.env.VITE_ROOM_ID as string) || 'version-history-demo';

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
  const [users, setUsers] = useState<any[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [currentUser] = useState<CollaboratorUser>(() => ({
    name: generateUserId(),
    email: 'user@example.com',
  }));

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const ydoc = new YDoc();
    ydocRef.current = ydoc;

    const provider = new HocuspocusProvider({
      url: WS_URL,
      name: ROOM_ID,
      document: ydoc,
    });
    providerRef.current = provider;

    provider.on('synced', () => {
      superdocRef.current = new SuperDoc({
        selector: '#superdoc-editor',
        documentMode: 'suggesting',
        user: currentUser,
        comments: { visible: false },
        modules: {
          // Provider-agnostic mode: we manage our own Yjs doc and provider
          // (using Hocuspocus here for convenience)
          collaboration: { ydoc, provider },
          trackChanges: { visible: false },
        },
        onReady: () => {
          setIsReady(true);
          superdocRef.current?.setTrackedChangesPreferences?.({ mode: 'final', enabled: true });
        },
        onAwarenessUpdate: ({ states }: any) => {
          setUsers(states.filter((s: any) => s.user));
        },
      });
    });

    return () => {
      superdocRef.current?.destroy();
      previewSuperdocRef.current?.destroy();
      provider.destroy();
      superdocRef.current = null;
      previewSuperdocRef.current = null;
      providerRef.current = null;
      ydocRef.current = null;
    };
  }, [currentUser]);

  // ---------------------------------------------------------------------------
  // New Document
  // ---------------------------------------------------------------------------
  const newDocument = useCallback(() => {
    const editor = superdocRef.current?.activeEditor;
    if (editor) {
      editor.commands.selectAll();
      editor.commands.deleteSelection();
      editor.commands.acceptAllTrackedChanges?.();
    }
    setVersions([]);
    setSelectedVersion(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Save Version
  // ---------------------------------------------------------------------------
  const saveVersion = useCallback(async () => {
    const superdoc = superdocRef.current;
    const editor = superdoc?.activeEditor;
    if (!editor || !superdoc) return;

    try {
      const blobs = await superdoc.exportEditorsToDOCX?.();
      const documentBlob = blobs?.[0];
      if (!documentBlob) return;

      const newVersion: Version = {
        id: `v-${Date.now()}`,
        timestamp: new Date(),
        savedBy: currentUser.name,
        documentBlob,
      };

      setVersions((prev) => [newVersion, ...prev]);
      editor.commands.acceptAllTrackedChanges?.();
    } catch (e) {
      console.error('Failed to save version:', e);
    }
  }, [currentUser.name]);

  // ---------------------------------------------------------------------------
  // View Version
  // ---------------------------------------------------------------------------
  const viewVersion = useCallback((version: Version) => {
    setSelectedVersion(version);
  }, []);

  const closePreview = useCallback(() => {
    setSelectedVersion(null);
    previewSuperdocRef.current?.destroy();
    previewSuperdocRef.current = null;
  }, []);

  useEffect(() => {
    if (!selectedVersion) {
      previewSuperdocRef.current?.destroy();
      previewSuperdocRef.current = null;
      return;
    }

    const versionToShow = selectedVersion;

    const initPreview = () => {
      const previewEl = document.getElementById('superdoc-preview');
      if (!previewEl) {
        setTimeout(initPreview, 50);
        return;
      }

      previewSuperdocRef.current?.destroy();
      previewSuperdocRef.current = new SuperDoc({
        selector: '#superdoc-preview',
        documentMode: 'viewing',
        document: versionToShow.documentBlob,
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
  }, [selectedVersion]);

  // ---------------------------------------------------------------------------
  // Revert to Version
  // ---------------------------------------------------------------------------
  const revertToVersion = useCallback(async (version: Version) => {
    const editor = superdocRef.current?.activeEditor;
    if (!editor) return;

    try {
      const documentJson = await docxToJson(version.documentBlob, editor);

      // Replace content (broadcasts via Yjs to all collaborators)
      editor.commands.selectAll();
      editor.commands.insertContent(documentJson, { contentType: 'schema' });

      // Accept tracked changes after content settles
      setTimeout(() => editor.commands.acceptAllTrackedChanges?.(), 100);

      // Trim version history
      setVersions((prev) => {
        const idx = prev.findIndex((v) => v.id === version.id);
        return idx === -1 ? prev : prev.slice(idx);
      });

      closePreview();
    } catch (error) {
      console.error('Failed to revert:', error);
    }
  }, [closePreview]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const formatTimestamp = (date: Date) =>
    new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);

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
            Editing as <strong>{currentUser.name}</strong> | Tracked changes are active but hidden
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
          <button onClick={newDocument} style={styles.secondaryButton}>
            New Document
          </button>
          <button
            onClick={saveVersion}
            disabled={!isReady}
            style={{ ...styles.primaryButton, opacity: isReady ? 1 : 0.5 }}
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
                  <div style={styles.versionTimestamp}>{formatTimestamp(version.timestamp)}</div>
                  <div style={styles.versionMeta}>Saved by {version.savedBy}</div>
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
                  Version from {formatTimestamp(selectedVersion.timestamp)}
                </h3>
                <p style={styles.modalSubtitle}>Saved by {selectedVersion.savedBy}</p>
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
              <div id="superdoc-preview" style={styles.previewEditor} />
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
    pointerEvents: 'none',
  },
};
