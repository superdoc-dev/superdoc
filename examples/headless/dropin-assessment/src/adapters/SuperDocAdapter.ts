// FRICTION: `createHeadlessToolbar` is NOT on the main 'superdoc' entry — it's at
// 'superdoc/headless-toolbar'. Not discoverable without reading package.json exports.
import {
  createHeadlessToolbar,
  type HeadlessToolbarController,
  type PublicToolbarItemId,
} from 'superdoc/headless-toolbar';
import type { EditorAdapter } from '../core/EditorAdapter';
import type {
  Comment,
  DocRange,
  SelectionInfo,
  ToolbarCommandId,
  ToolbarState,
  TrackedChange,
} from '../core/types';

const AUTHORS: Record<string, Comment['author']> = {
  alex: { id: 'alex', name: 'Alex Rivera', color: '#ef4444' },
  jamie: { id: 'jamie', name: 'Jamie Park', color: '#3b82f6' },
  morgan: { id: 'morgan', name: 'Morgan Lee', color: '#10b981' },
};

/** Deterministic avatar color for an unknown author (imported from DOCX). */
function deriveAuthorColor(key: string): string {
  const palette = ['#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#0ea5e9', '#ef4444'];
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) & 0x7fffffff;
  return palette[hash % palette.length]!;
}

/**
 * Maps the generic toolbar ids used by our UI to SuperDoc's headless toolbar
 * command ids. Gaps and naming mismatches are logged in FRICTION.md.
 */
const ID_MAP: Partial<Record<ToolbarCommandId, PublicToolbarItemId>> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strikethrough',           // FRICTION: naming mismatch
  'bullet-list': 'bullet-list',
  'ordered-list': 'numbered-list',   // FRICTION: naming mismatch
  link: 'link',
  // highlight: ❌ no boolean toggle — only 'highlight-color' which needs a color
  // h1/h2: ❌ no direct heading commands — only 'linked-style' which takes Word style name
};

/**
 * Adapter that satisfies our EditorAdapter contract using SuperDoc's public API.
 * Any use of `superdoc.activeEditor` or `editor.state` / `editor.view` is an
 * escape hatch — those are deprecated and represent DX gaps.
 */
export class SuperDocAdapter implements EditorAdapter {
  private superdoc: any;                 // SuperDocInstance
  private toolbarCtl: HeadlessToolbarController | null = null;
  private commentsCache: Comment[] = [];

  private toolbarListeners = new Set<(s: ToolbarState) => void>();
  private selectionListeners = new Set<(s: SelectionInfo) => void>();
  private commentListeners = new Set<(c: Comment[]) => void>();
  private unsubscribes: Array<() => void> = [];

  constructor(superdoc: any) {
    this.superdoc = superdoc;

    this.toolbarCtl = createHeadlessToolbar({
      superdoc,
      commands: [
        'bold',
        'italic',
        'underline',
        'strikethrough',
        'bullet-list',
        'numbered-list',
        'link',
      ],
    });

    this.unsubscribes.push(
      this.toolbarCtl.subscribe(() => {
        this.emitToolbar();
        this.emitSelection();
      }),
    );

    // Subscribe to selection changes through the public Document API.
    const editor = superdoc.activeEditor;
    if (editor?.doc?.selection?.onChange) {
      const unsub = editor.doc.selection.onChange(() => this.emitSelection());
      this.unsubscribes.push(unsub);
    }

    // Comments: subscribe to the superdoc-level commentsUpdate event
    const onCommentsUpdate = () => {
      this.refreshCommentsCache();
      this.emitComments();
    };
    superdoc.on?.('commentsUpdate', onCommentsUpdate);
    this.unsubscribes.push(() => superdoc.off?.('commentsUpdate', onCommentsUpdate));

    // Track changes: listen for both initial load + updates
    const onTrackedChangesUpdate = () => {
      this.refreshTrackedChangesCache();
      this.emitTrackedChanges();
    };
    superdoc.on?.('trackedChangesUpdate', onTrackedChangesUpdate);
    superdoc.on?.('trackChangesLoaded', onTrackedChangesUpdate);
    this.unsubscribes.push(() => {
      superdoc.off?.('trackedChangesUpdate', onTrackedChangesUpdate);
      superdoc.off?.('trackChangesLoaded', onTrackedChangesUpdate);
    });

    this.refreshCommentsCache();
    this.refreshTrackedChangesCache();
  }

  // EditorAdapter: mount/destroy are no-ops because <SuperDocEditor> owns its own DOM
  mount() {/* FRICTION: SuperDoc's React wrapper owns its own DOM lifecycle */}
  destroy() {
    this.unsubscribes.forEach((fn) => fn());
    this.unsubscribes = [];
    this.toolbarCtl?.destroy();
    this.toolbarCtl = null;
  }

  // ---- toolbar ----

  executeCommand(id: ToolbarCommandId, payload?: unknown): boolean {
    const mapped = ID_MAP[id];
    if (!mapped) {
      // FRICTION: no public way to perform these from the headless toolbar
      console.warn(`[SuperDocAdapter] No headless toolbar command for "${id}"`);
      return false;
    }
    const ctl = this.toolbarCtl;
    if (!ctl) return false;
    if (mapped === 'link') {
      const href = (payload as { href?: string | null } | undefined)?.href ?? null;
      return ctl.execute('link', { href });
    }
    return ctl.execute(mapped as any);
  }

  getToolbarState(): ToolbarState {
    const snapshot = this.toolbarCtl?.getSnapshot();
    const cmd = (id: PublicToolbarItemId) => {
      const s = snapshot?.commands?.[id];
      return { active: !!s?.active, disabled: !!s?.disabled || !snapshot?.context };
    };
    return {
      bold: cmd('bold'),
      italic: cmd('italic'),
      underline: cmd('underline'),
      strike: cmd('strikethrough'),
      highlight: { active: false, disabled: true }, // FRICTION: no toggle-highlight
      h1: { active: false, disabled: true },         // FRICTION: no direct heading cmd
      h2: { active: false, disabled: true },
      'bullet-list': cmd('bullet-list'),
      'ordered-list': cmd('numbered-list'),
      link: cmd('link'),
    };
  }

  onToolbarStateChange(cb: (s: ToolbarState) => void) {
    this.toolbarListeners.add(cb);
    return () => this.toolbarListeners.delete(cb);
  }

  // ---- selection ----

  getSelection(): SelectionInfo {
    // Read the selection through the published Document API. The sidebar
    // uses `range` (PM {from, to}) only as an opaque token for
    // geometry/focus helpers — `addComment` consumes the semantic
    // TextTarget from the editor directly.
    const editor = this.superdoc?.activeEditor;
    if (!editor?.doc?.selection?.current) return { range: null, empty: true, quotedText: '' };
    const info = editor.doc.selection.current({ includeText: true });
    const pmSel = editor.state?.selection;
    return {
      range: pmSel ? { from: pmSel.from, to: pmSel.to } : null,
      empty: info.empty,
      quotedText: info.text ?? '',
    };
  }

  onSelectionChange(cb: (s: SelectionInfo) => void) {
    this.selectionListeners.add(cb);
    return () => this.selectionListeners.delete(cb);
  }

  // ---- comments ----

  listComments() {
    return this.commentsCache;
  }

  addComment(input: { body: string; range: DocRange; authorId: string }): Comment | null {
    const editor = this.superdoc.activeEditor;

    // Read the selection through the Document API — no PM reach-in needed.
    const selection = editor.doc.selection.current();
    const target = selection.target;
    if (!target) {
      console.warn('[SuperDocAdapter] addComment: no text selection available');
      return null;
    }

    // comments.create accepts the full multi-segment TextTarget, so
    // selections spanning multiple blocks anchor across the full range.
    let receipt: any = null;
    try {
      receipt = editor.doc.comments.create({ target, text: input.body });
    } catch (err) {
      console.error('[SuperDocAdapter] addComment: comments.create threw', err);
      return null;
    }

    // Receipt shape is `{ success: boolean, inserted: [{ kind, entityType,
    // entityId }] }`. Anything else is an engine-level failure and the
    // caller should see it rather than an invented comment.
    if (!receipt?.success) {
      console.error('[SuperDocAdapter] addComment: non-success receipt', receipt);
      return null;
    }

    this.refreshCommentsCache();
    this.emitComments();

    const newId = receipt.inserted?.[0]?.entityId;
    if (!newId) return null;
    return this.commentsCache.find((c) => c.id === newId) ?? null;
  }

  updateComment(id: string, patch: { body?: string; resolved?: boolean }) {
    const editor = this.superdoc.activeEditor;
    if (patch.body !== undefined) {
      editor.doc.comments.patch({ commentId: id, text: patch.body });
    }
    if (patch.resolved === true) {
      editor.doc.comments.patch({ commentId: id, status: 'resolved' });
    }
    if (patch.resolved === false) {
      // FRICTION: CommentsPatchInput.status is typed as `'resolved'` only.
      // There is no public reopen path.
      console.warn('[SuperDocAdapter] No public API to reopen a resolved comment');
    }
    this.refreshCommentsCache();
    this.emitComments();
  }

  deleteComment(id: string) {
    const editor = this.superdoc.activeEditor;
    editor.doc.comments.delete({ commentId: id });
    this.refreshCommentsCache();
    this.emitComments();
  }

  onCommentsChange(cb: (comments: Comment[]) => void) {
    this.commentListeners.add(cb);
    return () => this.commentListeners.delete(cb);
  }

  // ---- navigation ----

  async scrollToComment(commentId: string): Promise<void> {
    const editor = this.superdoc?.activeEditor;
    if (!editor?.doc?.ranges) return;
    // Prefer the entity-address form so the Document API resolves the id
    // through its internal comment-anchor index; falls back to the cached
    // TextTarget if needed.
    await editor.doc.ranges.scrollIntoView({
      target: { kind: 'entity', entityType: 'comment', entityId: commentId },
      block: 'center',
      behavior: 'smooth',
    });
  }

  async scrollToChange(changeId: string): Promise<void> {
    const editor = this.superdoc?.activeEditor;
    if (!editor?.doc?.ranges) return;
    await editor.doc.ranges.scrollIntoView({
      target: { kind: 'entity', entityType: 'trackedChange', entityId: changeId },
      block: 'center',
      behavior: 'smooth',
    });
  }

  // ---- track changes ----

  private trackedChangesCache: TrackedChange[] = [];
  private trackedChangesListeners = new Set<(c: TrackedChange[]) => void>();

  isTrackingChanges(): boolean {
    // FRICTION: `documentMode` is a SuperDoc concept, not TC state per se.
    // Suggesting mode implies track-changes-on; editing mode doesn't.
    return this.superdoc?.config?.documentMode === 'suggesting';
  }

  setTrackingChanges(enabled: boolean): void {
    // FRICTION: to toggle TC we flip documentMode between 'suggesting' and
    // 'editing'. There is no public `trackChanges.setEnabled()` API.
    this.superdoc?.setDocumentMode?.(enabled ? 'suggesting' : 'editing');
  }

  listTrackedChanges(): TrackedChange[] {
    return this.trackedChangesCache;
  }

  acceptChange(id: string): void {
    this.superdoc?.activeEditor?.doc?.trackChanges?.decide?.({
      decision: 'accept',
      target: { id },
    });
    this.refreshTrackedChangesCache();
    this.emitTrackedChanges();
  }

  rejectChange(id: string): void {
    this.superdoc?.activeEditor?.doc?.trackChanges?.decide?.({
      decision: 'reject',
      target: { id },
    });
    this.refreshTrackedChangesCache();
    this.emitTrackedChanges();
  }

  onTrackedChangesChange(cb: (changes: TrackedChange[]) => void) {
    this.trackedChangesListeners.add(cb);
    return () => this.trackedChangesListeners.delete(cb);
  }

  private refreshTrackedChangesCache() {
    const editor = this.superdoc?.activeEditor;
    const api = editor?.doc?.trackChanges;
    if (!api?.list) {
      this.trackedChangesCache = [];
      return;
    }
    try {
      const result = api.list();
      const items: any[] = (result as any)?.items ?? [];
      this.trackedChangesCache = items.map((info) => this.infoToTrackedChange(info));
    } catch {
      this.trackedChangesCache = [];
    }
  }

  private infoToTrackedChange(info: any): TrackedChange {
    // TrackChangeInfo carries authorEmail/author and a date string. We
    // preserve whatever the import gave us rather than mapping to a
    // synthetic AUTHORS entry.
    const kindMap: Record<string, TrackedChange['kind']> = {
      insert: 'insertion',
      delete: 'deletion',
      format: 'format',
    };
    const authorKey: string = info.authorEmail ?? info.author ?? 'unknown';
    const author = {
      id: authorKey,
      name: info.author ?? authorKey,
      color: deriveAuthorColor(authorKey),
    };
    const createdAtIso =
      typeof info.date === 'string'
        ? info.date
        : typeof info.date === 'number'
          ? new Date(info.date).toISOString()
          : new Date().toISOString();
    return {
      id: info.id,
      kind: kindMap[info.type] ?? 'format',
      author,
      createdAt: createdAtIso,
      // FRICTION: `TrackChangeInfo.address` is entity-only; no public
      // address→PM-range resolver. The sidebar uses `id`, not `range`,
      // for scroll (via `editor.doc.ranges.scrollIntoView`).
      range: { from: 0, to: 0 },
      text: info.excerpt ?? '',
      summary: info.excerpt ?? info.type,
    };
  }

  private emitTrackedChanges() {
    this.trackedChangesListeners.forEach((cb) => cb(this.trackedChangesCache));
  }

  // ---- internals ----

  /** commentId → TextTarget from comments.list(). Used by scrollToComment. */
  private commentTargets = new Map<string, any>();

  private refreshCommentsCache() {
    const editor = this.superdoc?.activeEditor;
    if (!editor?.doc?.comments) {
      this.commentsCache = [];
      return;
    }
    try {
      const result = editor.doc.comments.list();
      const items = result?.items ?? [];
      this.commentsCache = items.map((info: any) => this.infoToComment(info));
    } catch (e) {
      console.warn('[SuperDocAdapter] comments.list failed:', e);
      this.commentsCache = [];
    }
  }

  private infoToComment(info: any): Comment {
    // Use the real author identity from the DOCX import. Falling back to a
    // fixed AUTHORS entry papered over the fact that imported comments
    // carry their own `creatorName` / `creatorEmail`, and the sidebar was
    // attributing them to the wrong person.
    const authorEmail: string = info.creatorEmail ?? '';
    const authorName: string = info.creatorName ?? authorEmail.split('@')[0] ?? 'Unknown';
    const authorKey = authorEmail.split('@')[0];
    const preset = authorKey ? AUTHORS[authorKey as keyof typeof AUTHORS] : undefined;
    const author: Comment['author'] = preset ?? {
      id: authorEmail || authorName,
      name: authorName,
      color: deriveAuthorColor(authorEmail || authorName),
    };

    // SuperDoc emits `createdTime` (epoch ms number); our UI consumes ISO
    // strings. The previous code read a non-existent `createdAt` field and
    // silently fell through to `new Date().toISOString()`, which made every
    // imported comment appear to have been created just now.
    const createdAtIso =
      typeof info.createdTime === 'number'
        ? new Date(info.createdTime).toISOString()
        : typeof info.createdAt === 'string'
          ? info.createdAt
          : new Date().toISOString();

    const commentId = info.commentId ?? info.id;
    if (info.target) this.commentTargets.set(commentId, info.target);

    return {
      id: commentId,
      author,
      body: info.text ?? '',
      createdAt: createdAtIso,
      resolved: info.status === 'resolved' || info.isDone === true,
      range: { from: 0, to: 0 },
      quotedText: info.anchoredText ?? info.quotedText ?? '',
    };
  }

  private emitToolbar() {
    const s = this.getToolbarState();
    this.toolbarListeners.forEach((cb) => cb(s));
  }
  private emitSelection() {
    const s = this.getSelection();
    this.selectionListeners.forEach((cb) => cb(s));
  }
  private emitComments() {
    const list = this.commentsCache;
    this.commentListeners.forEach((cb) => cb(list));
  }
}
