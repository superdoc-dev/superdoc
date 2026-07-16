import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

// Self-hosted bundled fallback fonts (copied to public/fonts/ by copy-fonts.mjs).
let superdoc = new SuperDoc({ selector: '#editor', fonts: { assetBaseUrl: '/fonts/' } });

document.getElementById('file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    superdoc?.destroy();
    superdoc = new SuperDoc({
        selector: '#editor',
        document: file,
        fonts: { assetBaseUrl: '/fonts/' },
    });
});
