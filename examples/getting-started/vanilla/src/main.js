import { SuperDoc } from 'superdoc';
import { superdocFonts } from '@superdoc/fonts';
import 'superdoc/style.css';

// `fonts: superdocFonts` serves SuperDoc's bundled fallback fonts (Carlito for Calibri, etc.)
// from the @superdoc/fonts package. Your bundler emits the .woff2; no copy step, no assetBaseUrl.
let superdoc = new SuperDoc({
  selector: '#editor',
  fonts: superdocFonts,
});

document.getElementById('file-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  superdoc?.destroy();
  superdoc = new SuperDoc({
    selector: '#editor',
    document: file,
    fonts: superdocFonts,
  });
});
