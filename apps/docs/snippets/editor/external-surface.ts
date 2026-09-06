import { SuperDoc, type SurfaceOutcome } from 'superdoc';
import 'superdoc/style.css';

const superdoc = new SuperDoc({ selector: '#editor', document: '/sample.docx' });

type ConfirmationResult = Readonly<{ action: 'continue' }>;

export const confirmInEditor = async (message: string): Promise<boolean> => {
  const handle = superdoc.openSurface<ConfirmationResult>({
    mode: 'dialog',
    title: 'Confirm action',
    render: ({ container, close, resolve }) => {
      const text = document.createElement('p');
      text.textContent = message;

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancel';

      const confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.textContent = 'Continue';

      const cancelAction = () => close('cancel');
      const confirmAction = () => resolve({ action: 'continue' });
      cancel.addEventListener('click', cancelAction);
      confirm.addEventListener('click', confirmAction);
      container.append(text, cancel, confirm);

      return {
        destroy() {
          cancel.removeEventListener('click', cancelAction);
          confirm.removeEventListener('click', confirmAction);
        },
      };
    },
  });

  const outcome: SurfaceOutcome<ConfirmationResult> = await handle.result;
  switch (outcome.status) {
    case 'submitted':
      return outcome.data?.action === 'continue';
    case 'closed':
      return false;
    case 'replaced':
      return false;
    case 'destroyed':
      return false;
  }
};

window.addEventListener('beforeunload', () => superdoc.destroy());
