import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/sample.docx',
  ui: {
    contextMenu: { openOnSlash: false },
  },
});

document.querySelector('#open-context-menu')?.addEventListener('click', () => {
  const result = superdoc.ui.contextMenu.open();
  if (!result.ok) console.warn(`Context menu did not open: ${result.reason}`);
});

window.addEventListener('beforeunload', () => superdoc.destroy());
