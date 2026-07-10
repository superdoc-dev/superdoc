# AI Highlight Replace Demo

## Overview
This demo showcases AI-powered text replacement in SuperDoc. Users can:
1. Select text in the document
2. Right-click on the selected text to see context menu
3. Click "Replace with AI" (first option)
4. Enter a prompt (e.g., "make this more formal", "translate to Spanish")
5. The selected text is replaced with AI-generated content

## Files

### Frontend Components
- `src/App.tsx` - Main app layout with editor and AI popover state management
- `src/components/Toolbar.tsx` - Simplified toolbar (B, I, U, Font, Undo, Redo, Lists, Import, Export)
- `src/components/ContextMenu.tsx` - Right-click context menu
- `src/components/ContextMenuRegistrations.tsx` - Registers "Replace with AI" and "Copy" menu items
- `src/components/AIPromptPopover.tsx` - AI prompt input popover

### Backend
- `backend/server.ts` - Express server that proxies OpenAI API calls
- `backend/package.json` - Backend dependencies

## Running the Demo

### Start Backend
```bash
cd demos/editor/ai-highlight-replace/backend
pnpm install
OPENAI_API_KEY=your-key-here pnpm dev
```

### Start Frontend
```bash
cd demos/editor/ai-highlight-replace
pnpm install
pnpm dev
```

## Key Features
- **Replace with AI**: First option in context menu when text is selected
- **Copy**: Standard copy-to-clipboard functionality
- **Clean UI**: Minimal toolbar with essential formatting options
- **Import/Export**: Full DOCX round-trip support

## Technical Details

### Selection Capture Pattern
The AI popover uses `ui.selection.capture()` to freeze the selection when the context menu opens. This prevents selection loss when focus moves to the input field.

### Context Menu Position Tracking
App.tsx tracks the last `contextmenu` event position so the AI popover can appear exactly where the context menu was.
