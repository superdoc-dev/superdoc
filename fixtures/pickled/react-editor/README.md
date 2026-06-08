# React editor fixture

This is a file-editing task. Complete `src/ContractEditor.tsx` before your
final response. A response without file changes fails.

Required:

- Export `ContractEditor({ file }: { file: File })`.
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
Do not answer with instructions only. Modify the workspace first.
