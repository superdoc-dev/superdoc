# @superdoc/react

Official React wrapper for [SuperDoc](https://www.superdoc.dev) - embed a full-featured DOCX editor in your React app.

## Installation

```bash
npm install @superdoc/react
# or
pnpm add @superdoc/react
# or
yarn add @superdoc/react
```

> **Note:** `superdoc` is included as a dependency - you don't need to install it separately.

## Quick Start

```tsx
import { SuperDocEditor } from '@superdoc/react';
import '@superdoc/react/style.css';

function App() {
  return (
    <SuperDocEditor
      document={file}
      documentMode="editing"
      onReady={({ superdoc }) => {
        console.log('Editor is ready!');
      }}
    />
  );
}
```

That's it! You now have a fully functional DOCX editor.

---

## Core Concepts

### The Component

`<SuperDocEditor>` is the main component. It handles:

- **Mounting**: Creates a SuperDoc instance when the component mounts
- **Updates**: Rebuilds when the `document` prop changes
- **Cleanup**: Properly destroys the instance on unmount
- **SSR Safety**: Uses dynamic imports to prevent server-side errors

### Document Modes

SuperDoc has three document modes:

| Mode | Description | Use Case |
|------|-------------|----------|
| `editing` | Full editing capabilities | Default editing experience |
| `viewing` | Read-only presentation | Document preview |
| `suggesting` | Track changes mode | Collaborative review |

```tsx
<SuperDocEditor document={file} documentMode="editing" />
```

> **Tip:** To change modes without rebuilding, use the ref method `setDocumentMode()` instead of changing the prop.

### User Roles

Roles control what actions a user can perform:

| Role | Can Edit | Can Suggest | Can View |
|------|----------|-------------|----------|
| `editor` | Yes | Yes | Yes |
| `suggester` | No | Yes | Yes |
| `viewer` | No | No | Yes |

```tsx
<SuperDocEditor document={file} role="editor" />
```

---

## Working with Refs

For programmatic control, use a ref:

```tsx
import { useRef } from 'react';
import { SuperDocEditor, SuperDocRef } from '@superdoc/react';

function App() {
  const editorRef = useRef<SuperDocRef>(null);

  const handleExport = async () => {
    // Export as DOCX file
    await editorRef.current?.export({ triggerDownload: true });
  };

  const handleSwitchMode = () => {
    // Switch to viewing mode without rebuilding
    editorRef.current?.setDocumentMode('viewing');
  };

  return (
    <>
      <SuperDocEditor ref={editorRef} document={file} />
      <button onClick={handleExport}>Download DOCX</button>
      <button onClick={handleSwitchMode}>Switch to View</button>
    </>
  );
}
```

### Available Ref Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getInstance()` | `SuperDoc \| null` | Access the underlying SuperDoc instance |
| `setDocumentMode(mode)` | `void` | Change mode without rebuild |
| `export(options?)` | `Promise<Blob \| void>` | Export document as DOCX |
| `getHTML(options?)` | `string[]` | Get document as HTML |
| `focus()` | `void` | Focus the editor |
| `search(text)` | `SearchResult[]` | Search document content |
| `goToSearchResult(match)` | `void` | Navigate to a search result |
| `setLocked(locked)` | `void` | Lock/unlock editing |
| `toggleRuler()` | `void` | Toggle ruler visibility |
| `save()` | `Promise<void[]>` | Save (in collaboration mode) |

> **Note:** All ref methods safely return `undefined` or empty arrays if called before the editor is ready.

---

## Loading States

Show a loading indicator while SuperDoc initializes:

```tsx
<SuperDocEditor
  document={file}
  renderLoading={() => (
    <div className="loading-spinner">
      Loading document...
    </div>
  )}
/>
```

---

## Props Reference

### Document Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `document` | `File \| Blob \| string \| object` | required | Document to load |
| `documentMode` | `'editing' \| 'viewing' \| 'suggesting'` | `'editing'` | Initial editing mode |
| `role` | `'editor' \| 'viewer' \| 'suggester'` | `'editor'` | User's permission level |

### User Props

| Prop | Type | Description |
|------|------|-------------|
| `user` | `{ name, email?, image? }` | Current user info |
| `users` | `Array<{ name, email, image? }>` | All users (for @-mentions) |

### UI Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `toolbar` | `boolean` | `true` | Show/hide toolbar |
| `rulers` | `boolean` | `false` | Show/hide rulers |
| `pagination` | `boolean` | `true` | Enable pagination |
| `className` | `string` | - | CSS class for wrapper |
| `style` | `CSSProperties` | - | Inline styles |

### Event Callbacks

| Prop | Type | Description |
|------|------|-------------|
| `onReady` | `({ superdoc }) => void` | Editor initialized |
| `onEditorCreate` | `({ editor }) => void` | ProseMirror editor created |
| `onEditorDestroy` | `() => void` | Editor destroyed |
| `onEditorUpdate` | `({ editor }) => void` | Content changed |
| `onContentError` | `(event) => void` | Document parsing error |
| `onException` | `({ error }) => void` | Runtime error |

### Advanced Props

| Prop | Type | Description |
|------|------|-------------|
| `modules` | `object` | Configure collaboration, AI, comments |
| `config` | `Partial<SuperDocConfig>` | Pass-through to SuperDoc constructor |
| `renderLoading` | `() => ReactNode` | Custom loading UI |

---

## Common Patterns

### File Upload

```tsx
function DocumentEditor() {
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  };

  return (
    <div>
      <input type="file" accept=".docx" onChange={handleFileChange} />
      {file && <SuperDocEditor document={file} />}
    </div>
  );
}
```

### Document Switching

The editor automatically rebuilds when the `document` prop changes:

```tsx
function MultiDocEditor() {
  const [currentDoc, setCurrentDoc] = useState(doc1);

  return (
    <div>
      <button onClick={() => setCurrentDoc(doc1)}>Doc 1</button>
      <button onClick={() => setCurrentDoc(doc2)}>Doc 2</button>
      <SuperDocEditor document={currentDoc} />
    </div>
  );
}
```

### View-Only Mode

```tsx
<SuperDocEditor
  document={file}
  documentMode="viewing"
  role="viewer"
  toolbar={false}
/>
```

### With User Information

```tsx
<SuperDocEditor
  document={file}
  user={{
    name: 'John Doe',
    email: 'john@example.com',
    image: 'https://example.com/avatar.jpg'
  }}
  users={[
    { name: 'Jane Smith', email: 'jane@example.com' },
    { name: 'Bob Wilson', email: 'bob@example.com' },
  ]}
/>
```

### Real-time Collaboration

```tsx
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

function CollaborativeEditor() {
  const ydoc = useMemo(() => new Y.Doc(), []);
  const provider = useMemo(
    () => new WebsocketProvider('wss://your-server.com', 'doc-id', ydoc),
    [ydoc]
  );

  return (
    <SuperDocEditor
      document={file}
      modules={{
        collaboration: {
          ydoc,
          provider,
        },
      }}
    />
  );
}
```

### AI Features

```tsx
<SuperDocEditor
  document={file}
  modules={{
    ai: {
      apiKey: 'your-api-key',
      endpoint: 'https://api.example.com/ai',
    },
  }}
/>
```

### Export to HTML

```tsx
const editorRef = useRef<SuperDocRef>(null);

const getHtmlContent = () => {
  const htmlArray = editorRef.current?.getHTML();
  console.log(htmlArray); // Array of HTML strings per section
};
```

### Search and Navigate

```tsx
const editorRef = useRef<SuperDocRef>(null);

const handleSearch = (query: string) => {
  const results = editorRef.current?.search(query);
  if (results?.length) {
    editorRef.current?.goToSearchResult(results[0]);
  }
};
```

---

## Styling

### Required CSS Import

Always import the styles:

```tsx
import '@superdoc/react/style.css';
```

### Custom Styling

The component renders with a `superdoc-wrapper` class:

```css
.superdoc-wrapper {
  height: 100%;
  /* your custom styles */
}
```

---

## TypeScript

All types are exported:

```tsx
import type {
  SuperDocEditorProps,
  SuperDocRef,
  DocumentMode,
  UserRole,
  SuperDocUser,
  ExportOptions,
} from '@superdoc/react';
```

---

## Framework Integration

### Next.js (App Router)

```tsx
'use client';

import dynamic from 'next/dynamic';

const SuperDocEditor = dynamic(
  () => import('@superdoc/react').then(mod => mod.SuperDocEditor),
  { ssr: false }
);

export default function Page() {
  return <SuperDocEditor document={file} />;
}
```

### Next.js (Pages Router)

```tsx
import dynamic from 'next/dynamic';

const SuperDocEditor = dynamic(
  () => import('@superdoc/react').then(mod => mod.SuperDocEditor),
  { ssr: false }
);

export default function Page() {
  return <SuperDocEditor document={file} />;
}
```

### Vite / Create React App

Works out of the box - just import and use.

---

## Troubleshooting

### "document is not defined" (SSR)

The component uses dynamic imports internally, but if you still see SSR errors:

```tsx
// Use dynamic import in Next.js
const SuperDocEditor = dynamic(
  () => import('@superdoc/react').then(mod => mod.SuperDocEditor),
  { ssr: false }
);
```

### React Strict Mode Double-Mount

The component handles React 18 Strict Mode correctly. The internal `#destroyed` flag prevents issues from double-invocation during development.

### Document Not Loading

1. Check that the file is a valid `.docx` file
2. Verify the `document` prop is a `File`, `Blob`, URL string, or config object
3. Check browser console for `onContentError` events

### Mode Changes Don't Work

Use ref methods for mode changes instead of props:

```tsx
// Correct - uses ref method
editorRef.current?.setDocumentMode('viewing');

// Avoid - causes full rebuild
<SuperDocEditor documentMode={mode} />
```

---

## Browser Support

| Browser | Version |
|---------|---------|
| Chrome | Latest |
| Firefox | Latest |
| Safari | Latest |
| Edge | Latest |

## React Version

Requires **React 16.8.0** or higher (hooks support).

## License

AGPL-3.0
