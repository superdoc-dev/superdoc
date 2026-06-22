# Custom Context Menu Advanced Demo

Demonstrates how to build a fully custom context menu with:
- Custom SVG icons
- Keyboard shortcut hints (⌘B, ⌘I, etc.)
- Custom padding via CSS variables
- Selection-aware behavior (shows "Select some text first..." when no selection)
- Event-based architecture (menu emits commands, App handles execution)

## Key pattern

This demo does NOT use `getContextMenuItems()`. Instead, it builds a completely custom menu component that:
1. Defines its own menu items with icons, labels, shortcuts
2. Checks for text selection before showing actionable items
3. Emits command events via `onCommand` callback
4. App.tsx handles commands by calling `ui.toolbar.execute()`
5. Uses CSS variables for easy padding/density customization

## Architecture

```
ContextMenu                     App
    │                            │
    │  onCommand('toggleBold')   │
    ├───────────────────────────►│
    │                            │  ui.toolbar.execute('toggleBold')
    │                            ├───────────────────────────────────►
```

## CSS variables for customization

```css
.context-menu {
  --ctx-padding-x: 12px;
  --ctx-padding-y: 8px;
  --ctx-icon-size: 16px;
  --ctx-icon-gap: 12px;
  --ctx-shortcut-gap: 24px;
}
```

## How to run

```bash
cd superdoc/public
pnpm install
pnpm --filter custom-context-menu-advanced run dev
```

## Files

- `src/components/ContextMenu.tsx` - Custom menu component with icons and shortcuts
- `src/App.tsx` - Handles command events from ContextMenu
- `src/styles.css` - CSS with customizable variables for padding/density
