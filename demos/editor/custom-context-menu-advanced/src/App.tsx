import { useState } from 'react';
import { SuperDocUIProvider, useSuperDocUI } from 'superdoc/ui/react';
import { EditorMount } from './editor/EditorMount';
import { ContextMenu, type ContextMenuCommand } from './components/ContextMenu';

export type MenuMode = 'custom' | 'built-in';

function AppContent() {
  const ui = useSuperDocUI();
  const [menuMode, setMenuMode] = useState<MenuMode>('custom');

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

  const toggleMode = () => {
    setMenuMode(menuMode === 'custom' ? 'built-in' : 'custom');
  };

  const modeLabel = menuMode === 'custom' ? 'fully custom' : 'built-in (customized)';
  const switchLabel = menuMode === 'custom' ? 'built-in custom menu' : 'fully custom menu';

  return (
    <div className="app">
      <header className="app-header">
        <h1>Custom Context Menu Demo</h1>
        <span className="subtitle">Right-click in the editor — currently showing {modeLabel} menu</span>
        <button className="mode-toggle" onClick={toggleMode}>
          Switch to {switchLabel}
        </button>
      </header>
      <div className="editor-wrapper">
        <EditorMount />
      </div>
      <ContextMenu onCommand={handleCommand} enabled={menuMode === 'custom'} />
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
