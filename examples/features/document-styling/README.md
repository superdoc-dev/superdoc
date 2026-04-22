# Document Styling Demo

Demo showing how to customize SuperDoc's document appearance to match Microsoft Word's look and feel.

## Features

- **Word-like page shadow**: Uniform shadow on all sides
- **Crisp text rendering**: Subpixel antialiasing for improved text clarity
- **Gray document background**: Matches Word's default appearance

## Running the Demo

```bash
cd examples/features/document-styling
pnpm install
pnpm dev
```

## How It Works

This demo injects a stylesheet that targets SuperDoc's DOM elements:

```css
/* Page shadow - uniform on all sides like Word */
.superdoc-page {
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.15) !important;
  border: 1px solid #d4d4d4 !important;
}

/* Crisp text rendering with subpixel antialiasing */
.superdoc-layout {
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: subpixel-antialiased;
  -moz-osx-font-smoothing: auto;
}
```

## Applying These Styles in Your App

Add these CSS rules to your own stylesheets:

### Word-like page shadow

```css
.superdoc-page {
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.15) !important;
  border: 1px solid #d4d4d4 !important;
}
```

### Crisp text rendering

```css
.superdoc-layout {
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: subpixel-antialiased;
  -moz-osx-font-smoothing: auto;
}
```

### Gray background

```css
.editor-wrapper {
  background-color: #dedede;
}
```

## Related Issues

- IT-941: Document Fidelity - Improve text/page contrast
- IT-734: Customize the shadow on the document
