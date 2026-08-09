import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const superdoc = new SuperDoc({ selector: '#editor', document: '/contract.docx' });

export const confirmInEditor = async (message: string): Promise<boolean> => {
  const handle = superdoc.openSurface<{ confirmed: true }>({
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
      confirm.textContent = 'Confirm';
      cancel.addEventListener('click', () => close('cancel'));
      confirm.addEventListener('click', () => resolve({ confirmed: true }));
      container.append(text, cancel, confirm);
    },
  });

  const outcome = await handle.result;
  return outcome.status === 'submitted' && outcome.data?.confirmed === true;
};

window.addEventListener('beforeunload', () => superdoc.destroy());
