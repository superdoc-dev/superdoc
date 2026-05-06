/**
 * The smallest example that proves why `ui.selection.capture()` exists.
 *
 * The problem: a comment composer cannot read the live selection at
 * submit time. The textarea takes focus the moment the composer
 * opens; the editor's live selection visually clears. By the time
 * the user types and clicks Post, `ui.selection.getSnapshot()`
 * returns null.
 *
 * The fix: `ui.selection.capture()` returns a frozen snapshot of the
 * selection at composer-open time. Hold it across the user's typing.
 * Pass it to `ui.comments.createFromCapture(capture, { text })` at
 * submit. The new comment anchors against the original selection
 * regardless of where focus has moved.
 *
 * This example shows that flow and nothing else. No threading, no
 * resolve / reopen / reply, no toolbar, no mode toggle. For the
 * full Custom UI surface, see `demos/custom-ui` (React).
 */

import { SuperDoc } from 'superdoc';
import { createSuperDocUI } from 'superdoc/ui';
import 'superdoc/style.css';
import './style.css';

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/test_file.docx',
  documentMode: 'editing',
  user: { name: 'Alex', email: 'alex@example.com' },
  modules: { comments: false }, // disable built-in comments UI; we render our own
});

const ui = createSuperDocUI({ superdoc });
const scope = ui.createScope();

const addBtn = document.querySelector<HTMLButtonElement>('#add-comment')!;
const composerMount = document.querySelector<HTMLElement>('#composer-mount')!;
const list = document.querySelector<HTMLUListElement>('#comments')!;

// Enable the Add button only when the editor has a positional
// selection. `selection.observe` fires once with the initial state
// and then on every selection change.
scope.add(
  ui.selection.observe((sel) => {
    addBtn.disabled = sel.empty || sel.selectionTarget == null;
  }),
);

addBtn.addEventListener('click', () => {
  // Capture NOW, before the textarea steals focus.
  const capture = ui.selection.capture();
  if (!capture) return;

  composerMount.innerHTML = `
    <div class="composer">
      <div class="quote">${capture.quotedText ? `"${esc(capture.quotedText)}"` : '<em>No text selected</em>'}</div>
      <textarea autofocus placeholder="Comment on the selection…"></textarea>
      <div class="actions">
        <button data-action="cancel">Cancel</button>
        <button data-action="post" class="primary" disabled>Post</button>
      </div>
    </div>
  `;

  const ta = composerMount.querySelector<HTMLTextAreaElement>('textarea')!;
  const post = composerMount.querySelector<HTMLButtonElement>('button[data-action="post"]')!;
  const cancel = composerMount.querySelector<HTMLButtonElement>('button[data-action="cancel"]')!;

  ta.addEventListener('input', () => {
    post.disabled = ta.value.trim().length === 0;
  });
  ta.focus();

  cancel.addEventListener('click', close);
  post.addEventListener('click', () => {
    const text = ta.value.trim();
    if (!text) return;
    // The captured snapshot still has the original anchor; the live
    // selection has been gone since the textarea took focus.
    const receipt = ui.comments.createFromCapture(capture, { text });
    if (!receipt.success) console.error('[selection-capture] create failed', receipt);
    close();
  });
});

function close(): void {
  composerMount.innerHTML = '';
}

// Render the comments list. One subscription, plain DOM.
scope.add(
  ui.comments.observe((snapshot) => {
    list.innerHTML = '';
    if (snapshot.items.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'No comments yet. Select text and click Add.';
      list.appendChild(empty);
      return;
    }
    for (const c of snapshot.items) {
      const li = document.createElement('li');
      li.className = 'card';
      li.innerHTML = `
        ${c.anchoredText ? `<div class="quote">"${esc(c.anchoredText)}"</div>` : ''}
        <div class="body">${esc(c.text ?? '')}</div>
      `;
      list.appendChild(li);
    }
  }),
);

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}

const teardown = () => {
  ui.destroy();
  superdoc.destroy();
};
window.addEventListener('beforeunload', teardown);
if (import.meta.hot) import.meta.hot.dispose(teardown);
