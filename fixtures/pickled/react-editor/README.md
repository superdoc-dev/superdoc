# React editor fixture

Create `src/ContractEditor.tsx`.

Required:

- Export `ContractEditor({ file }: { file: File })`.
- Import `SuperDocEditor` from `@superdoc-dev/react`.
- Import `@superdoc-dev/react/style.css`.
- Render `<SuperDocEditor document={file} documentMode="editing" ... />`.
- Include an `onReady` callback.

Do not import from `superdoc`.
Do not use unsupported document modes such as `edit`, `view`, or `suggest`.
Do not answer with instructions only. Modify the workspace.
