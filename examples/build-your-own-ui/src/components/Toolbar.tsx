import type { ToolbarSnapshotSlice } from 'superdoc/ui';
import { shallowEqual } from 'superdoc/ui';
import { useSuperDocUI, useSuperDocSlice } from '../lib/SuperDocUIProvider';
import { InsertClauseButton } from './InsertClauseButton';

const EMPTY_SNAPSHOT: ToolbarSnapshotSlice = { context: null, commands: {} };

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
 * Toolbar reads its state and dispatches its actions through
 * `ui.toolbar` and `ui.commands.<id>`. Two patterns to notice:
 *
 *   1. `useSuperDocSlice` binds the React tree to the
 *      `Subscribable` exposed on `ui.toolbar`. The component
 *      re-renders only when the snapshot changes (shallow-equal),
 *      not on every editor transaction.
 *   2. `ui.commands[id].execute(payload?)` fires a button. The
 *      same surface drives built-ins (this file) and custom
 *      commands (`InsertClauseButton.tsx`).
 *
 * We deliberately keep this file dumb about which commands exist or
 * what they mean — it walks a static list and reads its state from
 * the snapshot. Adding a built-in is a one-line entry; adding a
 * custom command is a separate component that calls
 * `ui.commands.register({...})`.
 */
export function Toolbar() {
  const ui = useSuperDocUI();
  const snapshot = useSuperDocSlice<ToolbarSnapshotSlice>(
    (controller) => controller.select((state) => state.toolbar, shallowEqual),
    EMPTY_SNAPSHOT,
  );

  const ready = !!ui;
  const stateOf = (id: string) => snapshot.commands[id];
  const execute = (id: string, payload?: unknown) => {
    if (!ui) return;
    // `ui.commands` is a string-indexed proxy; the typed surface includes
    // `register` (non-id member) plus per-id `CommandHandle` entries. Cast
    // through `unknown` so the structural mismatch on `register` doesn't
    // trip the lookup site.
    const handle = (ui.commands as unknown as Record<string, {
      execute: (payload?: unknown) => boolean | Promise<boolean>;
    }>)[id];
    handle?.execute(payload);
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Document toolbar">
      <div className="toolbar-group">
        {TEXT_BUTTONS.map((b) => (
          <button
            key={b.id}
            className={`tb-btn ${stateOf(b.id)?.active ? 'active' : ''}`}
            disabled={!ready || !!stateOf(b.id)?.disabled}
            title={b.title}
            style={b.fontStyle}
            onClick={() => execute(b.id)}
          >
            {b.label}
          </button>
        ))}
      </div>

      <div className="toolbar-group">
        {HISTORY_BUTTONS.map((b) => (
          <button
            key={b.id}
            className="tb-btn"
            disabled={!ready || !!stateOf(b.id)?.disabled}
            title={b.title}
            onClick={() => execute(b.id)}
          >
            {b.label}
          </button>
        ))}
      </div>

      <div className="toolbar-group">
        <button
          className={`tb-btn ${stateOf('bullet-list')?.active ? 'active' : ''}`}
          disabled={!ready || !!stateOf('bullet-list')?.disabled}
          title="Bullet list"
          onClick={() => execute('bullet-list')}
        >
          <BulletListIcon />
        </button>
        <button
          className={`tb-btn ${stateOf('numbered-list')?.active ? 'active' : ''}`}
          disabled={!ready || !!stateOf('numbered-list')?.disabled}
          title="Numbered list"
          onClick={() => execute('numbered-list')}
        >
          <OrderedListIcon />
        </button>
      </div>

      <div className="toolbar-group">
        <CommentButton />
        <InsertClauseButton />
      </div>
    </div>
  );
}

/**
 * Comment button — wired to `ui.commands.register` is overkill since
 * comment creation is a built-in concept, not a custom one. We bind
 * directly to `ui.comments.createFromSelection({ text })`. The
 * "comment here?" prompt is a simple `window.prompt` for the demo;
 * a real consumer would render a popover.
 */
function CommentButton() {
  const ui = useSuperDocUI();
  const selection = useSuperDocSlice(
    (controller) => controller.select((state) => state.selection, shallowEqual),
    { empty: true, target: null, activeMarks: [], activeCommentIds: [], activeChangeIds: [], quotedText: '' },
  );
  const disabled = !ui || selection.empty || selection.target === null;

  return (
    <button
      className="tb-btn"
      disabled={disabled}
      title="Add comment on selection"
      onClick={() => {
        if (!ui || disabled) return;
        const text = window.prompt('Comment:');
        if (!text) return;
        ui.comments.createFromSelection({ text });
      }}
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
      <path d="M3 13a9 9 0 1 0 3-7.7L3 8" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 7v6h-6" />
      <path d="M21 13a9 9 0 1 1-3-7.7l3 2.7" />
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

