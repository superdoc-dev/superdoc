# @superdoc-dev/react

Official React wrapper for [SuperDoc](https://www.superdoc.dev).

## Installation

```bash
npm install @superdoc-dev/react
```

> `superdoc` is included as a dependency - no need to install it separately.

## Pinning SuperDoc Version (Optional)

If you need to force a specific `superdoc` version (for example, to align multiple apps or test a local build), pin it in your app's `package.json` using overrides.

### npm

```json
{
  "overrides": {
    "superdoc": "1.14.1"
  }
}
```

### pnpm

```json
{
  "pnpm": {
    "overrides": {
      "superdoc": "1.14.1"
    }
  }
}
```

Then run your package manager install command again.

## Quick Start

```tsx
import { SuperDocEditor } from '@superdoc-dev/react';
import '@superdoc-dev/react/style.css';

function App() {
  return <SuperDocEditor document={file} />;
}
```

## Changing Mode

Just update the `documentMode` prop - the component handles it efficiently (no rebuild):

```tsx
function App() {
  const [mode, setMode] = useState<DocumentMode>('editing');

  return (
    <>
      <button onClick={() => setMode('viewing')}>View</button>
      <button onClick={() => setMode('editing')}>Edit</button>
      <SuperDocEditor document={file} documentMode={mode} />
    </>
  );
}
```

## Using the Ref

Access SuperDoc methods via `getInstance()`:

```tsx
import { useRef } from 'react';
import { SuperDocEditor, SuperDocRef } from '@superdoc-dev/react';

function App() {
  const ref = useRef<SuperDocRef>(null);

  const handleExport = async () => {
    await ref.current?.getInstance()?.export({ triggerDownload: true });
  };

  return (
    <>
      <SuperDocEditor ref={ref} document={file} />
      <button onClick={handleExport}>Export</button>
    </>
  );
}
```

## Props

All [SuperDoc config options](https://docs.superdoc.dev) are available as props, plus:

| Prop | Type | Description |
|------|------|-------------|
| `id` | `string` | Custom container ID (auto-generated if not provided) |
| `renderLoading` | `() => ReactNode` | Loading UI |
| `hideToolbar` | `boolean` | Hide toolbar (default: false) |
| `className` | `string` | Wrapper CSS class |
| `style` | `CSSProperties` | Wrapper inline styles |

### Props That Trigger Rebuilds

These props cause the SuperDoc instance to be destroyed and recreated when changed:

- `document` - The document to load
- `user` - Current user identity
- `users` - List of users
- `modules` - Module configuration (collaboration, comments, etc.)
- `role` - User permission level
- `hideToolbar` - Toolbar visibility

### Props Handled Efficiently

These props are applied without rebuilding:

- `documentMode` - Calls `setDocumentMode()` internally

### Initial-Only Props

Other SuperDoc options (`rulers`, `pagination`, etc.) are applied only on initialization. To change them at runtime, use `getInstance()`:

```tsx
ref.current?.getInstance()?.toggleRuler();
```

### Common Props

```tsx
<SuperDocEditor
  document={file}              // File, Blob, URL, or config object
  documentMode="editing"       // 'editing' | 'viewing' | 'suggesting'
  role="editor"                // 'editor' | 'viewer' | 'suggester'
  user={{ name: 'John', email: 'john@example.com' }}
  onReady={({ superdoc }) => console.log('Ready!')}
  onEditorCreate={({ editor }) => console.log('Editor created')}
/>
```

## Examples

### View-Only Mode

```tsx
<SuperDocEditor
  document={file}
  documentMode="viewing"
  hideToolbar
/>
```

### File Upload

```tsx
function Editor() {
  const [file, setFile] = useState<File | null>(null);

  return (
    <>
      <input type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      {file && <SuperDocEditor document={file} />}
    </>
  );
}
```

### With Collaboration

```tsx
<SuperDocEditor
  document={file}
  modules={{
    collaboration: { ydoc, provider },
  }}
/>
```

## Next.js

```tsx
'use client';

import dynamic from 'next/dynamic';

const SuperDocEditor = dynamic(
  () => import('@superdoc-dev/react').then((m) => m.SuperDocEditor),
  { ssr: false }
);
```

## TypeScript

```tsx
import type {
  SuperDocEditorProps,
  SuperDocRef,
  DocumentMode,
  UserRole,
  SuperDocUser,
} from '@superdoc-dev/react';
```

Types are extracted from the `superdoc` package, ensuring they stay in sync.

## License

AGPL-3.0

