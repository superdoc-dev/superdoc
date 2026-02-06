# Vue Custom Plugin Example

This example shows how to use SuperDoc inside a Vue 3 + Vite application and register a custom extension that injects a ProseMirror plugin via `addPmPlugins()`.

The plugin listens for selection changes, highlights the block node that currently contains the cursor, and emits a `custom-plugin:active-block` event. The host Vue component listens to that event and displays a short preview of the active block.

## Getting Started

```bash
npm install
npm run dev
```

Then open the printed local URL in your browser. Click around inside the editor to see the highlight and the metadata update. Use the **Import DOCX** button to load a document, or **Reset Document** to return to a blank state.

## Key Files

- `src/custom-plugin-extension.js` – defines the SuperDoc extension and ProseMirror plugin.
- `src/App.vue` – boots the editor, wires up the custom plugin events, and handles document uploading.
