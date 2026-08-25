import { useRef, useState } from 'react';
import { SuperDocEditor, type SuperDocRef } from '@superdoc/react';
import type { ContextMenuConfig } from 'superdoc';
import '@superdoc/react/style.css';

const contextMenu = {
  openOnSlash: false,
} satisfies ContextMenuConfig;

const ui = { contextMenu };

export default function App() {
  const editor = useRef<SuperDocRef>(null);
  const [ready, setReady] = useState(false);

  function openContextMenu() {
    const instance = editor.current?.getInstance();
    if (!instance) return;
    const result = instance.ui.contextMenu.open();
    if (!result.ok) console.warn(`Context menu did not open: ${result.reason}`);
  }

  return (
    <>
      <button type='button' disabled={!ready} onClick={openContextMenu}>
        Open context menu
      </button>
      <SuperDocEditor ref={editor} document='/sample.docx' onReady={() => setReady(true)} ui={ui} />
    </>
  );
}
