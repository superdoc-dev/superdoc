# Layered CSS: DOCX + PDF

This example validates the optional layered stylesheet entrypoint:

- imports `superdoc/style.layered.css`
- loads either `.docx` or `.pdf`
- enables `pdfjs-dist` text layer to verify PDF viewer styles inside layered mode
- applies app-level overrides in `@layer app` to confirm cascade behavior

## Run

```bash
cd examples/editor/theming/layered-docx-pdf
pnpm install
pnpm dev
```

## What to verify

1. Toolbar overrides apply (blue gradient) via app layer.
2. DOCX renders normally with layered stylesheet.
3. PDF renders with text layer and highlight styling override.
