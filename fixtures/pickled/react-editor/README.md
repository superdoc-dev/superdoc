# React editor fixture

Create `src/ContractEditor.tsx`.

Required:

- Export `ContractEditor({ file }: { file: File })`.
- Create the `src` directory if it does not exist.
- Import `SuperDocEditor` from `@superdoc-dev/react`.
- Import `@superdoc-dev/react/style.css`.
- Render `<SuperDocEditor document={file} documentMode="editing" ... />`.
- Include an `onReady` callback.

Use this shape:

```tsx
import { SuperDocEditor } from '@superdoc-dev/react';
import '@superdoc-dev/react/style.css';

export function ContractEditor({ file }: { file: File }) {
  return (
    <SuperDocEditor
      document={file}
      documentMode="editing"
      onReady={({ superdoc }) => console.log('Ready', superdoc)}
    />
  );
}
```

Do not import from `superdoc`.
Do not use unsupported document modes such as `edit`, `view`, or `suggest`.
Do not answer with instructions only. Modify the workspace.
