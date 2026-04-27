import { useEffect, useState } from 'react';
import type { EditorAdapter } from '../core/EditorAdapter';
import type { ToolbarCommandId, ToolbarState } from '../core/types';

interface Props {
  adapter: EditorAdapter;
}

const GROUPS: { label: string; items: { id: ToolbarCommandId; label: string; title: string }[] }[] = [
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
      { id: 'bullet-list', label: '•', title: 'Bullet list' },
      { id: 'ordered-list', label: '1.', title: 'Ordered list' },
    ],
  },
  {
    label: 'Insert',
    items: [{ id: 'link', label: '🔗', title: 'Link' }],
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
    </div>
  );
}
