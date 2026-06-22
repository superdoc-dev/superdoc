import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSuperDocUI } from 'superdoc/ui/react';
import { Icon, icons, IconName } from './icons';

export type ContextMenuCommand = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'bullet-list' | 'numbered-list';

interface ContextMenuProps {
  onCommand: (command: ContextMenuCommand) => void;
  /** When false, this component does nothing and lets SuperDoc's built-in menu handle events */
  enabled: boolean;
}

type MenuItem = {
  cmd: ContextMenuCommand;
  label: string;
  icon: IconName;
  shortcut?: string;
};

const ITEMS: MenuItem[] = [
  { cmd: 'bold', label: 'Bold', icon: 'bold', shortcut: '⌘B' },
  { cmd: 'italic', label: 'Italic', icon: 'italic', shortcut: '⌘I' },
  { cmd: 'underline', label: 'Underline', icon: 'underline', shortcut: '⌘U' },
  { cmd: 'strikethrough', label: 'Strikethrough', icon: 'strikethrough', shortcut: '⌘⇧X' },
];

const LIST_ITEMS: MenuItem[] = [
  { cmd: 'bullet-list', label: 'Bulleted list', icon: 'bulletList' },
  { cmd: 'numbered-list', label: 'Numbered list', icon: 'numberedList' },
];

export function ContextMenu({ onCommand, enabled }: ContextMenuProps) {
  const ui = useSuperDocUI();
  const menuRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ x: number; y: number; hasSelection: boolean } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Close menu when disabled
  useEffect(() => {
    if (!enabled) setState(null);
  }, [enabled]);

  useEffect(() => {
    // Don't attach listeners if disabled or no ui
    if (!ui || !enabled) return;

    const onContext = (e: MouseEvent) => {
      const host = ui.viewport.getHost();
      if (!host?.contains(e.target as Node)) return;
      e.preventDefault();
      e.stopPropagation(); // Prevent SuperDoc's built-in menu from also handling
      const sel = window.getSelection();
      setState({ x: e.clientX, y: e.clientY, hasSelection: !!sel?.toString().trim() });
    };

    const onDown = (e: PointerEvent) => {
      if ((e.target as Element)?.closest?.('.context-menu')) return;
      setState(null);
    };

    // Use capture phase to intercept before SuperDoc's listener
    document.addEventListener('contextmenu', onContext, true);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('contextmenu', onContext, true);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [ui, enabled]);

  useLayoutEffect(() => {
    if (!state || !menuRef.current) return setPos(null);
    const { offsetWidth: w, offsetHeight: h } = menuRef.current;
    const margin = 8;
    setPos({
      left: Math.min(Math.max(state.x, margin), innerWidth - w - margin),
      top: Math.min(Math.max(state.y, margin), innerHeight - h - margin),
    });
  }, [state]);

  if (!state || !ui) return null;

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: pos?.left ?? state.x,
    top: pos?.top ?? state.y,
    visibility: pos ? 'visible' : 'hidden',
  };

  const handleClick = (cmd: ContextMenuCommand) => {
    onCommand(cmd);
    setState(null);
  };

  const renderItem = (item: MenuItem) => (
    <button key={item.cmd} className="context-menu-item" onClick={() => handleClick(item.cmd)}>
      <span className="context-menu-icon"><Icon d={icons[item.icon]} /></span>
      <span className="context-menu-label">{item.label}</span>
      {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
    </button>
  );

  if (!state.hasSelection) {
    return (
      <div ref={menuRef} className="context-menu" style={menuStyle} onPointerDown={e => e.stopPropagation()}>
        <div className="context-menu-item disabled">
          <span className="context-menu-label">Select some text first...</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={menuRef} className="context-menu" style={menuStyle} onPointerDown={e => e.stopPropagation()}>
      {ITEMS.map(renderItem)}
      <div className="context-menu-separator" />
      <div className="context-menu-item-wrapper">
        <div className="context-menu-item-with-submenu">
          <button className="context-menu-item has-submenu">
            <span className="context-menu-icon"><Icon d={icons.list} /></span>
            <span className="context-menu-label">Lists</span>
            <span className="context-menu-chevron"><Icon d={icons.chevron} size={12} /></span>
          </button>
          <div className="context-submenu">
            {LIST_ITEMS.map(renderItem)}
          </div>
        </div>
      </div>
    </div>
  );
}
