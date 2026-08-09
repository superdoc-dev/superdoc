import { SuperDoc } from 'superdoc';
import type { TrackChangesSlice } from 'superdoc/ui';
import 'superdoc/style.css';

const changeList = document.querySelector<HTMLUListElement>('#change-list');
const reviewStatus = document.querySelector<HTMLParagraphElement>('#review-status');

if (!changeList || !reviewStatus) {
  throw new Error('The tracked-change review UI is incomplete.');
}

let stopTrackChanges: (() => void) | null = null;

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  documentMode: 'suggesting',
  user: {
    name: 'Alex Rivera',
    email: 'alex@example.com',
  },
  onReady: ({ superdoc: readySuperDoc }) => {
    const ui = readySuperDoc.ui;

    const focusChange = async (id: string) => {
      if (!ui.trackChanges.setActive(id)) {
        reviewStatus.textContent = 'The tracked change is no longer available.';
        return;
      }

      const result = await ui.trackChanges.scrollTo(id);
      if (!result.success) {
        reviewStatus.textContent = result.reason ?? 'The tracked change could not be shown.';
      }
    };

    const decideChange = async (decision: 'acceptChange' | 'rejectChange', id: string) => {
      const result = await ui.commands.executeAsync(decision, { id });

      if (result === false) {
        reviewStatus.textContent = 'The review decision is unavailable.';
        return;
      }

      if (typeof result === 'object' && !result.success) {
        reviewStatus.textContent = result.failure.message;
        return;
      }

      reviewStatus.textContent = decision === 'acceptChange' ? 'Change accepted.' : 'Change rejected.';
    };

    const render = (changes: TrackChangesSlice) => {
      changeList.replaceChildren();
      reviewStatus.textContent =
        changes.status === 'pending' ? 'Loading tracked changes…' : `${changes.total} open changes`;

      for (const change of changes.items) {
        const row = document.createElement('li');
        const summary = document.createElement('span');
        const show = document.createElement('button');
        const accept = document.createElement('button');
        const reject = document.createElement('button');

        const detail = change.excerpt ?? change.insertedText ?? change.deletedText ?? change.type;
        summary.textContent = `${detail}${change.author ? ` by ${change.author}` : ''}`;

        show.type = 'button';
        show.textContent = changes.activeId === change.id ? 'Showing' : 'Show';
        show.addEventListener('click', () => void focusChange(change.id));

        accept.type = 'button';
        accept.textContent = 'Accept';
        accept.addEventListener('click', () => void decideChange('acceptChange', change.id));

        reject.type = 'button';
        reject.textContent = 'Reject';
        reject.addEventListener('click', () => void decideChange('rejectChange', change.id));

        row.append(summary, show, accept, reject);
        changeList.append(row);
      }
    };

    stopTrackChanges = ui.trackChanges.observe(render);
  },
});

window.addEventListener('beforeunload', () => {
  stopTrackChanges?.();
  superdoc.destroy();
});
