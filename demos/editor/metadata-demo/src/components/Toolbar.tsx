import { useRef } from 'react';
import type { SelectionCapture } from 'superdoc/ui';
import {
  useSuperDocUI,
  useSuperDocCommand,
  useSuperDocSelection,
} from 'superdoc/ui/react';
import { useAnnotations } from './useAnnotations';
import { textTargetToSelectionTarget } from './citations-types';

interface ToolbarProps {}

interface BuiltInButton {
  id: string;
  label: React.ReactNode;
  title: string;
  fontStyle?: React.CSSProperties;
}

const TEXT_BUTTONS: BuiltInButton[] = [
  { id: 'bold', label: 'B', title: 'Bold', fontStyle: { fontWeight: 700 } },
  { id: 'italic', label: 'I', title: 'Italic', fontStyle: { fontStyle: 'italic' } },
  { id: 'underline', label: 'U', title: 'Underline', fontStyle: { textDecoration: 'underline' } },
];

const HISTORY_BUTTONS: BuiltInButton[] = [
  { id: 'undo', label: <UndoIcon />, title: 'Undo' },
  { id: 'redo', label: <RedoIcon />, title: 'Redo' },
];

export function Toolbar(_props: ToolbarProps) {
  const ui = useSuperDocUI();
  const ready = !!ui;
  const execute = (id: string) => {
    ui?.commands.get(id)?.execute();
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Document toolbar">
      <div className="toolbar-group">
        {TEXT_BUTTONS.map((b) => (
          <ToolbarButton key={b.id} id={b.id} ready={ready} button={b} onClick={() => execute(b.id)} />
        ))}
      </div>

      <div className="toolbar-group">
        {HISTORY_BUTTONS.map((b) => (
          <ToolbarButton key={b.id} id={b.id} ready={ready} button={b} onClick={() => execute(b.id)} />
        ))}
      </div>
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

/**
 * Apply invisible metadata to the current selection.
 */
export function MetadataButton() {
  const ui = useSuperDocUI();
  const selection = useSuperDocSelection();
  const { attach } = useAnnotations();
  const capturedSelection = useRef<SelectionCapture | null>(null);

  const disabled = !ui || selection.empty || selection.target === null;

  const rememberSelection = () => {
    const capture = ui?.selection.capture();
    if (capture) capturedSelection.current = capture;
  };

  const onClick = () => {
    if (!ui) return;

    if (capturedSelection.current) {
      ui.selection.restore(capturedSelection.current);
      capturedSelection.current = null;
    }

    const textTarget = selection.target;
    const target = textTargetToSelectionTarget(textTarget);
    if (!target) {
      alert('Please select text within a single paragraph.');
      return;
    }

    const result = attach(target);
    if ('error' in result) {
      alert(`Failed to apply metadata: ${result.error}`);
    } else {
      console.log('[MetadataButton] Metadata attached with id:', result.id);
    }
  };

  return (
    <button
      className="tb-btn metadata-btn"
      disabled={disabled}
      title="Apply invisible metadata to selection"
      onMouseDown={(e) => {
        e.preventDefault();
        rememberSelection();
      }}
      onClick={onClick}
    >
      <TagIcon /> Apply Metadata
    </button>
  );
}

interface HighlightToggleProps {
  enabled: boolean;
  onToggle(): void;
}

export function HighlightToggle({ enabled, onToggle }: HighlightToggleProps) {
  return (
    <button
      className={`tb-btn highlight-toggle ${enabled ? 'active' : ''}`}
      onClick={onToggle}
      title={enabled ? 'Hide metadata highlights' : 'Show metadata highlights'}
    >
      <HighlightIcon /> {enabled ? 'Hide Highlights' : 'Show Highlights'}
    </button>
  );
}

// ---- Icons ----

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

function TagIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
      <path d="M7 7h.01" />
    </svg>
  );
}

function HighlightIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M9 11l-6 6v3h9l3-3" />
      <path d="M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
    </svg>
  );
}
