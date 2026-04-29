import {
  useSuperDocUI,
  useSuperDocCommand,
  useSuperDocSelection,
  useSuperDocHost,
} from 'superdoc/ui/react';
import { InsertClauseButton } from './InsertClauseButton';

interface ToolbarProps {
  /** Called when the user clicks the comment button to start composing. */
  onComposeComment(): void;
}

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

/**
 * Toolbar reads its state and dispatches its actions through the
 * official `superdoc/ui/react` hooks. Two patterns to notice:
 *
 *   1. `useSuperDocCommand(id)` binds a single button to one
 *      command's state. Components only re-render when THAT command
 *      flips active / disabled / value, not on every editor
 *      transaction. This is the CKEditor-style per-command
 *      observable pattern.
 *   2. `ui.commands.get(id)?.execute(payload?)` is the typed dynamic
 *      lookup that returns `undefined` for unknown ids. The same
 *      surface drives built-ins (this file) and custom commands
 *      (`InsertClauseButton.tsx`); after a `register({ override:
 *      true })` call, dispatch automatically routes through the
 *      override on every surface (`ui.commands.bold.execute()`,
 *      `ui.toolbar.execute('bold')`, and this `get(id)?.execute()`
 *      path).
 *
 * Adding a built-in is a one-line entry in the static list below;
 * adding a custom command is a separate component that calls
 * `ui.commands.register({...})`.
 */
export function Toolbar({ onComposeComment }: ToolbarProps) {
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

      <div className="toolbar-group">
        <CommentButton onCompose={onComposeComment} />
        <InsertClauseButton />
      </div>

      <div className="toolbar-group" style={{ marginLeft: 'auto' }}>
        <ExportButton />
      </div>
    </div>
  );
}

/**
 * One built-in toolbar button. Subscribes ONLY to its own command's
 * state via `useSuperDocCommand(id)`, so unrelated state changes
 * (other commands flipping, comments updating, etc.) do not
 * re-render the button. This is the granular subscription pattern
 * SuperDoc exposes for high-frequency UI like toolbars.
 */
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
 * Export DOCX. Calls `superdoc.export({ exportType: ['docx'],
 * triggerDownload: true })` on the host instance — comments,
 * tracked-change decisions, and inserted clauses all round-trip into
 * the downloaded file. The point of the demo: changes you make
 * through the controller surface persist into the .docx the user
 * actually keeps.
 */
function ExportButton() {
  const host = useSuperDocHost();

  const onClick = async () => {
    if (!host) return;
    try {
      await host.export({
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
    <button className="tb-btn export-btn" disabled={!host} title="Download as DOCX" onClick={onClick}>
      Export DOCX
    </button>
  );
}

/**
 * Clicking the comment button opens the inline composer in the
 * activity panel (see `<CommentComposer>`). The button is disabled
 * when there's no positional selection (`target` null), since
 * `comments.createFromSelection` would have nothing to anchor to.
 */
function CommentButton({ onCompose }: { onCompose(): void }) {
  const ui = useSuperDocUI();
  const selection = useSuperDocSelection();
  const disabled = !ui || selection.empty || selection.target === null;

  return (
    <button
      className="tb-btn"
      disabled={disabled}
      title="Add comment on selection"
      onClick={onCompose}
    >
      <CommentIcon />
    </button>
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

function CommentIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

