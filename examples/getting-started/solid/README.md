# SuperDoc Solid + TypeScript Example

A TypeScript example demonstrating `superdoc` integration with Solid.

## Features Demonstrated

- **File Upload** - Load `.docx` files with typed event handlers
- **Mode Switching** - Toggle between editing, suggesting, and viewing modes
- **Instance API** - Access SuperDoc instance methods with proper typing
- **Export** - Download documents as DOCX
- **User Info** - Pass typed user information to the editor
- **Loading States** - Show loading UI while SuperDoc initializes
- **Event Callbacks** - Typed callbacks for editor events

## Run

```bash
# From repo root
pnpm install
pnpm -C examples/getting-started/solid dev
```

## Key Types Used

```typescript
import { SuperDoc } from 'superdoc';

type SuperDocInstance = InstanceType<typeof SuperDoc>;
type SuperDocConfig = ConstructorParameters<typeof SuperDoc>[0];
type DocumentMode = NonNullable<SuperDocConfig['documentMode']>;

// Ref for accessing instance
let superdoc: SuperDocInstance | null = null;

// Typed document mode signal
const [mode, setMode] = createSignal<DocumentMode>('editing');

// Access instance
superdoc?.setDocumentMode(mode());
await superdoc?.export({ triggerDownload: true });
```

## Project Structure

```text
src/
├── App.tsx        # Main component with SuperDoc integration
├── App.css        # Styles
├── index.tsx      # Entry point
└── index.css      # Global styles
```
