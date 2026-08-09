import { SuperDoc } from 'superdoc';
import type { ContentControlsSlice } from 'superdoc/ui';
import 'superdoc/style.css';

const controlList = document.querySelector<HTMLUListElement>('#control-list');
const controlsStatus = document.querySelector<HTMLParagraphElement>('#controls-status');

if (!controlList || !controlsStatus) {
  throw new Error('The content-control UI is incomplete.');
}

let stopContentControls: (() => void) | null = null;

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  onReady: ({ superdoc: readySuperDoc }) => {
    const doc = readySuperDoc.activeEditor?.doc;
    if (!doc) throw new Error('The Document API is not ready.');

    const ui = readySuperDoc.ui;

    const focusControl = async (id: string) => {
      const result = await ui.contentControls.focus({ id, block: 'center', behavior: 'smooth' });
      if (!result.success) controlsStatus.textContent = `The field is ${result.reason}.`;
    };

    const updateTextControl = async (id: string, value: string) => {
      const control = ui.contentControls.get({ id });
      if (!control || control.controlType !== 'text') {
        controlsStatus.textContent = 'This field is no longer an editable text control.';
        return;
      }

      const receipt = await doc.contentControls.text.setValue({ target: control.target, value });
      if (!receipt.success) {
        controlsStatus.textContent = receipt.failure.message;
        return;
      }

      controlsStatus.textContent = 'Field updated.';
    };

    const render = (controls: ContentControlsSlice) => {
      controlList.replaceChildren();
      controlsStatus.textContent =
        controls.status === 'pending' ? 'Loading content controls…' : `${controls.total} document fields`;

      for (const control of controls.items) {
        const row = document.createElement('li');
        const label = document.createElement('span');
        const show = document.createElement('button');

        label.textContent = control.properties.alias ?? control.properties.tag ?? control.controlType;
        show.type = 'button';
        show.textContent = controls.activeIds.includes(control.id) ? 'Focused' : 'Show';
        show.addEventListener('click', () => void focusControl(control.id));
        row.append(label, show);

        if (control.controlType === 'text') {
          const value = document.createElement('input');
          const update = document.createElement('button');

          value.type = 'text';
          value.value = control.text ?? '';
          value.setAttribute('aria-label', `Value for ${label.textContent}`);
          update.type = 'button';
          update.textContent = 'Update';
          update.addEventListener('click', () => void updateTextControl(control.id, value.value));
          row.append(value, update);
        }

        controlList.append(row);
      }
    };

    ui.contentControls.list();
    stopContentControls = ui.contentControls.observe(render);
  },
});

window.addEventListener('beforeunload', () => {
  stopContentControls?.();
  superdoc.destroy();
});
