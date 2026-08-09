# @superdoc-dev/react

Official React wrapper for the SuperDoc browser editor.

## Install

```bash
npm install @superdoc-dev/react react react-dom
```

## Quick start

```tsx
import { SuperDocEditor } from '@superdoc-dev/react';
import '@superdoc-dev/react/style.css';

export function Editor({ document }: { document: File }) {
  return <SuperDocEditor document={document} />;
}
```

See the [React quick start](https://docs.superdoc.dev/editor/frameworks/react) for a complete example.

## License

AGPL-3.0. Commercial licenses are available from [SuperDoc](https://www.superdoc.dev).
