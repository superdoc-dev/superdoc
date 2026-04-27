import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Highlight from '@tiptap/extension-highlight';
import type { EditorAdapter } from '../core/EditorAdapter';
import type {
  Comment,
  DocRange,
  SelectionInfo,
  ToolbarCommandId,
  ToolbarState,
  TrackedChange,
} from '../core/types';
import { CommentMark } from './TipTapCommentMark';

const AUTHORS: Record<string, Comment['author']> = {
  alex: { id: 'alex', name: 'Alex Rivera', color: '#ef4444' },
  jamie: { id: 'jamie', name: 'Jamie Park', color: '#3b82f6' },
  morgan: { id: 'morgan', name: 'Morgan Lee', color: '#10b981' },
};

const INITIAL_HTML = `
<h1>Memorandum</h1>
<p><strong>TO:</strong> General Counsel</p>
<p><strong>FROM:</strong> M&amp;A Practice Group</p>
<p><strong>DATE:</strong> December 30, 2024</p>
<p><strong>RE:</strong> Interim Operating Covenants Under Merger Agreement</p>
<p>Dear General Counsel,</p>
<p>This memorandum outlines your company's key obligations during the period between signing and closing of the merger agreement.</p>
<h2>Operational Covenants</h2>
<p>During the interim period between signing and closing, the company shall conduct its business only in the ordinary course. The company shall use commercially reasonable efforts to preserve intact its present business organization, keep available the services of its present officers and employees, and preserve its relationships with customers, suppliers, licensors, licensees, distributors, and other persons.</p>
<p>The company shall not, without the prior written consent of the Acquiror, issue, sell, pledge, dispose of, grant, transfer, lease, license, guarantee, or encumber, or authorize any such action with respect to any shares of capital stock or any other securities.</p>
<p>The company shall not amend its certificate of incorporation, bylaws, or other organizational documents.</p>
<h2>Restrictive Covenants</h2>
<p>The company shall not, and shall not permit any of its subsidiaries to, directly or indirectly, take any of the following actions without the prior written consent of the Acquiror: merge or consolidate with any other person, acquire any business or entity, sell, lease, license, transfer, or otherwise dispose of any material assets, incur any indebtedness for borrowed money in excess of the threshold set forth in the disclosure schedules, or make any capital expenditures inconsistent with the approved capital budget.</p>
<p>The company shall not declare, set aside, or pay any dividend or other distribution in respect of its capital stock, except for regular quarterly dividends consistent with past practice.</p>
<p>The company shall not enter into, amend, modify, or terminate any material contract, except in the ordinary course of business consistent with past practice.</p>
<h2>Notification Requirements</h2>
<p>The company shall promptly notify the Acquiror of any event, occurrence, or development that would reasonably be expected to have a material adverse effect on the company, or any notice or other communication from any governmental authority in connection with the transactions contemplated hereby.</p>
<p>Please coordinate all such notifications through the M&amp;A Practice Group.</p>
<h2>Closing Conditions</h2>
<p>All customary closing conditions shall be satisfied or waived as set forth in the merger agreement. Please review and respond by Friday.</p>
`;

export class TipTapAdapter implements EditorAdapter {
  private editor: Editor | null = null;
  private comments: Comment[] = [];
  private commentListeners = new Set<(c: Comment[]) => void>();
  private toolbarListeners = new Set<(s: ToolbarState) => void>();
  private selectionListeners = new Set<(s: SelectionInfo) => void>();

  mount(element: HTMLElement) {
    this.editor = new Editor({
      element,
      extensions: [
        StarterKit.configure({}),
        Link.configure({ openOnClick: false }),
        Highlight,
        CommentMark,
      ],
      content: INITIAL_HTML,
      onTransaction: () => {
        this.emitToolbar();
        this.emitSelection();
      },
    });

    // DROP-IN ASSESSMENT FINDING: TipTap has no built-in tracked-changes
    // support. A real consumer would need `@tiptap-pro/extension-track-changes`
    // (commercial). We intentionally leave `trackedChanges` empty rather
    // than mocking parity with SuperDoc — the missing panel *is* the
    // finding. The sidebar's empty-state is the honest answer when TipTap
    // is the v1 editor.
    this.trackedChanges = [];

    // Seed 3 comments matching the DOCX that SuperDoc loads, anchored via
    // the CommentMark so the yellow highlights match in both views. This
    // is the one piece of the UI that *does* mirror SuperDoc, so the
    // custom sidebar can be exercised on both editors.
    this.seedMirroredComments();

    queueMicrotask(() => {
      this.emitTrackedChanges();
      this.emitComments();
    });
  }

  private seedMirroredComments() {
    const editor = this.editor;
    if (!editor) return;
    // Reset any previously seeded mirror comments so StrictMode double-mount
    // or remounts don't produce duplicates. We match on the well-known seed ids.
    this.comments = this.comments.filter((c) => !c.id.startsWith('c_seed_'));
    const SEED: Array<{ id: string; anchor: string; body: string; author: 'alex' | 'jamie' | 'morgan' }> = [
      {
        id: 'c_seed_1',
        anchor: 'General Counsel',
        body: 'Please confirm the correct recipient title.',
        author: 'alex',
      },
      {
        id: 'c_seed_2',
        anchor: 'Merger Agreement',
        body: 'Reference the specific agreement dated Dec 15 per previous draft.',
        author: 'alex',
      },
      {
        id: 'c_seed_3',
        anchor: 'Closing Conditions',
        body: 'Add the closing checklist as Appendix A.',
        author: 'alex',
      },
    ];
    for (const seed of SEED) {
      const range = this.findFirstTextRange(seed.anchor);
      if (!range) continue;
      const author = AUTHORS[seed.author];
      this.comments.push({
        id: seed.id,
        author,
        body: seed.body,
        createdAt: new Date().toISOString(),
        resolved: false,
        range,
        quotedText: seed.anchor,
      });
      // Apply the comment mark so the inline highlight matches SuperDoc.
      editor
        .chain()
        .setTextSelection(range)
        .setMark('comment', { commentId: seed.id })
        .setTextSelection(range.to)
        .run();
    }
    // Clear selection — we don't want the seed marks to leave the caret mid-doc.
    editor.chain().setTextSelection(0).run();
  }

  private findFirstTextRange(needle: string): DocRange | null {
    const editor = this.editor;
    if (!editor) return null;
    let found: DocRange | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (found) return false;
      if (!node.isText) return true;
      const text = node.text ?? '';
      const idx = text.indexOf(needle);
      if (idx >= 0) {
        found = { from: pos + idx, to: pos + idx + needle.length };
        return false;
      }
      return true;
    });
    return found;
  }

  destroy() {
    this.editor?.destroy();
    this.editor = null;
  }

  // ---- toolbar ----

  executeCommand(id: ToolbarCommandId, payload?: unknown): boolean {
    const e = this.editor;
    if (!e) return false;
    const chain = e.chain().focus();
    switch (id) {
      case 'bold': return chain.toggleBold().run();
      case 'italic': return chain.toggleItalic().run();
      case 'underline': return false; // starter-kit doesn't include underline
      case 'strike': return chain.toggleStrike().run();
      case 'highlight': return chain.toggleHighlight().run();
      case 'h1': return chain.toggleHeading({ level: 1 }).run();
      case 'h2': return chain.toggleHeading({ level: 2 }).run();
      case 'bullet-list': return chain.toggleBulletList().run();
      case 'ordered-list': return chain.toggleOrderedList().run();
      case 'link': {
        const href = (payload as { href?: string } | undefined)?.href;
        if (!href) return chain.unsetLink().run();
        return chain.setLink({ href }).run();
      }
      default: return false;
    }
  }

  getToolbarState(): ToolbarState {
    const e = this.editor;
    const empty: ToolbarState = this.emptyToolbarState();
    if (!e) return empty;
    return {
      bold: { active: e.isActive('bold'), disabled: false },
      italic: { active: e.isActive('italic'), disabled: false },
      underline: { active: false, disabled: true },
      strike: { active: e.isActive('strike'), disabled: false },
      highlight: { active: e.isActive('highlight'), disabled: false },
      h1: { active: e.isActive('heading', { level: 1 }), disabled: false },
      h2: { active: e.isActive('heading', { level: 2 }), disabled: false },
      'bullet-list': { active: e.isActive('bulletList'), disabled: false },
      'ordered-list': { active: e.isActive('orderedList'), disabled: false },
      link: { active: e.isActive('link'), disabled: false },
    };
  }

  onToolbarStateChange(cb: (s: ToolbarState) => void) {
    this.toolbarListeners.add(cb);
    return () => this.toolbarListeners.delete(cb);
  }

  // ---- selection ----

  getSelection(): SelectionInfo {
    const e = this.editor;
    if (!e) return { range: null, empty: true, quotedText: '' };
    const { from, to, empty } = e.state.selection;
    const quotedText = empty ? '' : e.state.doc.textBetween(from, to, ' ');
    return { range: { from, to }, empty, quotedText };
  }

  onSelectionChange(cb: (s: SelectionInfo) => void) {
    this.selectionListeners.add(cb);
    return () => this.selectionListeners.delete(cb);
  }

  // ---- comments ----

  listComments() {
    return this.comments;
  }

  addComment(input: { body: string; range: DocRange; authorId: string }): Comment | null {
    const e = this.editor;
    if (!e) return null;
    const author = AUTHORS[input.authorId] ?? AUTHORS.alex;
    const id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const quotedText = e.state.doc.textBetween(input.range.from, input.range.to, ' ');
    const comment: Comment = {
      id,
      author,
      body: input.body,
      createdAt: new Date().toISOString(),
      resolved: false,
      range: input.range,
      quotedText,
    };
    this.comments = [...this.comments, comment];
    // Anchor the comment to the range by applying the comment mark.
    e.chain()
      .setTextSelection(input.range)
      .setMark('comment', { commentId: id })
      .setTextSelection(input.range.to)
      .run();
    this.emitComments();
    return comment;
  }

  updateComment(id: string, patch: { body?: string; resolved?: boolean }) {
    this.comments = this.comments.map((c) => (c.id === id ? { ...c, ...patch } : c));
    this.emitComments();
  }

  deleteComment(id: string) {
    this.comments = this.comments.filter((c) => c.id !== id);
    // Remove the mark from the document
    const e = this.editor;
    if (e) {
      const { doc, tr } = e.state;
      const markType = e.schema.marks.comment;
      doc.descendants((node, pos) => {
        if (!node.isText) return;
        node.marks.forEach((m) => {
          if (m.type === markType && m.attrs.commentId === id) {
            tr.removeMark(pos, pos + node.nodeSize, markType);
          }
        });
      });
      e.view.dispatch(tr);
    }
    this.emitComments();
  }

  onCommentsChange(cb: (comments: Comment[]) => void) {
    this.commentListeners.add(cb);
    return () => this.commentListeners.delete(cb);
  }

  // ---- navigation ----

  scrollToChange(_changeId: string): void {
    // TipTap has no tracked-changes support in this app (no mocks), so
    // there is nothing to scroll to. Left as a no-op intentionally.
  }

  scrollToComment(commentId: string): void {
    // Comments are anchored by our custom `comment` mark. Walk the doc
    // to find the id, then scroll the element into view. This is a
    // TipTap-specific implementation; the shared sidebar treats
    // `scrollToComment` as an opaque editor capability.
    const editor = this.editor;
    if (!editor) return;
    const markType = editor.schema.marks.comment;
    let from: number | null = null;
    let to: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) return true;
      const hasMark = node.marks.some((m) => m.type === markType && m.attrs.commentId === commentId);
      if (hasMark) {
        if (from == null) from = pos;
        to = pos + node.nodeSize;
      }
      return true;
    });
    if (from == null || to == null) return;

    const host = editor.view.dom.closest('.doc-host');
    if (!(host instanceof HTMLElement)) return;
    try {
      const rect = editor.view.coordsAtPos(from);
      const hostRect = host.getBoundingClientRect();
      if (rect.top < hostRect.top || rect.bottom > hostRect.bottom) {
        host.scrollBy({ top: rect.top - hostRect.top - 80, behavior: 'smooth' });
      }
    } catch {
      /* view may not have laid out yet — no scroll is fine */
    }
  }

  // ---- track changes ----
  // TipTap has no built-in track changes; we mock an in-memory store so the
  // shared sidebar UI can be developed against the same interface. A real
  // consumer would swap in @tiptap-pro/extension-track-changes or similar.

  private tracking = false;
  private trackedChanges: TrackedChange[] = [];
  private trackedChangeListeners = new Set<(c: TrackedChange[]) => void>();

  isTrackingChanges() { return this.tracking; }
  setTrackingChanges(enabled: boolean) { this.tracking = enabled; }

  listTrackedChanges() { return this.trackedChanges; }

  acceptChange(id: string) {
    this.trackedChanges = this.trackedChanges.filter((c) => c.id !== id);
    this.emitTrackedChanges();
  }

  rejectChange(id: string) {
    this.trackedChanges = this.trackedChanges.filter((c) => c.id !== id);
    this.emitTrackedChanges();
  }

  onTrackedChangesChange(cb: (changes: TrackedChange[]) => void) {
    this.trackedChangeListeners.add(cb);
    return () => this.trackedChangeListeners.delete(cb);
  }

  private emitTrackedChanges() {
    this.trackedChangeListeners.forEach((cb) => cb(this.trackedChanges));
  }

  // ---- internals ----

  private emitToolbar() {
    const s = this.getToolbarState();
    this.toolbarListeners.forEach((cb) => cb(s));
  }
  private emitSelection() {
    const s = this.getSelection();
    this.selectionListeners.forEach((cb) => cb(s));
  }
  private emitComments() {
    const list = this.comments;
    this.commentListeners.forEach((cb) => cb(list));
  }

  private emptyToolbarState(): ToolbarState {
    const ids: ToolbarCommandId[] = [
      'bold', 'italic', 'underline', 'strike', 'highlight',
      'h1', 'h2', 'bullet-list', 'ordered-list', 'link',
    ];
    return Object.fromEntries(ids.map((id) => [id, { active: false, disabled: true }])) as ToolbarState;
  }
}
