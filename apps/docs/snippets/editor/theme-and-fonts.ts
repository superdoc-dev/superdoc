import { SuperDoc, createTheme } from 'superdoc';
import 'superdoc/style.css';

const shell = document.querySelector<HTMLElement>('#editor-shell');
if (!shell) throw new Error('The Editor shell is missing.');

const themeClass = createTheme({
  name: 'product',
  font: 'Inter, system-ui, sans-serif',
  colors: { action: '#2563eb', bg: '#f8fafc', text: '#0f172a', border: '#cbd5e1' },
  vars: { '--sd-ui-toolbar-bg': '#eef2ff', '--sd-layout-page-bg': '#ffffff' },
});
shell.classList.add(themeClass);

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  uiDisplayFallbackFont: 'Inter, system-ui, sans-serif',
  onReady: async ({ superdoc: readySuperDoc }) => {
    readySuperDoc.fonts.add({
      family: 'Product Sans',
      faces: [{ source: '/fonts/product-sans-regular.woff2', weight: 400, style: 'normal' }],
    });
    readySuperDoc.fonts.map({ Calibri: 'Product Sans' });
    await readySuperDoc.fonts.preload(['Calibri']);
  },
  onFontsChanged: ({ missingFonts }) => {
    if (missingFonts?.length) console.warn('Missing document fonts', missingFonts);
  },
});

window.addEventListener('beforeunload', () => superdoc.destroy());
