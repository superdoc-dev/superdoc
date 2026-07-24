import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { DocxZipper, SuperConverter, SuperDoc } from 'superdoc';
import { createSuperDocUI } from 'superdoc/ui';
import { useSetSuperDoc, useSuperDocHost, useSuperDocUI } from 'superdoc/ui/react';
import { Doc as YDoc, applyUpdate, encodeStateAsUpdate } from 'yjs';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3011/api';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3011';
const ROOM_ID = new URLSearchParams(window.location.search).get('room') || import.meta.env.VITE_ROOM_ID || 'policy-handbook';
const REGULATION_NAMESPACE = 'urn:superdoc:regulation-mappings:1';

const REGULATIONS = [
  { id: 'SOC2-CC6.1', framework: 'SOC 2', title: 'Logical access controls' },
  { id: 'ISO27001-A.5.1', framework: 'ISO 27001', title: 'Information security policies' },
  { id: 'HIPAA-164.308', framework: 'HIPAA', title: 'Administrative safeguards' },
];

type User = { name: string; email: string; color: string };
type Version = {
  id: string;
  number: string;
  publishedAt: string;
  publishedBy: { name: string; email: string };
  sizeBytes: number;
};
type RegulationPayload = { regulations: typeof REGULATIONS; mappedBy: User; mappedAt: string };
type RegulationEntry = { id: string; payload: RegulationPayload };

const COLORS = ['#2563eb', '#7c3aed', '#059669', '#dc2626'];
const randomUser = (): User => {
  const number = Math.floor(Math.random() * 900 + 100);
  return {
    name: `Policy Editor ${number}`,
    email: `editor${number}@example.com`,
    color: COLORS[number % COLORS.length],
  };
};

const createNewRoom = () => {
  const url = new URL(window.location.href);
  url.searchParams.set('room', `policy-${crypto.randomUUID().slice(0, 8)}`);
  window.location.assign(url);
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
};

const fromBase64 = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

async function replaceCollaborativeDocument(editor: any, file: File): Promise<void> {
  const zipper = new DocxZipper();
  const files = await zipper.getDocxData(await file.arrayBuffer());
  const converter = new SuperConverter({ docx: files, media: zipper.media, fonts: zipper.fonts });
  const documentJson = converter.getSchema(editor);
  if (!documentJson) throw new Error('SuperDoc could not parse this DOCX.');

  // These commands dispatch through the collaboration-backed editor, so the
  // wholesale replacement becomes a Yjs update visible to every collaborator.
  editor.commands.selectAll();
  editor.commands.insertContent(documentJson, { contentType: 'schema' });
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

export function App() {
  const setSuperDoc = useSetSuperDoc();
  const ui = useSuperDocUI();
  const editorInstance = useRef<any>(null);
  const previewInstance = useRef<any>(null);
  const ydoc = useRef<YDoc | null>(null);
  const provider = useRef<HocuspocusProvider | null>(null);
  const [user] = useState(randomUser);
  const [ready, setReady] = useState(false);
  const [collaborators, setCollaborators] = useState<User[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [previewUi, setPreviewUi] = useState<any>(null);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState('Draft autosaves through collaboration. Publishing creates a version.');

  const refreshVersions = useCallback(async () => {
    const response = await fetch(`${API_URL}/versions?roomId=${encodeURIComponent(ROOM_ID)}`);
    if (!response.ok) throw new Error('Could not load versions');
    setVersions((await response.json()).versions);
  }, []);

  useEffect(() => {
    let disposed = false;
    const sharedDoc = new YDoc();
    const collabProvider = new HocuspocusProvider({ url: WS_URL, name: ROOM_ID, document: sharedDoc });
    ydoc.current = sharedDoc;
    provider.current = collabProvider;

    const initialize = () => {
      if (disposed || editorInstance.current) return;
      const isEmpty = sharedDoc.getXmlFragment('prosemirror').length === 0;
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
      previewInstance.current?.destroy();
      collabProvider.destroy();
      editorInstance.current = null;
      previewInstance.current = null;
    };
  }, [refreshVersions, setSuperDoc, user]);

  const publish = async () => {
    if (!ydoc.current || !ui) return;
    setPublishing(true);
    const publishedCommentIds = ui.comments
      .getSnapshot()
      .items.filter((comment: any) => !comment.parentCommentId && !comment.trackedChange)
      .map((comment: any) => comment.id);
    try {
      const response = await fetch(`${API_URL}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: ROOM_ID, yjsState: toBase64(encodeStateAsUpdate(ydoc.current)), publishedBy: user }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error || `Publish failed (${response.status})`);
      }
      const version = (await response.json()) as Version;

      // Publishing is complete once the server returns 201. Reflect that
      // immediately; cleanup of the next working draft must never make a
      // successfully-created version look like a failed publish.
      setVersions((current) => [version, ...current.filter((item) => item.id !== version.id)]);
      setNotice(`Published version ${version.number}. A clean working draft is ready.`);

      // The snapshot above retains the review state that was published. Only
      // afterward close that review cycle in the working draft: resolve real
      // comments, remove them so they do not carry forward, and accept every
      // published tracked change to establish a fresh diff baseline.
      try {
        for (const commentId of publishedCommentIds) {
          const resolved = ui.comments.resolve(commentId);
          if (!resolved.success && resolved.failure?.code !== 'NO_OP') {
            throw new Error(resolved.failure?.message || 'Could not resolve published comments.');
          }
          ui.comments.delete(commentId);
        }

        // The published snapshot retains its revisions for audit. Accept them
        // only after publishing so the next working draft starts a fresh diff.
        const editor = editorInstance.current?.activeEditor;
        const accepted = editor?.doc?.trackChanges?.decide?.({
          target: { kind: 'all' },
          decision: 'accept',
        });
        if (accepted && !accepted.success && accepted.failure?.code !== 'NO_OP') {
          throw new Error(accepted.failure?.message || 'Could not accept published tracked changes.');
        }
      } catch (cleanupError) {
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

  const openVersion = async (version: Version) => {
    previewUi?.destroy?.();
    setPreviewUi(null);
    setSelectedVersion(version);
    const response = await fetch(`${API_URL}/versions/${version.id}?roomId=${encodeURIComponent(ROOM_ID)}`);
    if (!response.ok) return setNotice('Could not load that version.');
    const stored = await response.json();
    const previewDoc = new YDoc();
    applyUpdate(previewDoc, fromBase64(stored.yjsState));
    requestAnimationFrame(() => {
      previewInstance.current?.destroy();
      previewInstance.current = new SuperDoc({
        selector: '#version-preview',
        documentMode: 'viewing',
        contained: true,
        comments: { visible: true },
        trackChanges: { visible: true },
        telemetry: { enabled: false },
        modules: {
          collaboration: { ydoc: previewDoc, provider: new NoOpProvider() as any },
          comments: {},
          trackChanges: { visible: true, mode: 'review' },
        },
        onReady: ({ superdoc }: any) => {
          superdoc.setTrackedChangesPreferences?.({ mode: 'review', enabled: true });
          setPreviewUi(createSuperDocUI({ superdoc }));
        },
      });
    });
  };

  const closeVersion = () => {
    previewUi?.destroy?.();
    setPreviewUi(null);
    previewInstance.current?.destroy();
    previewInstance.current = null;
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
            <PreviewRegulationOverlays ui={previewUi} superdoc={previewInstance.current} />
          </div>
        </div>
      )}
    </div>
  );
}

function ImportButton({ disabled, onImported }: { disabled: boolean; onImported(name: string): void }) {
  const ui = useSuperDocUI();
  const host = useSuperDocHost();
  const input = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);

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

function ActionBar() {
  const ui = useSuperDocUI();
  const host = useSuperDocHost();
  const [canAct, setCanAct] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => ui?.selection.observe((selection) => setCanAct(!selection.empty && !!selection.selectionTarget)), [ui]);

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
        <button disabled={!canAct} onClick={() => setMenuOpen((open) => !open)}>Map regulation</button>
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
      <span className="hint">Select text to use SuperDoc comments or map a regulation</span>
    </div>
  );
}

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

function useRegulations() {
  const ui = useSuperDocUI();
  const host = useSuperDocHost();
  const [entries, setEntries] = useState<RegulationEntry[]>([]);
  useEffect(() => {
    if (!ui) return;
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

function RegulationHighlights() {
  const ui = useSuperDocUI();
  const regulations = useRegulations();
  const [rects, setRects] = useState<Array<{ id: string; rect: any }>>([]);
  useEffect(() => {
    if (!ui) return;
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

function RegulationPopover() {
  const ui = useSuperDocUI();
  const entries = useRegulations();
  const entriesById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
  const [hover, setHover] = useState<{ entry: RegulationEntry; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!ui) return;
    let frame = 0;
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

class NoOpProvider {
  awareness = { setLocalState: () => {}, setLocalStateField: () => {}, getLocalState: () => ({}), getStates: () => new Map(), on: () => {}, off: () => {}, destroy: () => {} };
  on(event: string, callback: (synced: boolean) => void) { if (event === 'sync' || event === 'synced') setTimeout(() => callback(true)); }
  off() {}
  destroy() {}
  connect() {}
  disconnect() {}
}
