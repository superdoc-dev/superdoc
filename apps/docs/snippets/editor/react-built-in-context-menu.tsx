import { SuperDocEditor, type SuperDocEditorProps } from '@superdoc/react';
import type { ContextMenuConfig } from 'superdoc';
import '@superdoc/react/style.css';

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

const editorConfig = {
  ui: { contextMenu },
} satisfies Pick<SuperDocEditorProps, 'ui'>;

export default function App() {
  return <SuperDocEditor document='/sample.docx' ui={editorConfig.ui} />;
}
