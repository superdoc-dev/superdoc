import { SuperDoc, type Config } from 'superdoc';
import 'superdoc/style.css';

const editorConfig = {
  selector: '#editor',
  document: '/contract.docx',
  documentMode: 'editing',
  user: { name: 'Avery Stone', email: 'avery@example.com' },
  contained: true,
  zoom: { mode: 'fit-width', fitWidth: { max: 100, padding: 24 } },
  ui: {
    // `container` is what makes the toolbar render; the other keys only
    // describe it once it has somewhere to go.
    toolbar: { container: '#toolbar', responsiveToContainer: true },
    comments: { displayMode: 'auto' },
    search: true,
  },
  onReady: () => {
    console.info('SuperDoc is ready.');
  },
} satisfies Config;

const superdoc = new SuperDoc(editorConfig);

window.addEventListener('beforeunload', () => superdoc.destroy());
