import { SuperDocUIProvider, useSuperDocUI } from 'superdoc/ui/react';
import { EditorMount } from './editor/EditorMount';
import { ContextMenu, type ContextMenuCommand } from './components/ContextMenu';

function AppContent() {
  const ui = useSuperDocUI();

  const handleCommand = (command: ContextMenuCommand) => {
    console.log('[ContextMenu] Command received:', command);
    if (!ui) {
      console.error('[ContextMenu] Failed: ui not available');
      return;
    }
    const cmd = ui.commands.get(command);
    if (!cmd) {
      console.error('[ContextMenu] Failed: command not found:', command);
      return;
    }
    try {
      cmd.execute();
      console.log('[ContextMenu] Success:', command);
    } catch (err) {
      console.error('[ContextMenu] Failed to execute:', command, err);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Custom Context Menu Demo</h1>
        <span className="subtitle">Right-click in the editor to see the custom menu</span>
      </header>
      <div className="editor-wrapper">
        <EditorMount />
      </div>
      <ContextMenu onCommand={handleCommand} />
    </div>
  );
}

export function App() {
  return (
    <SuperDocUIProvider>
      <AppContent />
    </SuperDocUIProvider>
  );
}
