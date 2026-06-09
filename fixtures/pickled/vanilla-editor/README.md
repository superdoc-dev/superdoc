# Vanilla editor fixture

This is a file-editing task. Complete `src/embed-superdoc.js` before your final
response. A response without file changes fails.

Required:

- Import `SuperDoc` from `superdoc`.
- Import `superdoc/style.css`.
- Export an `embedSuperDoc({ file })` function.
- Create `new SuperDoc({ selector: '#editor', documentMode: 'editing', documents: [...] })`.
- Pass the incoming `file` as the DOCX document data.

Use this shape:

```js
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

export function embedSuperDoc({ file }) {
  return new SuperDoc({
    selector: '#editor',
    documentMode: 'editing',
    documents: [
      {
        id: 'contract',
        type: 'docx',
        data: file,
      },
    ],
  });
}
```

Use `documentMode: 'editing'`. Do not use unsupported modes such as `edit`,
`view`, or `suggest`.
Do not answer with instructions only. Modify the workspace first.
