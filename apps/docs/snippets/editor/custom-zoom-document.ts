import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const zoomOut = document.querySelector<HTMLButtonElement>('#zoom-out');
const fitWidth = document.querySelector<HTMLButtonElement>('#fit-width');
const zoomIn = document.querySelector<HTMLButtonElement>('#zoom-in');
const exportButton = document.querySelector<HTMLButtonElement>('#export');
const status = document.querySelector<HTMLOutputElement>('#document-status');

if (!zoomOut || !fitWidth || !zoomIn || !exportButton || !status) {
  throw new Error('The document controls are incomplete.');
}

let stopObservers: Array<() => void> = [];
let removeHandlers: (() => void) | null = null;

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  onReady: ({ superdoc: readySuperDoc }) => {
    const ui = readySuperDoc.ui;

    const render = () => {
      const zoom = ui.zoom.getSnapshot();
      const currentDocument = ui.document.getSnapshot();
      zoomOut.disabled = zoom.value <= zoom.min;
      zoomIn.disabled = zoom.value >= zoom.max;
      fitWidth.setAttribute('aria-pressed', String(zoom.mode === 'fit-width'));
      exportButton.disabled = !currentDocument.ready;
      status.value = currentDocument.ready
        ? `${currentDocument.dirty ? 'Unsaved changes' : 'Saved'} · ${zoom.value}% · ${currentDocument.mode ?? 'loading'}`
        : 'Loading the document…';
    };

    const changeZoom = (delta: number) => {
      const zoom = ui.zoom.getSnapshot();
      ui.zoom.setMode('manual');
      ui.zoom.set(Math.min(zoom.max, Math.max(zoom.min, zoom.value + delta)));
    };
    const zoomOutHandler = () => changeZoom(-10);
    const zoomInHandler = () => changeZoom(10);
    const fitWidthHandler = () => ui.zoom.setMode('fit-width');
    const exportHandler = async () => {
      status.value = 'Preparing the DOCX…';
      const pendingExport = ui.document.export({ exportType: ['docx'] });
      if (!pendingExport) {
        status.value = 'Export is unavailable in this host.';
        return;
      }
      try {
        await pendingExport;
        status.value = 'DOCX downloaded.';
      } catch (error) {
        status.value = error instanceof Error ? error.message : 'The DOCX could not be exported.';
      }
    };

    stopObservers = [ui.zoom.observe(render), ui.document.observe(render)];
    zoomOut.addEventListener('click', zoomOutHandler);
    zoomIn.addEventListener('click', zoomInHandler);
    fitWidth.addEventListener('click', fitWidthHandler);
    exportButton.addEventListener('click', exportHandler);

    removeHandlers = () => {
      zoomOut.removeEventListener('click', zoomOutHandler);
      zoomIn.removeEventListener('click', zoomInHandler);
      fitWidth.removeEventListener('click', fitWidthHandler);
      exportButton.removeEventListener('click', exportHandler);
    };
  },
});

window.addEventListener('beforeunload', () => {
  for (const stop of stopObservers) stop();
  removeHandlers?.();
  superdoc.destroy();
});
