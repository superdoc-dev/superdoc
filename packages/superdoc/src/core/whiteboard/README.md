# Whiteboard (POC)

This module provides a lightweight whiteboard layer for PDF annotations.
It is **in progress** and the public API may change.

---

## Enable whiteboard

When creating SuperDoc:

```js
const superdoc = new SuperDoc({
  // ...
  modules: {
    whiteboard: {
      enabled: true,
    },
  },
});
```

`enabled: true` shows the whiteboard layer by default.

---

## Public API

All APIs are exposed via `superdoc.whiteboard`.

### register(type, items)
Register palette items (e.g. stickers, comments).

```js
superdoc.whiteboard.register('stickers', [
  { id: 'check-mark', label: 'Check', src: '/stickers/check-mark.svg', width: 100, height: 83 },
]);
```

### getType(type)
Returns the registered items for a given type.

```js
const stickers = superdoc.whiteboard.getType('stickers');
```

### getWhiteboardData()
Returns JSON for all pages (strokes/text/images).

```js
const data = superdoc.whiteboard.getWhiteboardData();
```

### setWhiteboardData(json)
Restores state from JSON.

```js
superdoc.whiteboard.setWhiteboardData(saved);
```

### Events
`whiteboard:change` fires on any change.\
`whiteboard:tool` fires when the active tool changes.\
`whiteboard:enabled` fires when interactivity is toggled.

```js
superdoc.on('whiteboard:change', (data) => {
  console.log(data);
});

superdoc.on('whiteboard:tool', (tool) => {
  console.log(tool);
});

superdoc.on('whiteboard:enabled', (enabled) => {
  console.log(enabled);
});
```

---

## Modes (tools)

The whiteboard has a global tool mode:

- **select** — default. You can select/drag/resize items and drop stickers/text.
- **draw** — draw strokes only (no selection/drag/resize).
- **erase** — erases only strokes (no selection/drag/resize).
- **text** — add text by click; selection/drag/resize disabled.

These modes are intentionally strict to avoid ambiguous interactions.

---

## Demo / example

See:
`examples/advanced/grading-papers-comments-annotations`

---

## PDF support

Whiteboard currently targets the PDF flow. To use it reliably:
- Ensure PDF viewer is enabled in SuperDoc.
- Whiteboard page sizes come from PDF `page-ready` events.

### PDF.js setup

Install a compatible pdfjs-dist version:

```
npm install pdfjs-dist@4.3.136
```

Supported range: `>=4.3.136 <=4.6.82`  
Recommended: `4.3.136` (more tested in our flows).

Example configuration:

```js
import { SuperDoc } from '@harbour-enterprises/superdoc';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import * as pdfjsViewer from 'pdfjs-dist/web/pdf_viewer.mjs';

const config = {
  modules: {
    pdf: {
      pdfLib: pdfjsLib,
      pdfViewer: pdfjsViewer,
      setWorker: true, // or set to 'false' and register the worker globally outside the component.
      workerSrc: pathToWorker, // If omitted, it will fall back to the CDN worker.
      textLayerMode: 0, // 0 or 1
    },
  },
};

new SuperDoc(config);
```

Note: PDF support is evolving and some behavior may change as the integration stabilizes.
