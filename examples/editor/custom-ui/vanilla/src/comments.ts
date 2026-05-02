/**
 * Custom comments sidebar.
 *
 * Mirrors `demos/custom-ui/src/components/ActivitySidebar.tsx` but
 * without React. The render strategy is a re-render of the panel's
 * inner HTML on every snapshot change. Overkill for a real product,
 * fine for a demo, and makes the data flow easy to follow.
 *
 * The composer is the load-bearing piece: it freezes the editor
 * selection at mount via `ui.selection.capture()` and submits the
 * comment with `ui.comments.createFromCapture`, so focus moving into
 * the textarea doesn't lose the anchor.
 */

import type { CommentsListResult, CommentsSlice, SelectionCapture, SuperDocUI } from 'superdoc/ui';
import { Disposer } from './bind';

type CommentItem = CommentsListResult['items'][number];

interface MountOpts {
  activityEl: HTMLElement;
  composerMountEl: HTMLElement;
  ui: SuperDocUI;
  disposer: Disposer;
}

export interface ActivityHandle {
  openComposer(): void;
}

export function mountActivitySidebar({ activityEl, composerMountEl, ui, disposer }: MountOpts): ActivityHandle {
  let composerCleanup: (() => void) | null = null;
  let lastCommentsSnapshot: CommentsSlice | null = null;

  const renderActivity = () => {
    const slice = lastCommentsSnapshot;
    activityEl.innerHTML = '';

    const root = activityEl;
    if (!slice || slice.items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'card empty';
      empty.textContent = 'No comments yet. Select text and click 💬 to add one.';
      root.appendChild(empty);
      return;
    }

    const { active, resolved, repliesByParent } = partitionComments(slice.items);

    if (active.length > 0) {
      root.appendChild(sectionLabel(`Active · ${active.length}`));
      for (const comment of active) {
        root.appendChild(renderCommentCard(comment, slice.activeIds, repliesByParent.get(comment.id), false, ui));
      }
    }

    if (resolved.length > 0) {
      root.appendChild(sectionLabel(`Resolved · ${resolved.length}`, true));
      for (const comment of resolved) {
        root.appendChild(renderCommentCard(comment, slice.activeIds, repliesByParent.get(comment.id), true, ui));
      }
    }
  };

  // Subscribe to the comments slice. Renders once on mount with the
  // initial snapshot, then on every change.
  disposer.add(
    ui.comments.subscribe(({ snapshot }) => {
      lastCommentsSnapshot = snapshot;
      renderActivity();
    }),
  );

  // Active-card highlight tracks the selection, but we read it inside
  // the comment renderer instead of subscribing here a second time.

  const closeComposer = () => {
    composerMountEl.innerHTML = '';
    if (composerCleanup) {
      composerCleanup();
      composerCleanup = null;
    }
  };

  const openComposer = () => {
    closeComposer();
    composerCleanup = renderComposer({ mountEl: composerMountEl, ui, onClose: closeComposer });
  };

  // Tear down composer if mounted at HMR / unload.
  disposer.add(() => closeComposer());

  return { openComposer };
}

interface ComposerOpts {
  mountEl: HTMLElement;
  ui: SuperDocUI;
  onClose(): void;
}

function renderComposer({ mountEl, ui, onClose }: ComposerOpts): () => void {
  // Capture the live selection BEFORE the composer takes focus.
  // `ui.selection.capture()` returns a frozen snapshot that survives
  // the textarea steal-focus that follows.
  const capture: SelectionCapture | null = ui.selection.capture();

  const composer = document.createElement('div');
  composer.className = 'composer';

  const quote = document.createElement('div');
  quote.className = 'composer-quote';
  if (capture?.quotedText) {
    quote.textContent = `“${capture.quotedText}”`;
  } else {
    quote.innerHTML = '<em>No selection</em>';
  }

  const textarea = document.createElement('textarea');
  textarea.className = 'composer-input';
  textarea.rows = 3;
  textarea.placeholder = 'Write a comment…';

  const actions = document.createElement('div');
  actions.className = 'composer-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';

  const postBtn = document.createElement('button');
  postBtn.className = 'primary';
  postBtn.textContent = 'Comment';
  postBtn.disabled = true;

  actions.append(cancelBtn, postBtn);
  composer.append(quote, textarea, actions);
  mountEl.appendChild(composer);

  textarea.focus();

  const onInput = () => {
    postBtn.disabled = !capture || textarea.value.trim().length === 0;
  };
  textarea.addEventListener('input', onInput);

  const post = () => {
    if (!capture || textarea.value.trim().length === 0) return;
    postBtn.disabled = true;
    postBtn.textContent = 'Posting…';
    try {
      const receipt = ui.comments.createFromCapture(capture, { text: textarea.value.trim() });
      if (!receipt.success) {
        console.error('[vanilla] comments.createFromCapture rejected', receipt);
      }
      onClose();
    } catch (err) {
      console.error('[vanilla] createFromCapture threw', err);
      postBtn.disabled = false;
      postBtn.textContent = 'Comment';
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') post();
    if (e.key === 'Escape') onClose();
  };
  textarea.addEventListener('keydown', onKey);

  cancelBtn.addEventListener('click', onClose);
  postBtn.addEventListener('click', post);

  return () => {
    textarea.removeEventListener('input', onInput);
    textarea.removeEventListener('keydown', onKey);
  };
}

interface PartitionedComments {
  active: CommentItem[];
  resolved: CommentItem[];
  repliesByParent: Map<string, CommentItem[]>;
}

function partitionComments(items: CommentItem[]): PartitionedComments {
  const active: CommentItem[] = [];
  const resolved: CommentItem[] = [];
  const repliesByParent = new Map<string, CommentItem[]>();

  // First pass: collect roots vs. replies.
  for (const c of items) {
    if (c.parentCommentId) {
      const list = repliesByParent.get(c.parentCommentId) ?? [];
      list.push(c);
      repliesByParent.set(c.parentCommentId, list);
    }
  }

  // Second pass: bucket roots into active vs. resolved.
  for (const c of items) {
    if (c.parentCommentId) continue; // replies live under their parent
    if (c.status === 'resolved') resolved.push(c);
    else active.push(c);
  }

  return { active, resolved, repliesByParent };
}

function sectionLabel(text: string, muted = false): HTMLElement {
  const el = document.createElement('div');
  el.className = 'activity-section-label' + (muted ? ' muted' : '');
  el.textContent = text;
  return el;
}

function renderCommentCard(
  comment: CommentItem,
  activeIds: string[],
  replies: CommentItem[] | undefined,
  resolved: boolean,
  ui: SuperDocUI,
): HTMLElement {
  const card = document.createElement('div');
  const isActive = activeIds.includes(comment.id);
  card.className = 'card' + (isActive ? ' active' : '') + (resolved ? ' resolved' : '');
  card.dataset.cardId = comment.id;

  card.addEventListener('click', () => {
    void ui.comments.scrollTo(comment.id);
  });

  // Header
  const author = comment.creatorName ?? comment.creatorEmail ?? 'Unknown';
  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = `
    <span class="avatar" style="background: ${avatarColor(author)}">${initials(author)}</span>
    <span class="author">${escapeHtml(author)}</span>
  `;
  card.appendChild(header);

  if (comment.anchoredText) {
    const quote = document.createElement('div');
    quote.className = 'quote';
    quote.textContent = `“${comment.anchoredText}”`;
    card.appendChild(quote);
  }

  const body = document.createElement('div');
  body.className = 'body';
  body.textContent = comment.text ?? '';
  card.appendChild(body);

  if (replies && replies.length > 0) {
    const list = document.createElement('ul');
    list.className = 'thread-replies';
    for (const reply of replies) {
      const rAuthor = reply.creatorName ?? reply.creatorEmail ?? 'Unknown';
      const li = document.createElement('li');
      li.className = 'thread-reply';
      li.innerHTML = `
        <span class="avatar avatar-sm" style="background: ${avatarColor(rAuthor)}">${initials(rAuthor)}</span>
        <div class="thread-reply-body">
          <span class="author">${escapeHtml(rAuthor)}</span>
          <span class="thread-reply-text">${escapeHtml(reply.text ?? '')}</span>
        </div>
      `;
      list.appendChild(li);
    }
    card.appendChild(list);
  }

  // Actions row. Stop the click from bubbling to the card-level
  // scroll handler.
  const actions = document.createElement('div');
  actions.className = 'card-actions';
  actions.addEventListener('click', (e) => e.stopPropagation());

  if (resolved) {
    const reopen = button('Reopen', 'primary', () => ui.comments.reopen(comment.id));
    actions.appendChild(reopen);
  } else {
    const resolve = button('Resolve', '', () => ui.comments.resolve(comment.id));
    const reply = button('Reply', '', () => openInlineReply(card, comment.id, ui));
    actions.append(resolve, reply);
  }
  card.appendChild(actions);

  return card;
}

function openInlineReply(card: HTMLElement, parentId: string, ui: SuperDocUI): void {
  if (card.querySelector('.reply-composer')) return;
  const wrap = document.createElement('div');
  wrap.className = 'reply-composer';
  wrap.addEventListener('click', (e) => e.stopPropagation());

  const ta = document.createElement('textarea');
  ta.className = 'reply-input';
  ta.rows = 2;
  ta.placeholder = 'Write a reply…';

  const row = document.createElement('div');
  row.className = 'reply-actions';
  const cancel = button('Cancel', '', () => wrap.remove());
  const send = button('Reply', 'primary', () => {
    const text = ta.value.trim();
    if (!text) return;
    const receipt = ui.comments.reply(parentId, { text });
    if (receipt.success) wrap.remove();
    else console.error('[vanilla] reply rejected', receipt);
  });
  send.disabled = true;
  ta.addEventListener('input', () => {
    send.disabled = ta.value.trim().length === 0;
  });
  ta.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send.click();
    if (e.key === 'Escape') cancel.click();
  });
  row.append(cancel, send);
  wrap.append(ta, row);
  card.appendChild(wrap);
  ta.focus();
}

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  if (cls) b.className = cls;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function avatarColor(key: string): string {
  const palette = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) & 0x7fffffff;
  return palette[hash % palette.length]!;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;',
  );
}
