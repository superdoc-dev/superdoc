/**
 * Custom comments sidebar (vanilla TypeScript), single file.
 *
 * The load-bearing pattern is `ui.selection.capture()`:
 *
 *   The user selects text, clicks Add comment, the textarea takes
 *   focus, and the editor's live selection visually clears. A
 *   composer that read the live selection at submit time would see
 *   `null` and refuse the create. `capture()` returns a frozen
 *   snapshot at the moment the composer opens, so
 *   `comments.createFromCapture(capture, { text })` anchors the new
 *   comment against the original selection regardless of where focus
 *   moves afterwards.
 *
 * The other patterns:
 *
 *   - `ui.comments.observe(snapshot => ...)` drives the sidebar list
 *     from a single subscription. No event-wrapped shape.
 *   - `ui.comments.resolve / .reopen / .reply` route through the
 *     same Document API that powers DOCX import / export, so changes
 *     made here round-trip through Word.
 *   - `ui.createScope()` collects every subscription so the whole
 *     surface tears down cleanly on `ui.destroy()`.
 */

import { SuperDoc } from 'superdoc';
import { createSuperDocUI, type CommentsSlice, type SelectionCapture } from 'superdoc/ui';
import 'superdoc/style.css';
import './style.css';

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/test_file.docx',
  documentMode: 'editing',
  user: { name: 'Alex Rivera', email: 'alex@example.com' },
  modules: { comments: false }, // disable built-in comments UI; we render our own
});

const ui = createSuperDocUI({ superdoc });
const scope = ui.createScope();

// DOM handles the example writes into.
const addBtn = document.querySelector<HTMLButtonElement>('#add-comment')!;
const composerMount = document.querySelector<HTMLElement>('#composer-mount')!;
const list = document.querySelector<HTMLUListElement>('#comments')!;

// Add-comment button is enabled only when the editor has a real
// positional selection. `ui.selection.observe` fires once
// synchronously and again on every selection change.
scope.add(
  ui.selection.observe((sel) => {
    addBtn.disabled = sel.empty || sel.selectionTarget == null;
  }),
);

// The composer mounts only when the user clicks Add comment, and
// captures the selection at that moment.
addBtn.addEventListener('click', () => openComposer());

function openComposer(): void {
  // Capture the selection NOW. The textarea will steal focus next.
  const capture = ui.selection.capture();
  if (!capture) return;

  composerMount.innerHTML = `
    <div class="composer">
      <div class="quote">${capture.quotedText ? `"${escape(capture.quotedText)}"` : '<em>No text selection</em>'}</div>
      <textarea autofocus placeholder="Write a comment…"></textarea>
      <div class="actions">
        <button data-action="cancel">Cancel</button>
        <button data-action="post" class="primary" disabled>Post</button>
      </div>
    </div>
  `;

  const ta = composerMount.querySelector<HTMLTextAreaElement>('textarea')!;
  const postBtn = composerMount.querySelector<HTMLButtonElement>('button[data-action="post"]')!;
  const cancelBtn = composerMount.querySelector<HTMLButtonElement>('button[data-action="cancel"]')!;

  ta.addEventListener('input', () => {
    postBtn.disabled = ta.value.trim().length === 0;
  });
  ta.focus();

  cancelBtn.addEventListener('click', closeComposer);
  postBtn.addEventListener('click', () => post(capture, ta.value));
}

function closeComposer(): void {
  composerMount.innerHTML = '';
}

function post(capture: SelectionCapture, raw: string): void {
  const text = raw.trim();
  if (!text) return;
  const receipt = ui.comments.createFromCapture(capture, { text });
  if (!receipt.success) {
    console.error('[comments] create failed', receipt);
    return;
  }
  closeComposer();
}

// Render the sidebar from the comments slice. One subscription, the
// whole list re-renders when the snapshot changes. For a real product
// you'd diff DOM; this example optimises for clarity.
scope.add(
  ui.comments.observe((snapshot) => renderComments(snapshot)),
);

function renderComments(snapshot: CommentsSlice): void {
  list.innerHTML = '';
  if (snapshot.items.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No comments yet. Select text and click Add comment.';
    list.appendChild(empty);
    return;
  }
  for (const c of snapshot.items) {
    if (c.parentCommentId) continue; // replies render under their root, below
    const li = document.createElement('li');
    li.className = `card${c.status === 'resolved' ? ' resolved' : ''}`;
    li.innerHTML = `
      <div class="author">${escape(c.creatorName ?? c.creatorEmail ?? 'Unknown')}</div>
      ${c.anchoredText ? `<div class="quote">"${escape(c.anchoredText)}"</div>` : ''}
      <div class="body">${escape(c.text ?? '')}</div>
      <div class="actions">
        ${c.status === 'resolved'
          ? `<button data-action="reopen" class="primary">Reopen</button>`
          : `<button data-action="resolve">Resolve</button><button data-action="reply">Reply</button>`}
      </div>
    `;
    li.querySelector('[data-action="resolve"]')?.addEventListener('click', () => ui.comments.resolve(c.id));
    li.querySelector('[data-action="reopen"]')?.addEventListener('click', () => ui.comments.reopen(c.id));
    li.querySelector('[data-action="reply"]')?.addEventListener('click', () => {
      const text = window.prompt('Reply:');
      if (text?.trim()) ui.comments.reply(c.id, { text: text.trim() });
    });
    list.appendChild(li);
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}

// One teardown for the whole app. ui.destroy() cascades into the scope.
const teardown = () => {
  ui.destroy();
  superdoc.destroy();
};
window.addEventListener('beforeunload', teardown);
if (import.meta.hot) import.meta.hot.dispose(teardown);
