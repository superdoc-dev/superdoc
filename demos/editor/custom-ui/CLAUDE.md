# AI Text Highlight Feature

## Overview
This feature adds AI-powered text replacement to the custom-ui React demo. Users can:
1. Select text in the document
2. Right-click on the selected text
3. Enter a prompt (e.g., "make this more formal", "translate to Spanish")
4. The selected text is replaced with AI-generated content

## Files Created/Modified

### New Files
- `src/components/AIPromptPopover.tsx` - React component for the right-click AI prompt popover
- `backend/server.ts` - Express server that proxies OpenAI API calls
- `backend/package.json` - Backend dependencies (express, cors, openai, tsx)
- `backend/tsconfig.json` - TypeScript config for backend

### Modified Files
- `src/App.tsx` - Added `<AIPromptPopover />` component import and usage
- `src/styles.css` - Added `.ai-prompt-popover` styles at the end of file

## How It Works

### Frontend (AIPromptPopover.tsx)
1. Listens for `contextmenu` events on the document
2. Only shows when there's a text selection AND the right-click is inside the selection
3. Uses `ui.selection.capture()` to freeze the selection before focus moves to the textarea
4. On submit, calls backend `/api/ai-replace` with `selectedText` and `prompt`
5. Uses `editor.doc.replace({ target, text })` to replace the selected text with AI response
6. Uses `stopImmediatePropagation()` to prevent the existing ContextMenu from also showing

### Backend (server.ts)
- Simple Express server on port 3001
- `/api/ai-replace` POST endpoint accepts `{ selectedText, prompt }`
- Calls OpenAI `gpt-4o-mini` with a system prompt for text transformation
- Returns `{ text: "transformed text" }`
- `/health` endpoint for health checks
- Lazy-initializes OpenAI client to avoid startup errors when API key is missing

## Running the Demo

### Start Backend
```bash
cd demos/editor/custom-ui/backend
pnpm install
OPENAI_API_KEY=your-key-here pnpm dev
# Or without API key (will error on AI requests but server starts):
pnpm dev
```

### Start Frontend
```bash
cd demos/editor/custom-ui
pnpm dev
```

### Test the Feature
1. Open http://localhost:5173 (or whatever port Vite uses)
2. Select some text in the document
3. Right-click on the selected text
4. Enter a prompt and click "Replace with AI" or press Cmd+Enter

## Key Implementation Details

### Selection Capture Pattern
The popover uses `ui.selection.capture()` to freeze the selection when it opens. This is necessary because when the user clicks into the textarea, browser focus moves away from the editor and the selection would be lost. The captured selection is restored before calling `doc.replace()`.

### Event Priority
The AIPromptPopover is rendered BEFORE the ContextMenu component in App.tsx, and uses `event.stopImmediatePropagation()` to prevent the ContextMenu from also handling the right-click when there's a selection.

### Type Casting for Editor Access
The demo uses type casting to access `host.activeEditor.doc.replace()` since the public types don't expose this directly:
```typescript
const editor = (host as unknown as { activeEditor?: EditorHandle }).activeEditor;
```

## TODO / Future Improvements
- Add loading spinner/animation
- Support streaming responses
- Add prompt history/favorites
- Add keyboard shortcut to trigger (e.g., Cmd+Shift+A)
- Support multiple AI providers (Claude, etc.)
