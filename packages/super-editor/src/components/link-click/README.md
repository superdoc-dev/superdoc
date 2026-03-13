# Link Click Handler

## Overview

The LinkClickHandler component enables interactive link editing in layout-engine rendered content. When a user clicks on a hyperlink in the presentation view, instead of navigating to the URL, it shows the same LinkInput popover that works in the legacy editor.

## Architecture

### 1. Renderer Layer (`packages/layout-engine/painters/dom/src/renderer.ts`)

The DomPainter's `applyLinkAttributes` method attaches a click event handler to every `<a>` element it renders:

```typescript
elem.addEventListener('click', (event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();

  const linkClickEvent = new CustomEvent('superdoc-link-click', {
    bubbles: true,
    composed: true,
    detail: {
      href: linkData.href,
      target: linkData.target,
      rel: linkData.rel,
      tooltip: linkData.tooltip,
      element: elem,
      clientX: event.clientX,
      clientY: event.clientY,
    },
  });
  elem.dispatchEvent(linkClickEvent);
});
```

**Key behaviors:**
- Prevents default link navigation (`event.preventDefault()`)
- Stops event propagation to avoid conflicts
- Dispatches a bubbling custom event with link metadata

### 2. Event Handler Layer (`packages/super-editor/src/components/link-click/LinkClickHandler.vue`)

A Vue component that listens for the `superdoc-link-click` event and displays the LinkInput popover:

```vue
<script setup>
const handleLinkClick = (event) => {
  // Move cursor to click position
  moveCursorToMouseEvent(event.detail, props.editor);

  // Check if cursor is now on a link mark
  setTimeout(() => {
    if (selectionHasNodeOrMark(state, 'link', { requireEnds: true })) {
      // Show LinkInput popover
      props.openPopover(
        markRaw(LinkInput),
        { showInput: true, editor: props.editor, closePopover: props.closePopover },
        { left: `${event.detail.clientX - surfaceRect.left}px`, top: `${...}px` }
      );
    }
  }, 10);
};
</script>
```

**Key behaviors:**
- Listens on the editor surface element (supports both legacy and layout-engine)
- Moves the ProseMirror selection to the click position
- Verifies the selection is inside a link mark
- Shows the LinkInput popover at the click position

### 3. Integration Layer (`packages/super-editor/src/components/SuperEditor.vue`)

The LinkClickHandler is instantiated alongside other editor components:

```vue
<LinkClickHandler
  v-if="editorReady && activeEditor"
  :editor="activeEditor"
  :openPopover="openPopover"
  :closePopover="closePopover"
/>
```

## Usage

The feature works automatically once integrated. When a user clicks a link in layout-engine rendered content:

1. **Click Event**: User clicks on `<a class="superdoc-link">...</a>`
2. **Navigation Prevented**: Default navigation is blocked
3. **Custom Event**: `superdoc-link-click` event bubbles up with metadata
4. **Cursor Movement**: ProseMirror selection moves to click position
5. **Link Detection**: System checks if selection is on a link mark
6. **Popover Display**: LinkInput popover appears with edit/remove/open options

## User Experience

### Before (without LinkClickHandler)
- Clicking a link navigates away from the editor
- Users lose unsaved changes
- No way to edit links in presentation view

### After (with LinkClickHandler)
- Clicking a link shows the LinkInput popover
- Users can edit URL, change link text, or remove the link
- Users can open the link in a new tab if desired
- Consistent UX between legacy and layout-engine rendering
- Internal anchor links (e.g., TOC entries) navigate to the target section instead of opening the popover

## Testing

### Unit Tests

**Renderer Tests** (`packages/layout-engine/painters/dom/src/link-click.test.ts`):
- Verifies links are rendered with click handlers
- Confirms `preventDefault()` is called
- Validates custom event dispatch with correct metadata
- Tests multiple links and edge cases

**Component Tests** (`packages/super-editor/src/components/link-click/LinkClickHandler.test.js`):
- Tests event listener attachment/removal
- Validates cursor movement and link detection
- Confirms popover positioning calculations
- Tests error handling for missing editor/surface

### Running Tests

```bash
# Renderer tests
cd packages/layout-engine/painters/dom
npm test -- link-click.test

# Component tests
cd packages/super-editor
npm test -- LinkClickHandler.test
```

## Technical Details

### Custom Event Schema

```typescript
interface LinkClickEventDetail {
  href: string;           // Sanitized URL
  target?: string;        // '_blank', '_self', etc. (auto-added for external links)
  rel?: string;           // 'noopener noreferrer' (auto-added for _blank)
  tooltip?: string | null; // Link tooltip/title
  element: HTMLAnchorElement; // The clicked element
  clientX: number;        // Click X coordinate
  clientY: number;        // Click Y coordinate
}
```

### Cursor Movement Strategy

The implementation uses a small timeout (10ms) after `moveCursorToMouseEvent` to ensure:
1. ProseMirror has processed the selection change
2. The transaction has been dispatched
3. Selection state is stable before checking for link marks

### Position Calculation

Popover position is calculated relative to the editor surface:

```javascript
left: `${event.detail.clientX - surfaceRect.left}px`
top: `${event.detail.clientY - surfaceRect.top + 15}px`
```

The 15px offset positions the popover slightly below the click point.

## Compatibility

- Works with both legacy (`view.dom`) and layout-engine (`presentationEditor.element`) surfaces
- Uses existing `getEditorSurfaceElement` utility for surface resolution
- Integrates with existing `LinkInput` component (no duplication)
- Follows patterns established by `ContextMenu` component

## Future Enhancements

Potential improvements:
- Keyboard shortcut to open link editor (e.g., Cmd+K while cursor is on link)
- Double-click to edit link (in addition to single-click)
- Hover preview of link destination
- Visual indication that links are editable (cursor style)
