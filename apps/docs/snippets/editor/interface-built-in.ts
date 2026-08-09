import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

// Built-in: SuperDoc renders the chrome.
//
// Surfaces you say nothing about keep their historical defaults. The toolbar is
// the one that needs a mount target, because SuperDoc cannot guess where in
// your layout it belongs.
const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  ui: {
    toolbar: { container: '#toolbar' },
    // The default toolbar renders a Search button regardless, and it opens
    // the shared find/replace surface. Leaving `search` off gives a control
    // that is visible, enabled, and does nothing when clicked.
    search: true,
  },
});

window.addEventListener('beforeunload', () => superdoc.destroy());
