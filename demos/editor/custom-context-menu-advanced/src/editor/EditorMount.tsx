import { SuperDocEditor } from '@superdoc-dev/react';
import '@superdoc-dev/react/style.css';
import { useSetSuperDoc } from 'superdoc/ui/react';

const CURRENT_USER = { name: 'Alex Rivera', email: 'alex@example.com' };

// SVG icons as strings for the built-in context menu
const ICONS = {
  bold: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>',
  italic: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 4h-9"/><path d="M14 20H5"/><path d="M15 4L9 20"/></svg>',
  underline: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3v7a6 6 0 0 0 12 0V3"/><path d="M4 21h16"/></svg>',
  strikethrough: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16"/><path d="M17.5 7.5c-1.5-1.5-4-2-6.5-1.5s-4.5 2-5 4c-.5 2 .5 4 2.5 5"/><path d="M8.5 16.5c1.5 1.5 4 2 6.5 1.5s4-2 4.5-4"/></svg>',
  bulletList: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/></svg>',
  numberedList: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 6h11"/><path d="M10 12h11"/><path d="M10 18h11"/><text x="2" y="8" font-size="8" fill="currentColor">1</text><text x="2" y="14" font-size="8" fill="currentColor">2</text><text x="2" y="20" font-size="8" fill="currentColor">3</text></svg>',
};

// Custom items configuration for the built-in context menu
// These mirror the items in our custom ContextMenu component
const CUSTOM_CONTEXT_MENU_ITEMS = [
  {
    id: 'formatting',
    items: [
      {
        id: 'bold',
        label: 'Bold',
        icon: ICONS.bold,
        action: (editor: { commands: { toggleBold: () => void } }) => {
          editor.commands.toggleBold();
        },
        showWhen: (ctx: { hasSelection: boolean }) => ctx.hasSelection,
      },
      {
        id: 'italic',
        label: 'Italic',
        icon: ICONS.italic,
        action: (editor: { commands: { toggleItalic: () => void } }) => {
          editor.commands.toggleItalic();
        },
        showWhen: (ctx: { hasSelection: boolean }) => ctx.hasSelection,
      },
      {
        id: 'underline',
        label: 'Underline',
        icon: ICONS.underline,
        action: (editor: { commands: { toggleUnderline: () => void } }) => {
          editor.commands.toggleUnderline();
        },
        showWhen: (ctx: { hasSelection: boolean }) => ctx.hasSelection,
      },
      {
        id: 'strikethrough',
        label: 'Strikethrough',
        icon: ICONS.strikethrough,
        action: (editor: { commands: { toggleStrike: () => void } }) => {
          editor.commands.toggleStrike();
        },
        showWhen: (ctx: { hasSelection: boolean }) => ctx.hasSelection,
      },
    ],
  },
  {
    id: 'lists',
    items: [
      {
        id: 'bullet-list',
        label: 'Bulleted list',
        icon: ICONS.bulletList,
        action: (editor: { commands: { toggleBulletList: () => void } }) => {
          editor.commands.toggleBulletList();
        },
        showWhen: (ctx: { hasSelection: boolean }) => ctx.hasSelection,
      },
      {
        id: 'numbered-list',
        label: 'Numbered list',
        icon: ICONS.numberedList,
        action: (editor: { commands: { toggleOrderedList: () => void } }) => {
          editor.commands.toggleOrderedList();
        },
        showWhen: (ctx: { hasSelection: boolean }) => ctx.hasSelection,
      },
    ],
  },
];

// Modules config - always includes context menu with custom items
// The custom React component will intercept when in "custom" mode
const MODULES = {
  comments: {},
  trackChanges: { replacements: 'independent' as const },
  contextMenu: {
    includeDefaultItems: false,
    customItems: CUSTOM_CONTEXT_MENU_ITEMS,
  },
};

// Telemetry opt-out
const TELEMETRY = { enabled: false as const };

/**
 * Mounts `<SuperDocEditor>` and hands the running SuperDoc instance to
 * the {@link SuperDocUIProvider} once `onReady` fires.
 *
 * The built-in context menu is always configured with custom items.
 * When in "custom" mode, the separate `<ContextMenu>` React component
 * intercepts the contextmenu event before SuperDoc sees it.
 * When in "built-in" mode, the custom component is disabled and
 * SuperDoc's built-in menu (with our custom items) takes over.
 */
export function EditorMount() {
  const setSuperDoc = useSetSuperDoc();

  return (
    <SuperDocEditor
      document="/sample-review.docx"
      documentMode="editing"
      user={CURRENT_USER}
      modules={MODULES}
      telemetry={TELEMETRY}
      contained
      style={{ height: '100%' }}
      onReady={({ superdoc }: { superdoc: unknown }) => {
        setSuperDoc(superdoc);
      }}
    />
  );
}
