# Vanilla editor fixture

Create `src/embed-superdoc.js`.

Required:

- Create the `src` directory if it does not exist.
- Import `SuperDoc` from `superdoc`.
- Import `superdoc/style.css`.
- Export an `embedSuperDoc({ file })` function.
- Create `new SuperDoc({ selector: '#editor', documentMode: 'editing', documents: [...] })`.
- Pass the incoming `file` as the DOCX document data.

Use `documentMode: 'editing'`. Do not use unsupported modes such as `edit`, `view`, or `suggest`.
Do not answer with instructions only. Modify the workspace.
