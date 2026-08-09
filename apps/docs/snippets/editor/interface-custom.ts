import { SuperDoc } from 'superdoc';
import type { CommandState } from 'superdoc/ui';
import 'superdoc/style.css';

const boldButton = document.querySelector<HTMLButtonElement>('#bold')!;

// Fully custom: the application renders every control.
//
// `ui: false` turns off all built-in chrome at once. It removes presentation
// only: editing, the Document API, `interaction`, `surfaces`, and
// `superdoc.ui` all keep working, which is what makes this viable without
// giving up the editor underneath.
const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  ui: false,
  // Still enforced with no built-in UI to enforce it in. Policy is not a
  // property of the chrome that happens to render it.
  interaction: { comments: { readOnly: true } },
  onReady: ({ superdoc: readySuperDoc }) => {
    const bold = readySuperDoc.ui.commands.get('bold');

    const render = (state: CommandState) => {
      boldButton.disabled = !state.enabled;
      // A toggle's pressed state has to reach assistive technology, not only
      // a class name. `aria-pressed` announces it and drives the styling in
      // the markup beside this file, so there is one source of truth.
      boldButton.setAttribute('aria-pressed', String(state.active));
    };

    render(bold.getState());
    bold.observe(render);
    boldButton.addEventListener('click', () => bold.execute());
  },
});

window.addEventListener('beforeunload', () => superdoc.destroy());
