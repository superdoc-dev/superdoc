import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { SuperDoc } from 'superdoc';
import { useSetSuperDoc, useSuperDocHost, useSuperDocUI } from 'superdoc/ui/react';
import { Doc as YDoc } from 'yjs';
import { VersionHistoryController, type User, type Version } from './VersionHistoryController';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3011/api';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3011';
const ROOM_ID = new URLSearchParams(window.location.search).get('room') || import.meta.env.VITE_ROOM_ID || 'policy-handbook';
const REGULATION_NAMESPACE = 'urn:superdoc:regulation-mappings:1';

const REGULATIONS = [
  { id: 'SOC2-CC6.1', framework: 'SOC 2', title: 'Logical access controls' },
  { id: 'ISO27001-A.5.1', framework: 'ISO 27001', title: 'Information security policies' },
  { id: 'HIPAA-164.308', framework: 'HIPAA', title: 'Administrative safeguards' },
];

type RegulationPayload = { regulations: typeof REGULATIONS; mappedBy: User; mappedAt: string };
type RegulationEntry = { id: string; payload: RegulationPayload };

const COLORS = ['#2563eb', '#7c3aed', '#059669', '#dc2626'];

// Creates a lightweight demo identity so each browser session is distinguishable
// in collaboration presence, comments, and tracked changes.
const randomUser = (): User => {
  const number = Math.floor(Math.random() * 900 + 100);
  return {
    name: `Policy Editor ${number}`,
    email: `editor${number}@example.com`,
    color: COLORS[number % COLORS.length],
  };
};

// Starts an isolated collaboration session by navigating to a newly generated room URL.
const createNewRoom = () => {
  const url = new URL(window.location.href);
  url.searchParams.set('room', `policy-${crypto.randomUUID().slice(0, 8)}`);
  window.location.assign(url);
};

// Imports a DOCX into a temporary viewing editor and reads its content through
// the SuperDoc Document API as a structured SDDocument.
async function readDocxAsSDDocument(file: File): Promise<any> {
  const mount = document.createElement('div');
  mount.hidden = true;
  document.body.appendChild(mount);

  return new Promise((resolve, reject) => {
    let temporary: any = null;
    // Tears down the temporary import editor and its hidden DOM mount.
    const dispose = () => {
      temporary?.destroy?.();
      mount.remove();
    };

    temporary = new SuperDoc({
      selector: mount,
      document: file,
      documentMode: 'viewing',
      telemetry: { enabled: false },
      modules: { comments: {} },
      onReady: ({ superdoc }: any) => {
        try {
          const imported = superdoc.activeEditor?.doc?.get?.({});
          if (!imported?.body?.length) throw new Error('The imported DOCX has no readable body content.');
          resolve(imported);
        } catch (error) {
          reject(error);
        } finally {
          queueMicrotask(dispose);
        }
      },
      onException: ({ error }: any) => {
        dispose();
        reject(error instanceof Error ? error : new Error('SuperDoc could not parse this DOCX.'));
      },
    });
  });
}

// Replaces the shared working draft with imported content using Document API writes,
// allowing the replacement to flow through the active Yjs collaboration session.
async function replaceCollaborativeDocument(editor: any, file: File): Promise<void> {
  const imported = await readDocxAsSDDocument(file);
  const cleared = editor.doc.clearContent({});
  if (!cleared.success && cleared.failure?.code !== 'NO_OP') {
    throw new Error(cleared.failure?.message || 'Could not clear the collaborative draft.');
  }

  const emptyDocument = editor.doc.get({});
  const placeholder = emptyDocument.body?.[0];
  if (!placeholder?.id) throw new Error('Could not locate the draft placeholder after clearing it.');

  const replaced = editor.doc.replace({
    target: { kind: 'block', nodeId: placeholder.id, nodeType: placeholder.kind },
    content: imported.body,
  });
  if (!replaced.success) {
    throw new Error(replaced.failure?.message || 'Could not insert the imported document.');
  }
}

const EMPTY_DOCUMENT = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Information Security Policy' }] },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Access to company systems must be authorized, reviewed regularly, and removed when no longer required.',
        },
      ],
    },
    { type: 'paragraph', content: [{ type: 'text', text: 'Select policy text to add a comment or map a regulation.' }] },
  ],
};

// Owns the collaborative editor, publishing workflow, version viewer, and page layout.
export function App() {
  const setSuperDoc = useSetSuperDoc();
  const ui = useSuperDocUI();
  const editorInstance = useRef<any>(null);
  const ydoc = useRef<YDoc | null>(null);
  const provider = useRef<HocuspocusProvider | null>(null);
  const [user] = useState(randomUser);
  const [ready, setReady] = useState(false);
  const [collaborators, setCollaborators] = useState<User[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [previewUi, setPreviewUi] = useState<any>(null);
  const [previewSuperDoc, setPreviewSuperDoc] = useState<any>(null);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState('Draft autosaves through collaboration. Publishing creates a version.');
  const versionController = useMemo(() => new VersionHistoryController(API_URL, ROOM_ID), []);

  // Reloads the lightweight version summaries for the current collaboration room.
  const refreshVersions = useCallback(async () => {
    setVersions(await versionController.listVersions());
  }, [versionController]);

  useEffect(() => {
    let disposed = false;
    const sharedDoc = new YDoc();
    const collabProvider = new HocuspocusProvider({ url: WS_URL, name: ROOM_ID, document: sharedDoc });
    ydoc.current = sharedDoc;
    provider.current = collabProvider;

    // Creates SuperDoc only after the provider has synchronized the room's Yjs state.
    const initialize = () => {
      if (disposed || editorInstance.current) return;
      const isEmpty = sharedDoc.share.size === 0;
      editorInstance.current = new SuperDoc({
        selector: '#policy-editor',
        documentMode: 'suggesting',
        contained: true,
        jsonOverride: isEmpty ? EMPTY_DOCUMENT : undefined,
        user,
        comments: { visible: true },
        trackChanges: { visible: false },
        telemetry: { enabled: false },
        modules: {
          comments: {},
          collaboration: { ydoc: sharedDoc, provider: collabProvider },
          trackChanges: { enabled: true, visible: false, mode: 'final' },
        },
        onReady: ({ superdoc }: any) => {
          if (disposed) return;
          superdoc.setTrackedChangesPreferences?.({ mode: 'final', enabled: true });
          setSuperDoc(superdoc);
          setReady(true);
        },
        onAwarenessUpdate: ({ states }: any) => {
          const users = states.map((state: any) => state.user).filter(Boolean);
          setCollaborators(users);
        },
      });
    };

    collabProvider.on('synced', initialize);
    void refreshVersions().catch((error) => setNotice(String(error)));
    return () => {
      disposed = true;
      editorInstance.current?.destroy();
      versionController.closeVersion();
      collabProvider.destroy();
      editorInstance.current = null;
    };
  }, [refreshVersions, setSuperDoc, user, versionController]);

  // Publishes the current Yjs state, then resolves comments and accepts tracked changes
  // in the working draft to establish a clean baseline for the next version.
  const publish = async () => {
    if (!ydoc.current || !ui) return;
    setPublishing(true);
    try {
      const { version, cleanupError } = await versionController.publish({
        document: ydoc.current,
        user,
        commentsUi: ui,
        editor: editorInstance.current?.activeEditor,
      });

      // Publishing is complete once the server returns 201. Reflect that
      // immediately; cleanup of the next working draft must never make a
      // successfully-created version look like a failed publish.
      setVersions((current) => [version, ...current.filter((item) => item.id !== version.id)]);
      setNotice(`Published version ${version.number}. A clean working draft is ready.`);

      if (cleanupError) {
        console.warn('[policy-version-history] Published, but draft cleanup was incomplete.', cleanupError);
        setNotice(`Published version ${version.number}. Draft cleanup needs attention.`);
      }

      await refreshVersions().catch((refreshError) => {
        console.warn('[policy-version-history] Version list refresh failed.', refreshError);
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setPublishing(false);
    }
  };

  // Loads a published Yjs snapshot into a read-only SuperDoc with audit markup visible.
  const openVersion = async (version: Version) => {
    versionController.closeVersion();
    setPreviewUi(null);
    setPreviewSuperDoc(null);
    setSelectedVersion(version);
    try {
      const preview = await versionController.openVersion(version.id, '#version-preview');
      setPreviewUi(preview.ui);
      setPreviewSuperDoc(preview.superdoc);
    } catch (error) {
      setSelectedVersion(null);
      setNotice(error instanceof Error ? error.message : 'Could not load that version.');
    }
  };

  // Destroys the snapshot viewer and returns focus to the collaborative working draft.
  const closeVersion = () => {
    versionController.closeVersion();
    setPreviewUi(null);
    setPreviewSuperDoc(null);
    setSelectedVersion(null);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">Policy workspace</div>
          <h1>Information Security Policy</h1>
          <div className="status-line">{notice}</div>
        </div>
        <div className="header-actions">
          <div className="presence" aria-label="Active collaborators">
            {(collaborators.length ? collaborators : [user]).slice(0, 4).map((person, index) => (
              <span key={`${person.email}-${index}`} className="avatar" title={person.name} style={{ background: person.color }}>
                {person.name.slice(-3)}
              </span>
            ))}
          </div>
          <button onClick={createNewRoom}>New room</button>
          <ImportButton disabled={!ready} onImported={(name) => setNotice(`Imported ${name} into the working draft.`)} />
          <button className="primary" disabled={!ready || publishing} onClick={() => void publish()}>
            {publishing ? 'Publishing…' : `Publish ${versions.length ? `1.${versions.length + 1}` : '1.1'}`}
          </button>
        </div>
      </header>

      <div className="workspace">
        <main className="document-column">
          <ActionBar />
          <div id="policy-editor" className="editor-host" />
          <RegulationHighlights />
          <RegulationPopover />
        </main>
        <aside className="versions-sidebar">
          <div className="sidebar-heading">
            <strong>Version history</strong>
            <span>{versions.length} published</span>
          </div>
          <VersionHistory versions={versions} onOpen={openVersion} />
        </aside>
      </div>

      {selectedVersion && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="version-modal">
            <div className="modal-header">
              <div>
                <h2>Version {selectedVersion.number}</h2>
                <p>Published by {selectedVersion.publishedBy.name} · {new Date(selectedVersion.publishedAt).toLocaleString()}</p>
              </div>
              <button onClick={closeVersion}>Close</button>
            </div>
            <div id="version-preview" className="preview-host" />
            <PreviewRegulationOverlays ui={previewUi} superdoc={previewSuperDoc} />
          </div>
        </div>
      )}
    </div>
  );
}

// Renders the DOCX picker and imports the selected file into the active shared editor.
function ImportButton({ disabled, onImported }: { disabled: boolean; onImported(name: string): void }) {
  const ui = useSuperDocUI();
  const host = useSuperDocHost();
  const input = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);

  // Validates the chosen file and delegates its content replacement to the Document API.
  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const editor = (host as any)?.activeEditor;
    if (!file || !editor) return;
    setImporting(true);
    try {
      await replaceCollaborativeDocument(editor, file);
      onImported(file.name);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        onChange={(event) => void importFile(event)}
      />
      <button disabled={disabled || importing || !ui || !host} onClick={() => input.current?.click()}>
        {importing ? 'Importing…' : 'Import DOCX'}
      </button>
    </>
  );
}

// Provides regulation-tagging actions for the editor's current text selection.
function ActionBar() {
  const ui = useSuperDocUI();
  const host = useSuperDocHost();
  const [canAct, setCanAct] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => ui?.selection.observe((selection) => setCanAct(!selection.empty && !!selection.selectionTarget)), [ui]);

  // Attaches the chosen regulation as namespaced metadata on the captured selection.
  const mapRegulation = (regulation: (typeof REGULATIONS)[number]) => {
    const capture = ui?.selection.capture();
    const editor = (host as any)?.activeEditor;
    if (!capture?.selectionTarget || !editor?.doc?.metadata) return;
    editor.doc.metadata.attach({
      target: capture.selectionTarget,
      namespace: REGULATION_NAMESPACE,
      payload: { regulations: [regulation], mappedBy: editor.options?.user ?? {}, mappedAt: new Date().toISOString() },
    });
    setMenuOpen(false);
  };

  return (
    <div className="action-bar">
      <div className="regulation-menu">
        <button disabled={!canAct} onClick={() => setMenuOpen((open) => !open)}>Tag selection with regulation</button>
        {menuOpen && (
          <div className="menu-popover">
            {REGULATIONS.map((regulation) => (
              <button key={regulation.id} onMouseDown={(event) => event.preventDefault()} onClick={() => mapRegulation(regulation)}>
                <strong>{regulation.id}</strong><span>{regulation.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Lists published versions and delegates snapshot opening to the parent workflow.
function VersionHistory({ versions, onOpen }: { versions: Version[]; onOpen(version: Version): void }) {
  return (
    <div className="panel-list">
      {versions.length === 0 && <div className="empty">No published versions yet.</div>}
      {versions.map((version) => (
        <button className="version-card" key={version.id} onClick={() => void onOpen(version)}>
          <strong>Version {version.number}</strong>
          <span>{new Date(version.publishedAt).toLocaleString()}</span>
          <span>{version.publishedBy.name} · {(version.sizeBytes / 1024).toFixed(1)} KB</span>
        </button>
      ))}
    </div>
  );
}

// Observes metadata-backed content controls and returns regulation mapping records.
function useRegulations() {
  const ui = useSuperDocUI();
  const host = useSuperDocHost();
  const [entries, setEntries] = useState<RegulationEntry[]>([]);
  useEffect(() => {
    if (!ui) return;
    // Re-reads regulation metadata whenever the underlying content controls change.
    const refresh = () => {
      const editor = (host as any)?.activeEditor;
      const api = editor?.doc?.metadata;
      if (!api) return;
      const list = api.list({ namespace: REGULATION_NAMESPACE });
      setEntries(list.items.map((item: any) => api.get({ id: item.id })).filter(Boolean));
    };
    refresh();
    return ui.contentControls.observe(refresh);
  }, [ui, host]);
  return entries;
}

// Measures mapped ranges and paints translucent highlights over the working editor.
function RegulationHighlights() {
  const ui = useSuperDocUI();
  const regulations = useRegulations();
  const [rects, setRects] = useState<Array<{ id: string; rect: any }>>([]);
  useEffect(() => {
    if (!ui) return;
    // Converts each metadata range into viewport rectangles for the overlay layer.
    const measure = () => setRects(regulations.flatMap((entry) => {
      const result = ui.metadata.getRect({ id: entry.id });
      return result.success ? result.rects.map((rect) => ({ id: entry.id, rect })) : [];
    }));
    measure();
    return ui.viewport.observe(() => requestAnimationFrame(measure));
  }, [ui, regulations]);
  return <div className="regulation-highlights" aria-hidden>{rects.map(({ id, rect }, index) => (
    <span key={`${id}-${index}`} style={{ position: 'fixed', left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />
  ))}</div>;
}

// Shows regulation details when the pointer is over tagged content in the working draft.
function RegulationPopover() {
  const ui = useSuperDocUI();
  const entries = useRegulations();
  const entriesById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
  const [hover, setHover] = useState<{ entry: RegulationEntry; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!ui) return;
    let frame = 0;
    // Hit-tests the pointer against SuperDoc UI entities and updates the hover popover.
    const move = (event: MouseEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const hit = ui.viewport.entityAt({ x: event.clientX, y: event.clientY })
          .find((entity: any) => entity.type === 'contentControl' && entity.tag && entriesById.has(entity.tag)) as
          | { type: 'contentControl'; tag: string }
          | undefined;
        const entry = hit ? entriesById.get(hit.tag) : null;
        setHover(entry ? { entry, x: event.clientX, y: event.clientY } : null);
      });
    };
    window.addEventListener('mousemove', move);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('mousemove', move); };
  }, [ui, entriesById]);
  if (!hover) return null;
  return (
    <div className="regulation-popover" role="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
      <div className="eyebrow">Mapped regulations</div>
      {hover.entry.payload.regulations.map((regulation) => (
        <div key={regulation.id} className="regulation-detail"><strong>{regulation.id}</strong><span>{regulation.framework} · {regulation.title}</span></div>
      ))}
    </div>
  );
}

// Recreates regulation highlights and hover details inside the published-version viewer.
function PreviewRegulationOverlays({ ui, superdoc }: { ui: any; superdoc: any }) {
  const [entries, setEntries] = useState<RegulationEntry[]>([]);
  const [rects, setRects] = useState<Array<{ id: string; rect: any }>>([]);
  const [hover, setHover] = useState<{ entry: RegulationEntry; x: number; y: number } | null>(null);
  const entriesById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);

  useEffect(() => {
    const api = superdoc?.activeEditor?.doc?.metadata;
    if (!ui || !api) {
      setEntries([]);
      return;
    }
    const list = api.list({ namespace: REGULATION_NAMESPACE });
    setEntries(list.items.map((item: any) => api.get({ id: item.id })).filter(Boolean));
  }, [ui, superdoc]);

  useEffect(() => {
    if (!ui) return;
    // Measures stored regulation ranges against the snapshot viewer's current viewport.
    const measure = () => setRects(entries.flatMap((entry) => {
      const result = ui.metadata.getRect({ id: entry.id });
      return result.success ? result.rects.map((rect: any) => ({ id: entry.id, rect })) : [];
    }));
    measure();
    return ui.viewport.observe(() => requestAnimationFrame(measure));
  }, [ui, entries]);

  useEffect(() => {
    if (!ui) return;
    let frame = 0;
    // Hit-tests pointer movement against tagged entities in the snapshot viewer.
    const move = (event: MouseEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const hit = ui.viewport.entityAt({ x: event.clientX, y: event.clientY })
          .find((entity: any) => entity.type === 'contentControl' && entity.tag && entriesById.has(entity.tag)) as
          | { tag: string }
          | undefined;
        const entry = hit ? entriesById.get(hit.tag) : null;
        setHover(entry ? { entry, x: event.clientX, y: event.clientY } : null);
      });
    };
    window.addEventListener('mousemove', move);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('mousemove', move);
    };
  }, [ui, entriesById]);

  return (
    <>
      <div className="regulation-highlights preview-regulation-highlights" aria-hidden>
        {rects.map(({ id, rect }, index) => (
          <span key={`${id}-${index}`} style={{ position: 'fixed', left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />
        ))}
      </div>
      {hover && (
        <div className="regulation-popover" role="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <div className="eyebrow">Mapped regulations</div>
          {hover.entry.payload.regulations.map((regulation) => (
            <div key={regulation.id} className="regulation-detail">
              <strong>{regulation.id}</strong>
              <span>{regulation.framework} · {regulation.title}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
