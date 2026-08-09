import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const boldButton = document.querySelector<HTMLButtonElement>('#bold');
if (!boldButton) throw new Error('The Bold button is missing.');

let stopObserving: (() => void) | null = null;
let removeClickHandler: (() => void) | null = null;

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  // This page's Bold button replaces one toolbar control, so the built-in
  // toolbar is the only surface turned off.
  ui: { toolbar: false },
  onReady: ({ superdoc: readySuperDoc }) => {
    const bold = readySuperDoc.ui.commands.get('bold');

    const render = (state: ReturnType<typeof bold.getState>) => {
      boldButton.disabled = !state.enabled;
      boldButton.setAttribute('aria-pressed', String(state.active));
      boldButton.title = state.reason ?? 'Toggle bold';
    };

    const onBoldClick = async () => {
      const result = await bold.executeAsync();
      if (result === false) console.warn('Bold is not available for the current selection.');
    };

    render(bold.getState());
    stopObserving = bold.observe(render);
    boldButton.addEventListener('click', onBoldClick);
    removeClickHandler = () => boldButton.removeEventListener('click', onBoldClick);
  },
});

window.addEventListener('beforeunload', () => {
  stopObserving?.();
  removeClickHandler?.();
  // Tears the controller down too. Never call `superdoc.ui.destroy()` yourself.
  superdoc.destroy();
});
