# @superdoc/react

Official React wrapper for [SuperDoc](https://www.superdoc.dev) - a document editing and rendering library for the web.

## Features

- Component-based API with TypeScript support
- Proper lifecycle management
- SSR safe (dynamic imports)
- React Strict Mode compatible
- Full access to SuperDoc API via ref
- Loading state support via render prop

## Installation

```bash
npm install @superdoc/react superdoc
# or
pnpm add @superdoc/react superdoc
# or
yarn add @superdoc/react superdoc
```

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
        console.log('SuperDoc is ready!', superdoc);
      }}
    />
  );
}
```

## Props

### Document Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `document` | `File \| Blob \| string \| object` | - | Document to load (File, Blob, URL, or config object) |
| `documentMode` | `'editing' \| 'viewing' \| 'suggesting'` | `'editing'` | The editing mode |
| `role` | `'editor' \| 'viewer' \| 'suggester'` | `'editor'` | User's role |

### User Props

| Prop | Type | Description |
|------|------|-------------|
| `user` | `{ name: string; email?: string; image?: string }` | Current user |
| `users` | `Array<{ name: string; email: string; image?: string }>` | All users (for @-mentions) |

### Module Props

| Prop | Type | Description |
|------|------|-------------|
| `modules` | `object` | Configuration for modules (comments, ai, collaboration, toolbar) |

### UI Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `toolbar` | `boolean` | `true` | Show/hide the toolbar |
| `rulers` | `boolean` | - | Show/hide rulers |
| `pagination` | `boolean` | - | Enable/disable pagination |
| `className` | `string` | - | Additional CSS class |
| `style` | `CSSProperties` | - | Inline styles |

### Callbacks

| Prop | Type | Description |
|------|------|-------------|
| `onReady` | `({ superdoc }) => void` | Called when SuperDoc is ready |
| `onEditorCreate` | `({ editor }) => void` | Called when an editor is created |
| `onEditorDestroy` | `() => void` | Called when an editor is destroyed |
| `onEditorUpdate` | `({ editor }) => void` | Called on editor updates |
| `onContentError` | `({ error, editor, documentId, file }) => void` | Called on content errors |
| `onException` | `({ error }) => void` | Called on exceptions |

### Loading

| Prop | Type | Description |
|------|------|-------------|
| `renderLoading` | `() => ReactNode` | Render function for loading state |

### Advanced

| Prop | Type | Description |
|------|------|-------------|
| `config` | `Partial<SuperDocConfig>` | Pass-through config for SuperDoc constructor |

## Ref API

Access SuperDoc methods via ref:

```tsx
import { useRef } from 'react';
import { SuperDocEditor, SuperDocRef } from '@superdoc/react';

function App() {
  const ref = useRef<SuperDocRef>(null);

  const handleExport = async () => {
    const blob = await ref.current?.export({ triggerDownload: false });
    // Handle blob...
  };

  return <SuperDocEditor ref={ref} document={file} />;
}
```

### Ref Methods

| Method | Return Type | Description |
|--------|-------------|-------------|
| `getInstance()` | `SuperDoc \| null` | Get the underlying SuperDoc instance |
| `setDocumentMode(mode)` | `void` | Change document mode |
| `export(options?)` | `Promise<Blob \| void>` | Export the document |
| `getHTML(options?)` | `string[]` | Get HTML content |
| `focus()` | `void` | Focus the editor |
| `search(text)` | `SearchResult[]` | Search for text |
| `goToSearchResult(match)` | `void` | Navigate to search result |
| `setLocked(locked)` | `void` | Lock/unlock the document |
| `setHighContrastMode(enabled)` | `void` | Toggle high contrast mode |
| `setTrackedChangesPreferences(prefs)` | `void` | Set tracked changes preferences |
| `save()` | `Promise<void[]>` | Save (collaboration mode) |
| `toggleRuler()` | `void` | Toggle ruler visibility |
| `setDisableContextMenu(disabled)` | `void` | Enable/disable context menu |
| `addCommentsList(element)` | `void` | Add comments list to element |
| `removeCommentsList()` | `void` | Remove comments list |

> **Note:** Ref methods return `undefined` or empty arrays before the component is ready.

## Examples

### Basic Usage

```tsx
import { SuperDocEditor } from '@superdoc/react';
import '@superdoc/react/style.css';

<SuperDocEditor document={file} documentMode="editing" />
```

### With Loading State

```tsx
<SuperDocEditor
  document={file}
  renderLoading={() => <div className="spinner">Loading...</div>}
  onReady={() => console.log('Ready!')}
/>
```

### Viewing Mode

```tsx
<SuperDocEditor
  document={file}
  documentMode="viewing"
  role="viewer"
  toolbar={false}
/>
```

### With User Info

```tsx
<SuperDocEditor
  document={file}
  user={{ name: 'John Doe', email: 'john@example.com' }}
  users={[
    { name: 'Jane Smith', email: 'jane@example.com' },
    { name: 'Bob Wilson', email: 'bob@example.com' },
  ]}
/>
```

### With Collaboration

```tsx
<SuperDocEditor
  document={file}
  modules={{
    collaboration: {
      ydoc: myYDoc,
      provider: myProvider,
    },
  }}
/>
```

### With AI Features

```tsx
<SuperDocEditor
  document={file}
  modules={{
    ai: {
      apiKey: 'your-api-key',
      endpoint: 'https://api.example.com',
    },
  }}
/>
```

### Export Document

```tsx
const ref = useRef<SuperDocRef>(null);

const handleDownload = async () => {
  await ref.current?.export({ triggerDownload: true });
};

<SuperDocEditor ref={ref} document={file} />
<button onClick={handleDownload}>Download</button>
```

### Switch Document Mode

```tsx
const ref = useRef<SuperDocRef>(null);

<SuperDocEditor ref={ref} document={file} />
<button onClick={() => ref.current?.setDocumentMode('viewing')}>
  Switch to Viewing
</button>
```

### Document Switching

The component automatically rebuilds when the `document` prop changes:

```tsx
const [currentDoc, setCurrentDoc] = useState(doc1);

<SuperDocEditor document={currentDoc} />
<button onClick={() => setCurrentDoc(doc2)}>Load Doc 2</button>
```

## Styles

You must import the styles in your application:

```tsx
import '@superdoc/react/style.css';
```

## TypeScript

All types are exported from the package:

```tsx
import type {
  SuperDocEditorProps,
  SuperDocRef,
  DocumentMode,
  UserRole,
  SuperDocUser,
  ExportOptions,
  // ... more types
} from '@superdoc/react';
```

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## React Version

Requires React 16.8.0 or higher (hooks support).

## License

AGPL-3.0
