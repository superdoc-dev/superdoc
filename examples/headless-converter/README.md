# Headless Converter

Convert DOCX files to HTML, JSON, text, or Markdown using SuperEditor in headless mode.

## Setup

```bash
npm install
```

## Usage

```bash
npx tsx src/index.ts <input.docx> [--format html|json|text|md]
```

Examples:
```bash
npx tsx src/index.ts document.docx                  # text (default)
npx tsx src/index.ts document.docx --format html    # HTML
npx tsx src/index.ts document.docx --format json    # ProseMirror JSON
npx tsx src/index.ts document.docx --format md      # Markdown
```
