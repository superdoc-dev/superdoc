import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import { exportSuperDocToPdf } from './exporter';
import { extractEmbeddedFonts, type EmbeddedFonts } from './fontExtract';
import { parseFieldTemplates, type FieldTemplates } from './fieldResolve';

const statusEl = document.querySelector<HTMLSpanElement>('#status')!;
const exportBtn = document.querySelector<HTMLButtonElement>('#export-pdf')!;
const fileInput = document.querySelector<HTMLInputElement>('#file')!;
const setStatus = (s: string) => (statusEl.textContent = s);

// Overlay shown during export so the user doesn't see the page-scrolling the
// exporter does to force every page to paint.
const overlay = document.createElement('div');
overlay.style.cssText =
  'position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;' +
  'background:rgba(17,24,39,.55);backdrop-filter:blur(2px);color:#fff;font:600 16px system-ui,sans-serif';
overlay.innerHTML =
  '<div style="background:#111827;padding:22px 28px;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.4);text-align:center">' +
  '<div style="width:26px;height:26px;margin:0 auto 12px;border:3px solid #374151;border-top-color:#3b82f6;border-radius:50%;animation:sd-spin 0.8s linear infinite"></div>' +
  '<div id="ov-msg">Exporting…</div></div>' +
  '<style>@keyframes sd-spin{to{transform:rotate(360deg)}}</style>';
document.body.appendChild(overlay);
const ovMsg = () => overlay.querySelector<HTMLDivElement>('#ov-msg')!;
const showOverlay = (on: boolean) => (overlay.style.display = on ? 'flex' : 'none');
const progress = (s: string) => {
  setStatus(s);
  ovMsg().textContent = s;
};

const DEFAULT_DOC = '/calibre-demo.docx';

// Bytes of the currently-loaded DOCX — used to extract its embedded fonts so
// they can be embedded byte-exact into the PDF.
let currentDocxBytes: ArrayBuffer | null = null;
let currentName = 'calibre-demo';

async function loadDefaultBytes() {
  try {
    currentDocxBytes = await (await fetch(DEFAULT_DOC)).arrayBuffer();
  } catch {
    currentDocxBytes = null;
  }
}
void loadDefaultBytes();

const superdoc = new SuperDoc({
  selector: '#editor',
  document: DEFAULT_DOC,
  pagination: true,
  onReady: () => {
    setStatus('ready');
    exportBtn.disabled = false;
  },
  onException: ({ error }: any) => {
    console.error('[POC] open failed', error);
    setStatus('open failed — see console');
  },
} as any);

(window as any).superdoc = superdoc;

// Open an arbitrary .docx so you can test your own documents locally.
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  exportBtn.disabled = true;
  setStatus(`loading ${file.name}…`);
  try {
    currentDocxBytes = await file.arrayBuffer();
    currentName = file.name.replace(/\.docx$/i, '');
    await superdoc.replaceFile(file);
    setStatus(`loaded ${file.name}`);
  } catch (err) {
    console.error('[POC] load failed', err);
    setStatus('load failed — see console');
  } finally {
    exportBtn.disabled = false;
    fileInput.value = '';
  }
});

/**
 * Demonstrates the target API from the brief:
 *   await superdoc.export({ exportType: ['pdf'], triggerDownload: true });
 * In the real PR this branch lives inside SuperDoc.export(); here we wrap the
 * published build so the POC exercises the exact call shape.
 */
const originalExport = superdoc.export.bind(superdoc);
(superdoc as any).export = async (params: any = {}) => {
  const types: string[] = params.exportType ?? ['docx'];
  if (types.includes('pdf')) {
    // Extract the DOCX's own embedded fonts for byte-exact glyphs, and parse
    // header/footer PAGE/NUMPAGES fields so we can fill in real page numbers.
    let embeddedFonts: EmbeddedFonts = {};
    let fieldTemplates: FieldTemplates | undefined;
    if (currentDocxBytes) {
      try {
        embeddedFonts = await extractEmbeddedFonts(currentDocxBytes);
        const fams = Object.keys(embeddedFonts);
        if (fams.length) console.log('[POC] embedded fonts:', fams.join(', '));
      } catch (e) {
        console.warn('[POC] font extraction failed; using substitutes', e);
      }
      try {
        fieldTemplates = await parseFieldTemplates(currentDocxBytes);
        if (fieldTemplates.size) console.log('[POC] page-number fields in:', [...fieldTemplates.keys()].join(', '));
      } catch (e) {
        console.warn('[POC] field parse failed', e);
      }
    }

    // Reset zoom to 100% for the export (zoom scales getBoundingClientRect via a
    // CSS transform), then restore — mirrors what SuperDoc.export() does in-core.
    const pm: any = (superdoc as any).activeEditor?.pageMetrics;
    const prevZoom: number | undefined = pm?.getSnapshot?.()?.zoom?.percent;
    const restoreZoom = typeof prevZoom === 'number' && prevZoom !== 100 && !!pm?.setZoom;
    const scrollX0 = window.scrollX,
      scrollY0 = window.scrollY;
    let bytes: Uint8Array;
    showOverlay(true);
    try {
      if (restoreZoom) pm.setZoom(100);
      // Pixel mode: each page is rasterized by the browser's own engine, so the
      // PDF is 100% identical to the editor. `?mode=word` still forces the
      // vector path for comparison.
      const mode = (new URLSearchParams(location.search).get('mode') as any) || 'pixel';
      bytes = await exportSuperDocToPdf(superdoc, { onProgress: progress, embeddedFonts, fieldTemplates, mode });
    } finally {
      if (restoreZoom) pm.setZoom(prevZoom);
      window.scrollTo(scrollX0, scrollY0);
      showOverlay(false);
    }

    if (params.triggerDownload !== false) {
      const name = (params.exportedName || currentName || 'document') + '.pdf';
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
    return { exportType: types, byteLength: bytes.byteLength };
  }
  return originalExport(params);
};

exportBtn.addEventListener('click', async () => {
  exportBtn.disabled = true;
  try {
    setStatus('exporting…');
    const result = await (superdoc as any).export({
      exportType: ['pdf'],
      triggerDownload: true,
      exportedName: currentName,
    });
    setStatus(`exported ${(result.byteLength / 1024).toFixed(0)} KB`);
  } catch (err) {
    console.error('[POC] export failed', err);
    setStatus('export failed — see console');
  } finally {
    exportBtn.disabled = false;
  }
});
