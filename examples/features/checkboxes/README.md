# SuperDoc Checkboxes Example (Vue)

This example demonstrates how to add interactive checkbox support to SuperDoc documents using Vue.

## Features

- **Custom toolbar button** — Adds an "Insert Checkbox" button to the toolbar
- **Insert checkboxes** — Create checkbox content controls at the cursor position
- **Toggle checkboxes** — Click to toggle checked/unchecked state
- **List checkboxes** — Sidebar shows all checkboxes in the document with their state

## Running the example

```bash
cd examples/features/checkboxes
pnpm install
pnpm dev
```

Open http://localhost:5173 and upload a `.docx` file to get started.

## How it works

SuperDoc implements checkboxes as **Content Controls** (OOXML Structured Document Tags). The Document API provides full control over checkbox behavior.

### Insert a checkbox

```javascript
// Create a checkbox content control at the cursor
const result = await editor.doc.create.contentControl({
  kind: 'inline',           // 'inline' for within text, 'block' for paragraph-level
  controlType: 'checkbox',
  tag: 'my-checkbox',       // Optional: for finding the checkbox later
});

if (result.success) {
  console.log('Created checkbox:', result.contentControl.nodeId);
}
```

### Toggle a checkbox

```javascript
await editor.doc.contentControls.checkbox.toggle({
  target: {
    kind: 'inline',       // or 'block'
    nodeType: 'sdt',
    nodeId: 'your-node-id',
  },
});
```

### Get checkbox state

```javascript
const state = editor.doc.contentControls.checkbox.getState({
  target: {
    kind: 'inline',
    nodeType: 'sdt',
    nodeId: 'your-node-id',
  },
});
console.log('Is checked:', state.checked);
```

### Set checkbox state

```javascript
await editor.doc.contentControls.checkbox.setState({
  target: {
    kind: 'inline',
    nodeType: 'sdt',
    nodeId: 'your-node-id',
  },
  checked: true,
});
```

### Find checkboxes by tag

```javascript
const checkboxes = editor.doc.contentControls.selectByTag({
  tag: 'task-item',
});

checkboxes.items.forEach((cb) => {
  console.log(cb.nodeId, cb.title);
});
```

### Customize checkbox symbols

```javascript
await editor.doc.contentControls.checkbox.setSymbolPair({
  target: { kind: 'inline', nodeType: 'sdt', nodeId: 'your-node-id' },
  checkedSymbol: { font: 'Wingdings', char: '\u00FC' },   // ✓
  uncheckedSymbol: { font: 'Wingdings', char: '\u00A8' }, // □
});
```

## Adding a toolbar button

Use the `customButtons` option in the toolbar module configuration:

```javascript
new SuperDoc({
  selector: '#editor',
  document: file,
  toolbar: '#toolbar',
  modules: {
    toolbar: {
      customButtons: [
        {
          type: 'button',
          name: 'insertCheckbox',
          tooltip: 'Insert Checkbox',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg>',
          group: 'center',
          command: async () => {
            const editor = superdoc.activeEditor;
            await editor.doc.create.contentControl({
              kind: 'inline',
              controlType: 'checkbox',
              tag: `checkbox-${Date.now()}`,
            });
          },
        },
      ],
    },
  },
});
```

## Word compatibility

Checkboxes use the OOXML `w14:checkbox` namespace, ensuring proper import/export with Microsoft Word. Documents containing checkboxes will render correctly in Word and vice versa.
