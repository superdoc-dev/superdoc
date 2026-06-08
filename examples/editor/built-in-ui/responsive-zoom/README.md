# Responsive zoom

Minimal React example for `zoom.mode: 'fit-width'`. The editor starts in fit-width mode, updates as its container changes, and exposes the current zoom and viewport metrics through callbacks.

## What it shows

- Configure automatic fit-width zoom with `SuperDocEditor`.
- Read applied zoom with `onZoomChange`.
- Read the latest fit target with `onViewportChange`.
- Return to fit-width mode after a manual zoom change.

## Run it

```bash
cd examples/editor/built-in-ui/responsive-zoom
pnpm install
pnpm build
pnpm dev
```

## Core pattern

```tsx
<SuperDocEditor
  document="/test_file.docx"
  zoom={{
    mode: 'fit-width',
    fitWidth: { min: 50, max: 100, padding: 32 },
  }}
  onZoomChange={({ zoom, mode }) => {
    console.log({ zoom, mode });
  }}
  onViewportChange={({ fitZoom }) => {
    console.log({ fitZoom });
  }}
/>
```

## Related docs

- [SuperDoc configuration](https://docs.superdoc.dev/editor/superdoc/configuration#param-zoom)
- [SuperDoc methods](https://docs.superdoc.dev/editor/superdoc/methods#setzoommode)
- [SuperDoc events](https://docs.superdoc.dev/editor/superdoc/events#viewport-change)
