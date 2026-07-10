import { useEffect, useRef, useState } from 'react';
import type { SelectionCapture } from 'superdoc/ui';
import {
  useSuperDocUI,
  useSuperDocCommand,
  useSuperDocFontOptions,
  useSuperDocDocument,
} from 'superdoc/ui/react';

interface BuiltInButton {
  id: string;
  label: React.ReactNode;
  title: string;
  fontStyle?: React.CSSProperties;
}

const TEXT_BUTTONS: BuiltInButton[] = [
  { id: 'bold', label: 'B', title: 'Bold (⌘B)', fontStyle: { fontWeight: 700 } },
  { id: 'italic', label: 'I', title: 'Italic (⌘I)', fontStyle: { fontStyle: 'italic' } },
  { id: 'underline', label: 'U', title: 'Underline (⌘U)', fontStyle: { textDecoration: 'underline' } },
];

const HISTORY_BUTTONS: BuiltInButton[] = [
  { id: 'undo', label: <UndoIcon />, title: 'Undo (⌘Z)' },
  { id: 'redo', label: <RedoIcon />, title: 'Redo (⌘⇧Z)' },
];

export function Toolbar() {
  const ui = useSuperDocUI();
  const ready = !!ui;
  const execute = (id: string, payload?: unknown) => {
    ui?.commands.get(id)?.execute(payload);
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Document toolbar">
      <div className="toolbar-group">
        {TEXT_BUTTONS.map((b) => (
          <ToolbarButton key={b.id} id={b.id} ready={ready} button={b} onClick={() => execute(b.id)} />
        ))}
        <FontFamilyPicker />
      </div>

      <div className="toolbar-group">
        {HISTORY_BUTTONS.map((b) => (
          <ToolbarButton key={b.id} id={b.id} ready={ready} button={b} onClick={() => execute(b.id)} />
        ))}
      </div>

      <div className="toolbar-group">
        <ToolbarButton
          id="bullet-list"
          ready={ready}
          button={{ id: 'bullet-list', label: <BulletListIcon />, title: 'Bullet list' }}
          onClick={() => execute('bullet-list')}
        />
        <ToolbarButton
          id="numbered-list"
          ready={ready}
          button={{ id: 'numbered-list', label: <OrderedListIcon />, title: 'Numbered list' }}
          onClick={() => execute('numbered-list')}
        />
      </div>

      <div className="toolbar-group" style={{ marginLeft: 'auto' }}>
        <ReimportButton />
        <ExportButton />
      </div>
    </div>
  );
}

function normalizeFontValue(value: unknown): string {
  return typeof value === 'string' ? value.split(',')[0]?.trim().replace(/^["']|["']$/g, '') || '' : '';
}

function FontFamilyPicker() {
  const ui = useSuperDocUI();
  const font = useSuperDocCommand('font-family');
  const options = useSuperDocFontOptions();
  const capturedSelection = useRef<SelectionCapture | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const current = normalizeFontValue(font.value).toLowerCase();
  const selectedOption =
    options.find((option) => {
      return (
        normalizeFontValue(option.value).toLowerCase() === current ||
        normalizeFontValue(option.label).toLowerCase() === current ||
        normalizeFontValue(option.previewFamily).toLowerCase() === current
      );
    }) ?? null;
  const selected = selectedOption?.value ?? '';

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node | null)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const rememberSelection = () => {
    const capture = ui?.selection.capture();
    if (capture) capturedSelection.current = capture;
  };

  const applyFont = (value: string) => {
    if (!ui) return;
    if (capturedSelection.current) {
      ui.selection.restore(capturedSelection.current);
      capturedSelection.current = null;
    }
    setOpen(false);
    ui.toolbar.execute('font-family', value);
  };

  return (
    <div className="tb-font-menu" ref={menuRef}>
      <button
        type="button"
        className="tb-select tb-font-select"
        disabled={!ui || font.disabled}
        aria-label="Font family"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Font family"
        style={{ fontFamily: selectedOption?.previewFamily }}
        onMouseDown={(event) => {
          event.preventDefault();
          rememberSelection();
        }}
        onClick={() => setOpen((value) => !value)}
      >
        {selectedOption?.label ?? 'Font'}
      </button>
      {open && (
        <div className="tb-font-options" role="listbox" aria-label="Font family">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === selected}
              className="tb-font-option"
              style={{ fontFamily: option.previewFamily }}
              onMouseDown={(event) => {
                event.preventDefault();
                rememberSelection();
              }}
              onClick={() => applyFont(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolbarButton({
  id,
  ready,
  button,
  onClick,
}: {
  id: string;
  ready: boolean;
  button: BuiltInButton;
  onClick(): void;
}) {
  const cmd = useSuperDocCommand(id);
  return (
    <button
      className={`tb-btn ${cmd.active ? 'active' : ''}`}
      disabled={!ready || cmd.disabled}
      title={button.title}
      style={button.fontStyle}
      onClick={onClick}
    >
      {button.label}
    </button>
  );
}

function ExportButton() {
  const ui = useSuperDocUI();
  const { dirty } = useSuperDocDocument();

  const onClick = async () => {
    if (!ui) return;
    try {
      await ui.document.export({
        exportType: ['docx'],
        commentsType: 'external',
        triggerDownload: true,
      });
    } catch (err) {
      console.error('[Toolbar] export failed', err);
      alert(err instanceof Error ? err.message : 'Export failed');
    }
  };

  return (
    <button
      className="tb-btn export-btn"
      disabled={!ui}
      title={dirty ? 'Download as DOCX (unsaved changes)' : 'Download as DOCX'}
      onClick={onClick}
    >
      Export
      {dirty ? (
        <span aria-hidden style={{ marginLeft: 4, color: '#f59e0b' }}>
          •
        </span>
      ) : null}
    </button>
  );
}

function ReimportButton() {
  const ui = useSuperDocUI();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!ui || !file) return;
    setBusy(true);
    try {
      await ui.document.replaceFile(file);
    } catch (err) {
      console.error('[Toolbar] reimport failed', err);
      alert(err instanceof Error ? err.message : 'Reimport failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type='file'
        accept='.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        style={{ display: 'none' }}
        onChange={onPick}
      />
      <button
        className='tb-btn'
        disabled={!ui || busy}
        title='Replace the current document with a DOCX file'
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Importing…' : 'Import'}
      </button>
    </>
  );
}

// ---- inline icons (Lucide-style) -------------------------------------------

const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function UndoIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
    </svg>
  );
}

function BulletListIcon() {
  return (
    <svg {...ICON_PROPS}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function OrderedListIcon() {
  return (
    <svg {...ICON_PROPS}>
      <line x1="10" y1="6" x2="21" y2="6" />
      <line x1="10" y1="12" x2="21" y2="12" />
      <line x1="10" y1="18" x2="21" y2="18" />
      <path d="M4 6h1v4" />
      <path d="M4 10h2" />
      <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
    </svg>
  );
}
