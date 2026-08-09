import { SuperDoc } from 'superdoc';
import type { WorkflowActionResult } from 'superdoc/ui';
import 'superdoc/style.css';

const query = document.querySelector<HTMLInputElement>('#search-query');
const matchCase = document.querySelector<HTMLInputElement>('#match-case');
const previous = document.querySelector<HTMLButtonElement>('#previous-match');
const next = document.querySelector<HTMLButtonElement>('#next-match');
const count = document.querySelector<HTMLOutputElement>('#search-count');
const replacement = document.querySelector<HTMLInputElement>('#replacement');
const replace = document.querySelector<HTMLButtonElement>('#replace-match');
const replaceAll = document.querySelector<HTMLButtonElement>('#replace-all');
const status = document.querySelector<HTMLParagraphElement>('#search-status');

if (!query || !matchCase || !previous || !next || !count || !replacement || !replace || !replaceAll || !status) {
  throw new Error('The search UI is incomplete.');
}

let stopSearch: (() => void) | null = null;
let removeHandlers: (() => void) | null = null;

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  onReady: ({ superdoc: readySuperDoc }) => {
    const ui = readySuperDoc.ui;

    const render = (search: ReturnType<typeof ui.search.getSnapshot>) => {
      const hasMatches = search.total > 0;
      previous.disabled = !hasMatches;
      next.disabled = !hasMatches;
      replace.disabled = !search.canReplace;
      replaceAll.disabled = !search.canReplace;
      count.textContent = hasMatches ? `${search.activeIndex + 1} of ${search.total}` : 'No matches';
      status.textContent = search.reason ?? '';
    };

    const runSearch = () => {
      if (!query.value) {
        ui.search.clear();
        return;
      }

      const opened = ui.search.open();
      if (!opened.ok) {
        status.textContent = opened.reason ?? 'Search is unavailable.';
        return;
      }

      render(ui.search.search(query.value, { caseSensitive: matchCase.checked }));
    };

    const reportAction = (result: WorkflowActionResult) => {
      if (!result.ok) status.textContent = result.reason ?? 'The search action did not run.';
    };

    const replaceCurrent = async () => {
      reportAction(await ui.search.replace(replacement.value));
    };

    const replaceEveryMatch = async () => {
      reportAction(await ui.search.replaceAll(replacement.value));
    };

    const goPrevious = () => reportAction(ui.search.previous());
    const goNext = () => reportAction(ui.search.next());

    render(ui.search.getSnapshot());
    stopSearch = ui.search.observe(render);
    query.addEventListener('input', runSearch);
    matchCase.addEventListener('change', runSearch);
    previous.addEventListener('click', goPrevious);
    next.addEventListener('click', goNext);
    replace.addEventListener('click', replaceCurrent);
    replaceAll.addEventListener('click', replaceEveryMatch);

    removeHandlers = () => {
      query.removeEventListener('input', runSearch);
      matchCase.removeEventListener('change', runSearch);
      previous.removeEventListener('click', goPrevious);
      next.removeEventListener('click', goNext);
      replace.removeEventListener('click', replaceCurrent);
      replaceAll.removeEventListener('click', replaceEveryMatch);
    };
  },
});

window.addEventListener('beforeunload', () => {
  stopSearch?.();
  removeHandlers?.();
  superdoc.destroy();
});
