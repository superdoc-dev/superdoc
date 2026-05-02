/**
 * Tracked-changes review panel.
 *
 * Subscribes to `ui.trackChanges` and renders one card per item with
 * Accept / Reject. Adds an "Accept all" / "Reject all" header and
 * Prev / Next navigation that drive the controller's `activeId`.
 *
 * Independent of comments on purpose: the controller exposes the two
 * as separate slices so consumers decide whether to merge. Vanilla
 * demo keeps them separate to show the wiring is independent — a
 * Google-Docs-style merged Activity feed is a renderer choice, not a
 * controller capability gap.
 */

import type { TrackChangeInfo, TrackChangesSlice, SuperDocUI } from 'superdoc/ui';
import { Disposer } from './bind';

interface MountOpts {
  panelEl: HTMLElement;
  ui: SuperDocUI;
  disposer: Disposer;
}

export function mountTrackChangesPanel({ panelEl, ui, disposer }: MountOpts): void {
  const render = (snapshot: TrackChangesSlice) => {
    panelEl.innerHTML = '';

    if (snapshot.items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'card empty';
      empty.textContent = 'No tracked changes. Switch to Suggest mode and edit to record some.';
      panelEl.appendChild(empty);
      return;
    }

    panelEl.appendChild(headerRow(snapshot, ui));

    for (const item of snapshot.items) {
      panelEl.appendChild(renderChangeCard(item.id, item.change, snapshot.activeId, ui));
    }
  };

  disposer.add(
    ui.trackChanges.subscribe(({ snapshot }) => render(snapshot)),
  );
}

function headerRow(snapshot: TrackChangesSlice, ui: SuperDocUI): HTMLElement {
  const row = document.createElement('div');
  row.className = 'tc-header';

  const counter = document.createElement('span');
  counter.className = 'tc-counter';
  counter.textContent = `${snapshot.items.length} change${snapshot.items.length === 1 ? '' : 's'}`;
  row.appendChild(counter);

  const spacer = document.createElement('span');
  spacer.style.flex = '1';
  row.appendChild(spacer);

  row.appendChild(button('Prev', '', () => {
    const id = ui.trackChanges.previous();
    if (id) void ui.trackChanges.scrollTo(id);
  }));
  row.appendChild(button('Next', '', () => {
    const id = ui.trackChanges.next();
    if (id) void ui.trackChanges.scrollTo(id);
  }));
  row.appendChild(button('Reject all', 'danger', () => ui.trackChanges.rejectAll()));
  row.appendChild(button('Accept all', 'primary', () => ui.trackChanges.acceptAll()));

  return row;
}

function renderChangeCard(id: string, change: TrackChangeInfo, activeId: string | null, ui: SuperDocUI): HTMLElement {
  const card = document.createElement('div');
  const isActive = id === activeId;
  card.className = 'card' + (isActive ? ' active' : '');
  card.dataset.cardId = id;

  card.addEventListener('click', () => {
    void ui.trackChanges.scrollTo(id);
  });

  const kind: 'insertion' | 'deletion' | 'format' =
    change.type === 'insert' ? 'insertion' : change.type === 'delete' ? 'deletion' : 'format';
  const author = change.author ?? change.authorEmail ?? 'Unknown';

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = `
    <span class="change-badge ${kind}">${kind}</span>
    <span class="author">${escapeHtml(author)}</span>
  `;
  card.appendChild(header);

  if (change.excerpt) {
    const quote = document.createElement('div');
    quote.className = 'quote';
    quote.textContent = `“${change.excerpt}”`;
    card.appendChild(quote);
  }

  const actions = document.createElement('div');
  actions.className = 'card-actions';
  actions.addEventListener('click', (e) => e.stopPropagation());

  actions.appendChild(button('Accept', 'primary', () => ui.trackChanges.accept(id)));
  actions.appendChild(button('Reject', 'danger', () => ui.trackChanges.reject(id)));
  card.appendChild(actions);

  return card;
}

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  if (cls) b.className = cls;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;',
  );
}
