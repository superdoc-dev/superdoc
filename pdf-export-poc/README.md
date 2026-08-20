# SuperDoc V2 — client-side DOCX → PDF export (POC)

Proof of concept for a **programmatic, fully client-side** PDF export from the
SuperDoc V2 editor:

```js
const result = await superdoc.export({ exportType: ['pdf'], triggerDownload: true });
```

No server, **no WASM**. The PDF is built in the browser from SuperDoc's own
rendered pages, so it is WYSIWYG with the editor, with **selectable text,
embedded (subset) fonts and clickable links**.

## How it works

SuperDoc's layout engine already produces a pixel-accurate, paginated DOM
(`.superdoc-page` → `.superdoc-line` → `.superdoc-text-run`, real `<a>` links,
`<img>` images). The exporter (`src/exporter.ts`) walks that DOM and redraws it
into a PDF with [pdf-lib](https://pdf-lib.js.org/):

- **Text** is anchored **word-by-word** at the browser's measured coordinates
  and each word is **horizontally scaled to its measured width**, so spacing
  matches the editor exactly no matter which font is embedded.
- **Fonts**: the DOCX's **own embedded fonts are extracted, deobfuscated**
  (`.odttf`) and embedded byte-exact (`src/fontExtract.ts`); non-embedded
  families fall back to bundled substitutes (Ubuntu / PT Serif / Ubuntu Mono),
  and **per-glyph** to DejaVu Sans (symbols/bullets) or a lazily-loaded
  Noto Sans SC (**CJK**) for characters the chosen font lacks.
- **Links** become clickable PDF annotations — external URLs (`/URI`) and
  in-document TOC jumps (`/GoTo`).
- **Page numbers**: `PAGE`/`NUMPAGES` fields in headers/footers are parsed from
  the DOCX (`src/fieldResolve.ts`) and drawn with real numbers — something
  SuperDoc's own layout leaves blank.
- **Backgrounds & borders** reproduce tables, shading, rules and highlights.
- **Images** → PNG via `<canvas>`; **vector shapes/charts** → true vector
  paths (raster fallback for complex SVG).
- V2 virtualizes pages; the exporter **scrolls each page into view and waits
  for it to paint** (behind a progress overlay) so full documents export in a
  normal window.

pdf-lib + fontkit are **lazy-imported only when an export runs**.

## Export modes

The toolbar **mode** picker (or `?mode=` query param / `mode` export option)
selects the rendering strategy:

- **`word`** (default) — vector text as described above. Smallest files
  (~110 KB for the 8-page sample), crisp at any zoom. Matches the editor to the
  anti-aliasing floor (~2.5% of pixels, all glyph-edge halos — verified to
  contain zero structural differences). Hebrew renders correctly (incl. bold +
  RTL page-number fields); Arabic cursive joining is the one remaining gap
  (pdf-lib has no shaping engine).
- **`pixel`** — **literal 100.00% pixel parity with the editor**: each page is
  rasterized by the browser's own engine via SVG `<foreignObject>` (with the
  DOCX's embedded fonts re-declared as data-URI `@font-face` inside the SVG)
  and embedded as an image, plus an invisible selectable-text + clickable-link
  overlay. Verified 0-of-3.4M-pixels different per page on the calibre fixture
  and a Hebrew RTL fixture — RTL/Arabic shaping is exact by construction.
  Costs: ~190 KB/page dense, ~700 ms/page, text prints as 2× raster.

See `FINDINGS.md` §3b for the measurement methodology.

## Run

```bash
npm install
npm run dev        # http://127.0.0.1:4173  → click "Export PDF"
```

Use **"Open .docx…"** in the toolbar to load and export any Word document, not
just the bundled sample.

## Build & deploy (static)

```bash
npm run build      # -> dist/  (static; deploy anywhere)
npm run preview    # verify the production build locally
```

Deploy `dist/` to any static host, e.g. `npx vercel deploy --prebuilt` or
`npx netlify deploy --dir=dist --prod`.

## Validate (headless)

`node validate.mjs` (requires `npm i -D playwright` + `npx playwright install
chromium`) renders the sample doc, triggers the export, and writes
`out/output.pdf` for inspection.

See **[FINDINGS.md](./FINDINGS.md)** for the full R&D write-up, including why
Typst was evaluated and rejected.
