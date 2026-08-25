import { SuperDoc, type ContextMenuConfig } from 'superdoc';
import 'superdoc/style.css';

const contextMenu = {
  sections: [
    {
      id: 'application-actions',
      items: [
        {
          id: 'send-selection-to-workflow',
          label: 'Send selection to workflow',
          showWhen: ({ hasSelection, trigger }) => trigger === 'click' && hasSelection,
          onSelect: async ({ context }) => {
            const selectedText = (await context?.selectedTextSettled)?.trim();
            if (selectedText) console.log('Workflow selection:', selectedText);
          },
        },
      ],
    },
  ],
} satisfies ContextMenuConfig;

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/sample.docx',
  ui: { contextMenu },
});

window.addEventListener('beforeunload', () => superdoc.destroy());
