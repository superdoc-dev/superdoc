/**
 * Custom tracked-changes review panel (vanilla TypeScript), single file.
 *
 * Patterns to notice:
 *
 *   - `ui.trackChanges.observe(snapshot => ...)` drives the panel
 *     list AND the bulk-action enable state from one subscription.
 *     The snapshot carries `items`, `total`, and `activeId`.
 *   - `ui.trackChanges.accept(id) / .reject(id)` resolve one change.
 *     `.acceptAll() / .rejectAll()` are the bulk verbs.
 *     `.next() / .previous() / .scrollTo(id)` drive navigation;
 *     `activeId` reflects whichever change is under the cursor.
 *   - `ui.document.observe + setMode('editing' | 'suggesting')` lets
 *     the user toggle between editing normally and recording each
 *     edit as a tracked change. Without Suggest mode, the panel is
 *     empty by design.
 *   - `ui.createScope()` collects every subscription so the whole
 *     surface tears down cleanly on `ui.destroy()`.
 *
 * `trackChanges.replacements: 'independent'` tells the engine to
 * surface a typed-over selection as two separate review items
 * (insert + delete) instead of one composite. Matches what most
 * review UIs want to render.
 */

import { SuperDoc } from 'superdoc';
import { createSuperDocUI, type TrackChangesSlice } from 'superdoc/ui';
import 'superdoc/style.css';
import './style.css';

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/test_file.docx',
  documentMode: 'suggesting',
  user: { name: 'Alex Rivera', email: 'alex@example.com' },
  modules: { trackChanges: { replacements: 'independent' } },
});

const ui = createSuperDocUI({ superdoc });
const scope = ui.createScope();

const modeEl = document.querySelector<HTMLElement>('#mode-toggle')!;
const list = document.querySelector<HTMLUListElement>('#changes')!;
const prevBtn = document.querySelector<HTMLButtonElement>('#prev')!;
const nextBtn = document.querySelector<HTMLButtonElement>('#next')!;
const acceptAllBtn = document.querySelector<HTMLButtonElement>('#accept-all')!;
const rejectAllBtn = document.querySelector<HTMLButtonElement>('#reject-all')!;

// Edit / Suggest toggle. ui.document carries `mode`; setMode flips
// the routed editor and fires the same `document-mode-change` event
// the React wrapper consumes.
modeEl.innerHTML = `
  <button data-mode="editing">Edit</button>
  <button data-mode="suggesting">Suggest</button>
`;
modeEl.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-mode]');
  if (!t) return;
  ui.document.setMode(t.dataset.mode as 'editing' | 'suggesting');
});
scope.add(
  ui.document.observe((doc) => {
    modeEl.querySelectorAll<HTMLButtonElement>('button[data-mode]').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === doc.mode);
      b.disabled = !doc.ready;
    });
  }),
);

// Bulk action wiring.
prevBtn.addEventListener('click', () => {
  const id = ui.trackChanges.previous();
  if (id) void ui.trackChanges.scrollTo(id);
});
nextBtn.addEventListener('click', () => {
  const id = ui.trackChanges.next();
  if (id) void ui.trackChanges.scrollTo(id);
});
acceptAllBtn.addEventListener('click', () => ui.trackChanges.acceptAll());
rejectAllBtn.addEventListener('click', () => ui.trackChanges.rejectAll());

// One subscription drives the list AND the bulk-action enable state.
scope.add(
  ui.trackChanges.observe((snapshot) => render(snapshot)),
);

function render(snapshot: TrackChangesSlice): void {
  const empty = snapshot.items.length === 0;
  prevBtn.disabled = empty;
  nextBtn.disabled = empty;
  acceptAllBtn.disabled = empty;
  rejectAllBtn.disabled = empty;

  list.innerHTML = '';
  if (empty) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No tracked changes. Switch to Suggest mode and edit the document.';
    list.appendChild(li);
    return;
  }

  for (const { id, change } of snapshot.items) {
    const kind = change.type === 'insert' ? 'insertion' : change.type === 'delete' ? 'deletion' : 'format';
    const author = change.author ?? change.authorEmail ?? 'Unknown';
    const li = document.createElement('li');
    li.className = `card${id === snapshot.activeId ? ' active' : ''}`;
    li.dataset.id = id;
    li.innerHTML = `
      <span class="kind ${kind}">${kind}</span>
      <div class="author">${escape(author)}</div>
      ${change.excerpt ? `<div class="excerpt">"${escape(change.excerpt)}"</div>` : ''}
      <div class="actions">
        <button data-action="accept" class="primary">Accept</button>
        <button data-action="reject" class="danger">Reject</button>
      </div>
    `;
    li.addEventListener('click', () => void ui.trackChanges.scrollTo(id));
    li.querySelector('[data-action="accept"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      ui.trackChanges.accept(id);
    });
    li.querySelector('[data-action="reject"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      ui.trackChanges.reject(id);
    });
    list.appendChild(li);
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}

const teardown = () => {
  ui.destroy();
  superdoc.destroy();
};
window.addEventListener('beforeunload', teardown);
if (import.meta.hot) import.meta.hot.dispose(teardown);
