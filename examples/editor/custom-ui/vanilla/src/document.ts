/**
 * Document-domain controls: Edit / Suggest toggle, Import (replaceFile),
 * Export DOCX. Appended to the same toolbar element so they sit at
 * the right edge alongside the formatting controls.
 *
 * All three actions route through `ui.document.*`. The Import button
 * uses a hidden file input the way most product toolbars do; export
 * triggers a download via the host's default behavior.
 */

import type { SuperDocUI } from 'superdoc/ui';
import { Disposer } from './bind';

interface MountOpts {
  toolbarEl: HTMLElement;
  ui: SuperDocUI;
  disposer: Disposer;
}

export function mountDocumentControls({ toolbarEl, ui, disposer }: MountOpts): void {
  const modeGroup = document.createElement('div');
  modeGroup.className = 'toolbar-group';
  const editBtn = makeToggle('Edit', 'Edit normally', () => ui.document.setMode('editing'));
  const suggestBtn = makeToggle('Suggest', 'Record edits as tracked changes', () => ui.document.setMode('suggesting'));
  modeGroup.append(editBtn, suggestBtn);
  toolbarEl.appendChild(modeGroup);

  const trailingGroup = document.createElement('div');
  trailingGroup.className = 'toolbar-group toolbar-trailing';

  // Import: round-trip companion to Export.
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    importBtn.disabled = true;
    importBtn.textContent = 'Importing…';
    try {
      await ui.document.replaceFile(file);
    } catch (err) {
      console.error('[vanilla] replaceFile failed', err);
      alert(err instanceof Error ? err.message : 'Import failed');
    } finally {
      importBtn.disabled = false;
      importBtn.textContent = 'Import';
    }
  });
  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.className = 'tb-btn';
  importBtn.title = 'Replace the current document with a DOCX file';
  importBtn.textContent = 'Import';
  importBtn.addEventListener('click', () => fileInput.click());
  trailingGroup.append(fileInput, importBtn);

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'tb-btn export-btn';
  exportBtn.textContent = 'Export';
  exportBtn.addEventListener('click', async () => {
    try {
      await ui.document.export({
        exportType: ['docx'],
        commentsType: 'external',
        triggerDownload: true,
      });
    } catch (err) {
      console.error('[vanilla] export failed', err);
      alert(err instanceof Error ? err.message : 'Export failed');
    }
  });
  trailingGroup.appendChild(exportBtn);

  toolbarEl.appendChild(trailingGroup);

  // Subscribe to the document slice once; drive ready state, mode
  // toggle highlight, and the dirty indicator on the export button
  // off the same snapshot.
  disposer.add(
    ui.document.subscribe(({ snapshot }) => {
      const ready = snapshot.ready;
      editBtn.disabled = !ready;
      suggestBtn.disabled = !ready;
      importBtn.disabled = !ready;
      exportBtn.disabled = !ready;

      editBtn.classList.toggle('active', snapshot.mode === 'editing');
      suggestBtn.classList.toggle('active', snapshot.mode === 'suggesting');

      exportBtn.title = snapshot.dirty ? 'Download as DOCX (unsaved changes)' : 'Download as DOCX';
      exportBtn.classList.toggle('dirty', snapshot.dirty);
    }),
  );
}

function makeToggle(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tb-btn';
  btn.textContent = label;
  btn.title = title;
  btn.addEventListener('click', onClick);
  return btn;
}
