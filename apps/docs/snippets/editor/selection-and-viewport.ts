import { SuperDoc } from 'superdoc';
import type { SelectionCapture, SelectionSlice } from 'superdoc/ui';
import 'superdoc/style.css';

const editorShell = document.querySelector<HTMLDivElement>('#editor-shell');
const overlay = document.querySelector<HTMLDivElement>('#selection-overlay');
const preview = document.querySelector<HTMLSpanElement>('#selection-preview');
const restoreButton = document.querySelector<HTMLButtonElement>('#restore-selection');
const status = document.querySelector<HTMLParagraphElement>('#selection-status');

if (!editorShell || !overlay || !preview || !restoreButton || !status) {
  throw new Error('The selection UI is incomplete.');
}

let capture: SelectionCapture | null = null;
let stopSelection: (() => void) | null = null;
let stopViewport: (() => void) | null = null;
let removeRestoreHandler: (() => void) | null = null;

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  onReady: ({ superdoc: readySuperDoc }) => {
    const ui = readySuperDoc.ui;

    const positionOverlay = () => {
      const target = capture?.selectionTarget ?? capture?.target;
      if (!target) {
        overlay.hidden = true;
        return;
      }

      const geometry = ui.viewport.getRect({ target, relativeTo: editorShell });
      if (!geometry.found || !geometry.rect) {
        overlay.hidden = true;
        status.textContent = geometry.reason ?? 'The selection is not currently painted.';
        return;
      }

      overlay.hidden = false;
      const overlayHeight = overlay.offsetHeight;
      overlay.style.left = `${geometry.rect.left}px`;
      overlay.style.top = `${Math.max(0, geometry.rect.top - overlayHeight - 8)}px`;
    };

    const renderSelection = (selection: SelectionSlice) => {
      if (selection.empty) return;

      capture = ui.selection.capture();
      if (!capture) return;

      preview.textContent = capture.quotedText;
      status.textContent = `Captured “${capture.quotedText}”. Move focus, then restore it.`;
      positionOverlay();
    };

    const restoreSelection = () => {
      if (!capture) return;

      const result = ui.selection.restore(capture);
      status.textContent = result.success ? 'Selection restored.' : `Restore failed: ${result.reason ?? 'unknown'}`;
    };

    renderSelection(ui.selection.getSnapshot());
    stopSelection = ui.selection.observe(renderSelection);
    stopViewport = ui.viewport.observe(positionOverlay);
    restoreButton.addEventListener('click', restoreSelection);
    removeRestoreHandler = () => restoreButton.removeEventListener('click', restoreSelection);
  },
});

window.addEventListener('beforeunload', () => {
  stopSelection?.();
  stopViewport?.();
  removeRestoreHandler?.();
  superdoc.destroy();
});
