import { useEffect, useState, type ReactNode } from 'react';
import type { EditorAdapter } from '../core/EditorAdapter';
import type { ToolbarCommandId, ToolbarState } from '../core/types';

interface Props {
  adapter: EditorAdapter;
}

// Inline SVG icons (Lucide-style). Inlined here so the example app
// has no extra dependency for icon rendering.
const ICON_SIZE = 16;
const iconProps = {
  width: ICON_SIZE,
  height: ICON_SIZE,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const BulletListIcon = () => (
  <svg {...iconProps} aria-hidden>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const OrderedListIcon = () => (
  <svg {...iconProps} aria-hidden>
    <line x1="10" y1="6" x2="21" y2="6" />
    <line x1="10" y1="12" x2="21" y2="12" />
    <line x1="10" y1="18" x2="21" y2="18" />
    <path d="M4 6h1v4" />
    <path d="M4 10h2" />
    <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
  </svg>
);

const LinkIcon = () => (
  <svg {...iconProps} aria-hidden>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const GROUPS: { label: string; items: { id: ToolbarCommandId; label: ReactNode; title: string }[] }[] = [
  {
    label: 'Text',
    items: [
      { id: 'bold', label: 'B', title: 'Bold (⌘B)' },
      { id: 'italic', label: 'I', title: 'Italic (⌘I)' },
      { id: 'underline', label: 'U', title: 'Underline (⌘U)' },
      { id: 'strike', label: 'S', title: 'Strikethrough' },
      { id: 'highlight', label: 'H', title: 'Highlight' },
    ],
  },
  {
    label: 'Headings',
    items: [
      { id: 'h1', label: 'H1', title: 'Heading 1' },
      { id: 'h2', label: 'H2', title: 'Heading 2' },
    ],
  },
  {
    label: 'Lists',
    items: [
      { id: 'bullet-list', label: <BulletListIcon />, title: 'Bullet list' },
      { id: 'ordered-list', label: <OrderedListIcon />, title: 'Ordered list' },
    ],
  },
  {
    label: 'Insert',
    items: [{ id: 'link', label: <LinkIcon />, title: 'Link' }],
  },
];

export function Toolbar({ adapter }: Props) {
  const [state, setState] = useState<ToolbarState>(() => adapter.getToolbarState());

  useEffect(() => {
    return adapter.onToolbarStateChange(setState);
  }, [adapter]);

  const click = (id: ToolbarCommandId) => {
    if (id === 'link') {
      const href = prompt('URL?');
      if (href) adapter.executeCommand(id, { href });
      return;
    }
    adapter.executeCommand(id);
  };

  const onExport = async () => {
    try {
      await adapter.exportDocx();
    } catch (err) {
      // Surface engine-level export gaps (e.g., TipTap has no native
      // DOCX export). Showing the actual error in an alert makes the
      // friction visible during the assessment instead of silently
      // dropping the click.
      alert(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const italicStyle = (id: ToolbarCommandId): React.CSSProperties => {
    if (id === 'bold') return { fontWeight: 700 };
    if (id === 'italic') return { fontStyle: 'italic' };
    if (id === 'underline') return { textDecoration: 'underline' };
    if (id === 'strike') return { textDecoration: 'line-through' };
    return {};
  };

  return (
    <div className="toolbar">
      {GROUPS.map((g) => (
        <div className="toolbar-group" key={g.label}>
          {g.items.map((item) => {
            const s = state[item.id];
            return (
              <button
                key={item.id}
                className={`tb-btn ${s.active ? 'active' : ''}`}
                title={item.title}
                disabled={s.disabled}
                onClick={() => click(item.id)}
                style={italicStyle(item.id)}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ))}
      <div className="toolbar-group" style={{ marginLeft: 'auto' }}>
        <button className="tb-btn" title="Export as DOCX" onClick={onExport}>
          Export DOCX
        </button>
      </div>
    </div>
  );
}
