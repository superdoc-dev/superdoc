# SuperDoc React + TypeScript Example

A TypeScript example demonstrating `@superdoc-dev/react` integration with full type safety.

## Features Demonstrated

- **File Upload** - Load `.docx` files with type-safe event handlers
- **Mode Switching** - Toggle between editing, suggesting, and viewing modes
- **Ref API** - Access SuperDoc instance methods with proper typing
- **Export** - Download documents as DOCX
- **User Info** - Pass typed user information to the editor
- **Loading States** - Custom loading UI with `renderLoading`
- **Event Callbacks** - Typed callbacks for editor events

## Run

```bash
# From repo root
pnpm install
pnpm -C examples/getting-started/react dev
```

## Key Types Used

```typescript
import type { SuperDocRef, DocumentMode } from '@superdoc-dev/react';

// Ref for accessing instance methods
const editorRef = useRef<SuperDocRef>(null);

// Typed document mode state
const [mode, setMode] = useState<DocumentMode>('editing');

// Access instance with proper types
const instance = editorRef.current?.getInstance();
await instance?.export({ triggerDownload: true });
```

## Project Structure

```
src/
├── App.tsx        # Main component with SuperDoc integration
├── App.css        # Styles
├── main.tsx       # Entry point
└── index.css      # Global styles
```
