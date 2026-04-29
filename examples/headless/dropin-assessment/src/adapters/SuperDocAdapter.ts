import { createSuperDocUI, type SuperDocUI } from 'superdoc/ui';
import type { EditorAdapter } from '../core/EditorAdapter';
import type {
  Comment,
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
 * Maps the generic toolbar ids used by our UI to SuperDoc's built-in
 * `ui.commands.<id>` ids. Gaps and naming mismatches are tracked in
 * FRICTION.md.
 */
const ID_MAP: Partial<Record<ToolbarCommandId, string>> = {
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
 * Adapter that satisfies our `EditorAdapter` contract by routing through the
 * `superdoc/ui` browser controller. The controller is the canonical surface
 * for build-your-own-UI consumers — every signal the adapter forwards
 * (toolbar, selection, comments, review feed, viewport scroll) reads from
 * `ui.*` rather than poking at editor internals.
 */
export class SuperDocAdapter implements EditorAdapter {
  private superdoc: any;
  private ui: SuperDocUI | null = null;
  private commentsCache: Comment[] = [];
  private trackedChangesCache: TrackedChange[] = [];

  private toolbarListeners = new Set<(s: ToolbarState) => void>();
  private selectionListeners = new Set<(s: SelectionInfo) => void>();
  private commentListeners = new Set<(c: Comment[]) => void>();
  private trackedChangesListeners = new Set<(c: TrackedChange[]) => void>();

  /** commentId → TextTarget from comments.list(). Used by scrollToComment fallback. */
  private commentTargets = new Map<string, any>();

  constructor(superdoc: any) {
    this.superdoc = superdoc;
    this.ui = createSuperDocUI({ superdoc });

    // Toolbar: any change to button state (bold active, link disabled, etc.)
    // re-renders the consumer toolbar. Selection-driven UI also rides this
    // so the consumer doesn't need a second subscription for "is the
    // selection empty / collapsed".
    this.ui.toolbar.subscribe(() => {
      this.emitToolbar();
    });
    this.ui.selection.subscribe(({ snapshot }) => {
      this.emitSelection({
        hasSelection: snapshot.target !== null,
        empty: snapshot.empty,
        quotedText: snapshot.quotedText ?? '',
      });
    });

    // Comments + review feed both arrive as full snapshots from the
    // controller. We re-shape them into the example app's `Comment` /
    // `TrackedChange` types and cache locally so `listComments()` /
    // `listTrackedChanges()` stay synchronous.
    this.ui.comments.subscribe(({ snapshot }) => {
      this.commentsCache = snapshot.items.map((info: any) => this.infoToComment(info));
      this.emitComments();
    });
    this.ui.review.subscribe(({ snapshot }) => {
      this.trackedChangesCache = snapshot.items
        .filter((item) => item.kind === 'change')
        .map((item) =>
          this.infoToTrackedChange((item as Extract<typeof item, { kind: 'change' }>).change),
        );
      this.emitTrackedChanges();
    });
  }

  // EditorAdapter: mount/destroy are no-ops because <SuperDocEditor> owns its own DOM
  mount() {/* FRICTION: SuperDoc's React wrapper owns its own DOM lifecycle */}
  destroy() {
    this.ui?.destroy();
    this.ui = null;
    this.toolbarListeners.clear();
    this.selectionListeners.clear();
    this.commentListeners.clear();
    this.trackedChangesListeners.clear();
  }

  // ---- toolbar ----

  executeCommand(id: ToolbarCommandId, payload?: unknown): boolean {
    const mapped = ID_MAP[id];
    if (!mapped) {
      console.warn(`[SuperDocAdapter] No ui.commands entry for "${id}"`);
      return false;
    }
    const ui = this.ui;
    if (!ui) return false;
    // `ui.commands` is a string-indexed proxy at runtime; the typed
    // surface includes `register` (non-id key) plus per-id `CommandHandle`
    // entries. Cast through `unknown` so the structural mismatch on
    // `register` doesn't trip the tsc check at the lookup site.
    const handle = (ui.commands as unknown as Record<string, {
      execute: (payload?: unknown) => boolean | Promise<boolean>;
    }>)[mapped];
    if (!handle) return false;
    if (mapped === 'link') {
      const href = (payload as { href?: string | null } | undefined)?.href ?? null;
      const result = handle.execute({ href });
      return result === true;
    }
    const result = handle.execute(payload as never);
    return result === true;
  }

  getToolbarState(): ToolbarState {
    const snapshot = this.ui?.toolbar.getSnapshot();
    const cmd = (id: string) => {
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
    const snapshot = this.ui?.selection.getSnapshot();
    if (!snapshot) return { hasSelection: false, empty: true, quotedText: '' };
    return {
      hasSelection: snapshot.target !== null,
      empty: snapshot.empty,
      quotedText: snapshot.quotedText ?? '',
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

  addComment(input: { body: string; authorId: string }): Comment | null {
    const ui = this.ui;
    if (!ui) return null;
    let receipt: any;
    try {
      receipt = ui.comments.createFromSelection({ text: input.body });
    } catch (err) {
      console.error('[SuperDocAdapter] addComment: createFromSelection threw', err);
      return null;
    }
    if (!receipt?.success) {
      console.warn('[SuperDocAdapter] addComment: non-success receipt', receipt);
      return null;
    }
    const newId = receipt.inserted?.[0]?.entityId;
    if (!newId) return null;
    return this.commentsCache.find((c) => c.id === newId) ?? null;
  }

  updateComment(id: string, patch: { body?: string; resolved?: boolean }) {
    const ui = this.ui;
    if (!ui) return;
    if (patch.body !== undefined) {
      // Body edits still go through the doc-api directly — `ui.comments`
      // exposes resolve / reopen / scrollTo as ergonomic facades but
      // delegates body patches to the contract.
      this.superdoc?.activeEditor?.doc?.comments?.patch?.({ commentId: id, text: patch.body });
    }
    if (patch.resolved === true) {
      ui.comments.resolve(id);
    }
    if (patch.resolved === false) {
      // SD-2789 landed `comments.patch({ status: 'active' })`. The legacy
      // FRICTION note ("no public reopen path") is now closed.
      ui.comments.reopen(id);
    }
  }

  deleteComment(id: string) {
    this.superdoc?.activeEditor?.doc?.comments?.delete?.({ commentId: id });
  }

  onCommentsChange(cb: (comments: Comment[]) => void) {
    this.commentListeners.add(cb);
    return () => this.commentListeners.delete(cb);
  }

  // ---- navigation ----

  async scrollToComment(commentId: string): Promise<void> {
    await this.ui?.comments.scrollTo(commentId);
  }

  async scrollToChange(changeId: string): Promise<void> {
    await this.ui?.review.scrollTo(changeId);
  }

  // ---- track changes ----

  isTrackingChanges(): boolean {
    // FRICTION: `documentMode` is a SuperDoc concept, not TC state per se.
    // Suggesting mode implies track-changes-on; editing mode doesn't.
    return this.superdoc?.config?.documentMode === 'suggesting';
  }

  setTrackingChanges(enabled: boolean): void {
    // FRICTION: to toggle TC we flip documentMode between 'suggesting' and
    // 'editing'. SD-2799 will move this to a dedicated `ui.<domain>` surface.
    this.superdoc?.setDocumentMode?.(enabled ? 'suggesting' : 'editing');
  }

  listTrackedChanges(): TrackedChange[] {
    return this.trackedChangesCache;
  }

  acceptChange(id: string): void {
    this.ui?.review.accept(id);
  }

  rejectChange(id: string): void {
    this.ui?.review.reject(id);
  }

  onTrackedChangesChange(cb: (changes: TrackedChange[]) => void) {
    this.trackedChangesListeners.add(cb);
    return () => this.trackedChangesListeners.delete(cb);
  }

  // ---- export ----

  async exportDocx(): Promise<void> {
    await this.superdoc.export({
      exportType: ['docx'],
      commentsType: 'external',
      triggerDownload: true,
    });
  }

  // ---- internals ----

  private infoToComment(info: any): Comment {
    const authorEmail: string = info.creatorEmail ?? '';
    const authorName: string = info.creatorName ?? authorEmail.split('@')[0] ?? 'Unknown';
    const authorKey = authorEmail.split('@')[0];
    const preset = authorKey ? AUTHORS[authorKey as keyof typeof AUTHORS] : undefined;
    const author: Comment['author'] = preset ?? {
      id: authorEmail || authorName,
      name: authorName,
      color: deriveAuthorColor(authorEmail || authorName),
    };

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
      quotedText: info.anchoredText ?? info.quotedText ?? '',
    };
  }

  private infoToTrackedChange(info: any): TrackedChange {
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
      text: info.excerpt ?? '',
      summary: info.excerpt ?? info.type,
    };
  }

  private emitToolbar() {
    const s = this.getToolbarState();
    this.toolbarListeners.forEach((cb) => cb(s));
  }
  private emitSelection(state?: SelectionInfo) {
    const next = state ?? this.getSelection();
    this.selectionListeners.forEach((cb) => cb(next));
  }
  private emitComments() {
    const list = this.commentsCache;
    this.commentListeners.forEach((cb) => cb(list));
  }
  private emitTrackedChanges() {
    this.trackedChangesListeners.forEach((cb) => cb(this.trackedChangesCache));
  }
}
