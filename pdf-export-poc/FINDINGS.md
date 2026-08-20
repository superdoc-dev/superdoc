# Client-side DOCX → PDF export for SuperDoc V2 — R&D findings

**Goal.** A programmatic, fully client-side export from Editor V2 —
`await superdoc.export({ exportType: ['pdf'], triggerDownload: true })` — that
preserves the document's formatting and keeps links clickable, small enough to
run on memory-constrained/mobile devices.

**TL;DR.**

- **Typst is the wrong engine for this**, and two of the brief's premises don't
  hold up under measurement (details below). It is a *reflow* typesetter with
  no DOCX input; using it would re-lay-out the document and would *not* match
  what SuperDoc renders.
- The approach that works is to **emit the PDF from SuperDoc's own rendered
  pages** with [pdf-lib](https://pdf-lib.js.org/) (pure JS, **no WASM**). Because
  SuperDoc V2 already computes a pixel-accurate paginated layout in the browser,
  redrawing that layout into a PDF is **WYSIWYG by construction**, with
  selectable text, embedded subset fonts and clickable links.
- Built and validated end-to-end against the supplied **calibre torture-test
  DOCX** (334 paragraphs, 6 tables incl. nested/merged, 4 images, 19 hyperlinks,
  footnotes + endnotes, a TOC, multi-level lists). The 8-page export is
  **~108 KB**; the export machinery adds **~0.9 MB gzip and zero `.wasm`**.

---

## 1. Why not Typst

| Brief's premise | Measured reality |
|---|---|
| "Lazy-load Typst and convert the DOCX to PDF." | Typst has **no DOCX importer**. It consumes its own `.typ` markup. A DOCX→Typst path means a **lossy Pandoc conversion** that discards Word styles, margins, page geometry, complex tables and **embedded fonts** — i.e. exactly the formatting we're trying to preserve. |
| "…uniquely small at <10 MB each." | The only Typst package that actually **emits PDF** (`@myriaddreamin/typst-ts-web-compiler`) is **≈10.8 MB gzipped / 28 MB raw — over budget before a single font**, and it does not bundle fonts (Typst's default families add several MB more → ~15 MB+). The tiny 356 KB "renderer" package cannot compile or produce PDF. |
| "…or takumi-pdf." | **takumi-pdf is not Typst.** It's a separate Rust HTML/CSS→PDF engine (~1.5 MB). The brief conflates two unrelated projects. |
| Preserve the DOCX's formatting. | Typst is a **constraint-based reflow engine**: it re-breaks lines and re-paginates with its own layout model and has **no primitive to place a pre-computed page layout** verbatim. Output would be a nice-looking but *different* document, and would not match SuperDoc's on-screen rendering. |

Typst produces excellent PDFs (selectable text, subset fonts, clickable links)
— but only for documents **it** lays out from semantic markup. That is the
opposite of "mirror what SuperDoc shows." **Recommendation: do not pursue Typst
for fidelity-preserving DOCX→PDF.** (It would only make sense if the goal were
to *re-author* a document from semantic content.)

## 2. The approach that works: render SuperDoc's own layout to PDF

SuperDoc V2's layout engine already paints a fully paginated DOM:
`.superdoc-layout` → `.superdoc-page[data-page-index]` → `.superdoc-line` →
`.superdoc-text-run`, with **real `<a>` hyperlinks** and `<img>` images. The
exporter ([`src/exporter.ts`](./src/exporter.ts)) treats that DOM as the source
of truth and redraws it with pdf-lib:

- **Text — word-anchored + width-matched.** For every run we split into word
  tokens and draw each at its browser-measured `getBoundingClientRect()`
  position and baseline, then **horizontally scale each word to its measured
  width**. Anchoring per word plus width-matching means spacing matches the
  editor **exactly regardless of which font we embed** (this is what keeps
  substituted-font documents from jamming words together). Text stays
  **selectable** (verified with `pdftotext`).
- **Fonts — the DOCX's own embedded fonts, byte-exact.** We unzip the DOCX,
  read `word/fontTable.xml`, **deobfuscate the `.odttf` files** (XOR the first 32
  bytes with the reversed `w:fontKey` GUID) and embed those exact fonts (subset).
  Families the DOCX doesn't embed fall back to bundled open substitutes (Ubuntu
  sans, PT Serif, Ubuntu Mono), and **per-glyph** to a DejaVu Sans fallback for
  characters the chosen font lacks (geometric bullets, dingbats).
- **Links — clickable annotations.** External URLs become `/URI` actions;
  in-document TOC anchors become `/GoTo` destinations.
- **Backgrounds & borders** are replayed from computed styles, reproducing
  tables, cell borders, paragraph shading, highlights and inverse-video.
- **Images** are re-encoded to PNG via `<canvas>` and embedded (handles
  data:/blob: and GIF/WebP sources uniformly). **Vector shapes/charts** (inline
  SVG) are translated to **true vector** pdf-lib paths, with a raster fallback
  for SVGs too complex to translate.
- **Header/footer page numbers — better than the editor.** SuperDoc's layout
  drops the *result* of `PAGE`/`NUMPAGES` fields (it renders "Page  of " with no
  number and no reserved space), so no DOM-only exporter can show page numbers.
  We solve it by **parsing those fields out of the DOCX's header/footer XML**
  (`fieldResolve.ts`) and **redrawing just those lines** with the real numbers
  filled in (`Page 2 of 5`), using the paragraph's own alignment, size and
  colour. Validated on a generated fixture with a centered header and a
  page-numbered footer across a multi-page + two-column document.
- **Virtualization.** V2 only paints pages near the viewport. The exporter
  **scrolls each page into view, waits for it to paint, then captures it**, so a
  full document exports even in a normal-height window (validated at 1280×800).

pdf-lib + fontkit are **lazy-imported only when an export is triggered**, matching
the "load the engine on demand" requirement — but at ~0.9 MB gzip instead of a
15 MB+ WASM stack.

## 3. Fidelity — validated against the supplied torture-test DOCX

The export reproduces SuperDoc's rendering of every feature in the sample:

- ✅ **Byte-exact embedded fonts** (the DOCX's own deobfuscated Ubuntu / Ubuntu
  Mono, subset-embedded), selectable text
- ✅ Bold / italic / bold-italic / **underline / strikethrough**
- ✅ Super/subscript, colored runs (red/green/blue), **yellow highlight**,
  **inverse-video** (white-on-black)
- ✅ Monospace runs (Ubuntu Mono)
- ✅ Tables incl. **nested + merged cells**, the "fancy calendar", cell borders
- ✅ Paragraph shading, right-alignment + right border, hanging indents, drop-style headings
- ✅ Table of Contents with **tab leaders + right-aligned page numbers**
- ✅ **Multi-level lists** — bullet, decimal (`1.`, `1.1.`, `1.1.1.`) and roman
  (`i.`, `ii.`) markers at every level, with hanging indents
- ✅ Dropcap (58.5pt "D"), footnotes + endnotes (superscript refs + note text at page foot)
- ✅ Images (4/4): inline, left/right float, centered block
- ✅ Vector shapes / drawings (rasterized from inline SVG — validated on a
  separate shapes fixture)
- ✅ Clickable links — external (`http://calibre-ebook.com/download`) + internal TOC jumps
- ✅ Correct at any editor **zoom** (export resets zoom to 100% and restores it)
- ✅ **Running headers/footers, with live page numbers** — see note below
- ✅ Vector shapes (rasterized from inline SVG)

Also validated on a **second, unrelated document** (a multi-section NDA using
Cambria/serif with no embedded fonts): headings, bullets, numbered clauses and
justified body all export cleanly. That test surfaced — and drove the fix for —
the per-word width-matching described above (substituted fonts otherwise jam
words together). Load your own `.docx` via the **"Open .docx…"** button to try
more.

**It is WYSIWYG with the editor.** Where SuperDoc itself wraps the narrow
calendar cells ("Sun" → "Su/n"), the PDF wraps identically — the exporter mirrors
the engine, it does not re-layout. (This is also why any difference vs. the
supplied reference PDF is a *SuperDoc rendering* question, not an exporter one —
the reference was produced by a different renderer that substituted Ubuntu and
left-aligned the title.)

Output size: **~108 KB** for the 8-page document. Export machinery in the
production build: **fontkit ≈331 KB gzip + pdf-lib**, and **no `.wasm` files at
all**. (The large chunks in the build are SuperDoc's own engine, which the app
loads regardless of export.)

## 3b. `mode: 'pixel'` — literal 100% pixel parity with the editor

The default vector mode above matches the editor to the **anti-aliasing floor**
(~2.5% of pixels differ, all thin grey glyph-edge halos from two different
rasterizers — verified by localized cluster analysis to contain zero structural
differences). For callers who need *literal* pixel identity, the exporter now has
a second strategy:

**`mode: 'pixel'`** embeds each page as an image **rasterized by the browser's
own engine**, with an invisible selectable-text + clickable-link overlay on top.

- **How:** the page element is deep-cloned with every element's computed style
  frozen inline, wrapped in an SVG `<foreignObject>`, and drawn to a canvas.
  Unlike html2canvas (a from-scratch JS re-implementation of CSS painting, which
  we measured at **7% diff — worse than vector**), a `<foreignObject>` image is
  painted by the *same Blink layout+paint pipeline* as the live page.
- **The unlock:** SuperDoc registers the DOCX's embedded fonts via the
  **FontFace API** under synthetic `__superdoc_embedded_N__<Family>` names —
  no CSS `@font-face` exists, and an isolated SVG image cannot see
  `document.fonts`, so text initially fell back to system fonts (4.3% diff).
  Fix: re-declare the font bytes the exporter already extracts from the DOCX
  (`fontExtract.ts`) as **data-URI `@font-face` rules inside the SVG**, under
  both the plain and synthetic family names.
- **Proof:** extracting the page image back out of the exported PDF
  (`pdfimages`) and diffing against a device-scale-2 screenshot of the live
  editor page: **100.00% identical — 0 of 3.4M pixels differ** on the calibre
  torture-test, and **100.00%** on a Hebrew RTL fixture. (Rasterizing the PDF
  with poppler shows ~3%, but that is poppler's own image resampling — the
  same measurement artifact any raster PDF exhibits.)
- **RTL/Arabic solved:** because the browser performs bidi + cursive shaping and
  the export photographs the result, pixel mode sidesteps the one fundamental
  limit of the vector path (§4.6) entirely.
- **Costs:** ~190 KB/page on dense pages (1.5 MB vs 117 KB for the 8-page
  sample), ~700 ms/page (5.7 s vs 1.6 s), and text prints as 2× raster — crisp
  on screen and normal print, but not vector-crisp under extreme zoom. Text
  selection order over RTL follows the logical-order invisible layer.

**Recommendation:** keep `word` as the default; offer `pixel` for
pixel-critical documents, and consider auto-selecting it when a document
contains RTL/complex scripts.

## 4. Known limitations & gaps

1. **Symbol glyphs.** Handled by **per-glyph font fallback**: when the primary
   font lacks a glyph (checked via fontkit), the exporter draws that token from a
   bundled DejaVu Sans fallback. This fixed the geometric list bullets
   (▪ ◦ ● ○ ■ □) that were rendering as `□` tofu. Remaining edge: glyphs from a
   *legacy Symbol/Wingdings-encoded* run (private-use code points) would still
   need a code-point → Unicode map; not seen in the tested documents.
2. **Internal links are bounded by what SuperDoc paints.** The TOC has ~35
   anchors but SuperDoc emits only 3 bookmark targets (`data-bookmark-name`) into
   the DOM, so only those resolve to `/GoTo`. A DOM-based exporter can only link
   what's rendered — a model-based export (§5) could reach every target.
3. **Word-level, not glyph-level** positioning. Intra-word kerning is the
   embedded font's, not SuperDoc's canvas-measured advance. Invisible in
   practice; a glyph-level pass would need SuperDoc's per-glyph metrics.
4. **Vector drawings / charts** are emitted as **true vector** — inline SVG
   paths/shapes are translated to pdf-lib drawing ops (crisp at any zoom), with
   automatic **rasterization fallback** for SVGs we don't translate (gradients,
   filters, arcs/circles, transforms). Validated on a shapes fixture (square +
   pentagon export as vectors, 0 image XObjects).
5. **CJK — supported.** Chinese/Japanese/Korean glyphs render via a **lazily
   loaded** Noto Sans SC fallback (only fetched the first time a CJK glyph is
   seen) plus **per-character font fallback** (each glyph drawn with the first
   face that covers it). Validated on a generated Chinese + Japanese document;
   text stays selectable.
6. **RTL / complex scripts — solved in `pixel` mode; mostly solved in vector.**
   In **vector (`word`) mode**, Hebrew body text renders correctly (each glyph is
   drawn at its browser-measured visual position, so the browser's bidi is
   inherited), **bold Hebrew keeps its weight** (weight-aware DejaVu Sans Bold
   fallback), and **synthesized RTL footer fields** (real page numbers, which
   have no DOM layout to borrow bidi from) get a level-1 visual reorder. The
   remaining vector-mode gap is **Arabic cursive shaping** — pdf-lib has no
   HarfBuzz, so joined forms can't be produced. **`mode: 'pixel'` (§3b) removes
   the limit entirely**: the browser shapes the text and the export embeds its
   exact pixels (verified 100.00% on a Hebrew fixture).
7. **Multi-column** sections export at whatever geometry SuperDoc lays out
   (in testing, content stayed in the first column) — faithful to the editor,
   but SuperDoc's own column balancing is the limit.
8. **Large documents.** Export scrolls + waits for each page to paint. Measured
   ~**76 ms/page** in vector mode (the 8-page sample exports in ~0.6 s), so a
   100-page document is ~8 s — acceptable, and the **scrolling is now hidden
   behind a progress overlay**. `pixel` mode is ~700 ms/page. A model-based
   export (§5) would remove the scroll entirely.

### Editor-parity fixes found by pixel-level diffing (Aug 2026)

Localized cluster diffing (192 dpi, connected-component analysis rather than
whole-page averages) against live editor screenshots surfaced four real,
systematic exporter bugs — all fixed and re-verified:

1. **Floating images were see-through.** Images that paint in front of text
   (absolutely-positioned fragments with `z-index ≥ 0`, e.g. Word "in front of
   text" floats) were drawn *before* the text pass, so overlapping words bled
   through them. They are now deferred and drawn after the text, matching CSS
   paint order.
2. **Bold Hebrew fell back to regular.** The Hebrew-capable fallback face
   (DejaVu Sans) was loaded weight-blind. A bold DejaVu face is now bundled and
   the fallback is weight-aware.
3. **RTL page-number fields drew in logical order** ("עמוד 1 מתוך 2" reversed) —
   fixed with a level-1 bidi visual reorder for field text.
4. **Table borders sat ~1.5 CSS px off.** pdf-lib strokes lines centered on the
   path; CSS paints borders *inside* the box edge. Every border stroke is now
   inset by half its width — borders land pixel-exact on the editor's.

## 5. Recommendations

1. **Ship the DOM-based exporter as the client-side PDF path.** It is small,
   WASM-free, WYSIWYG, and reuses the layout the team already built. Wire it into
   `SuperDoc.export()` behind `exportType: ['pdf']` (done in this PR — see
   `packages/superdoc/src/core/export/pdf-export.ts`).
2. **Font fidelity — largely done.** The exporter already extracts + embeds the
   DOCX's own fonts byte-exact (`fontExtract.ts`) and width-matches every word so
   substitutes don't shift spacing. Remaining polish: bundle open symbol fonts
   (or map Symbol/Wingdings code points) for "fancy" bullets, and add a real
   serif substitute. Alternatively, have `@superdoc/font-system` retain the
   source `ArrayBuffer` it already receives in `registerOwnedFace` so the
   exporter can reuse it without re-parsing the DOCX.
3. **For links/anchors beyond the painted DOM, and for headless/server-side
   export**, add a **model-based exporter from `ResolvedLayout`** (the engine's
   resolved, absolutely-positioned page tree). It would reach every bookmark
   target, not require scrolling, and run without a live viewport — at the cost
   of reproducing justification/tab logic the browser currently does for us. The
   DOM exporter and a model exporter can share the pdf-lib drawing layer.
4. **Do not invest in Typst / takumi** for fidelity-preserving export. Revisit
   only if a future feature wants engine-authored *re-layout* from semantic
   content rather than a faithful mirror of the editor.

## 6. Alternatives considered

| Approach | WASM | Size | Selectable text | Clickable links | Faithful to SuperDoc's layout |
|---|---|---|---|---|---|
| **pdf-lib from SuperDoc's DOM, vector (`word`, this POC)** | No | ~0.9 MB gz | Yes | Yes (URI + GoTo) | **Yes — mirrors the render (to the AA floor)** |
| **`<foreignObject>` raster sandwich (`pixel`, this POC)** | No | ~0.9 MB gz | Yes (invisible layer) | Yes | **Literally 100.00% — the browser's own pixels** |
| pdf-lib from `ResolvedLayout` (future) | No | ~0.9 MB gz | Yes | Yes | Yes, headless-capable; must re-derive justification |
| html2canvas raster sandwich | No | +200 KB | Yes (invisible layer) | Yes | **No — re-implements CSS painting; measured 7% diff, worse than vector** |
| Typst WASM | Yes | ~15 MB+ | Yes | Yes | **No — reflows, no DOCX input** |
| takumi-pdf | Yes | ~1.5 MB | Yes | via CSS | No — HTML/CSS reflow |
