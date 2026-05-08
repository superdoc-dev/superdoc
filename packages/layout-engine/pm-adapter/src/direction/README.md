# Direction Resolver

The shared direction model for SuperDoc. Computes a typed
`ParagraphDirectionContext` once per paragraph during pm-adapter
conversion. Downstream consumers (DomPainter, layout-bridge, hit
testing) read from the resolved context — they do not re-derive
direction from raw attributes.

## The core principle: orthogonal axes, no auto-inheritance

OOXML expresses direction along several independent axes. Most do
NOT propagate to paragraph inline direction.

Per ECMA-376:

1. **Section `w:bidi` (§17.6.1)** affects section chrome only —
   page numbers, columns, gutters. It does NOT make paragraphs RTL.
2. **Paragraph `w:bidi` (§17.3.1.6)** affects paragraph-level
   properties only — indent, justification, tab stops, text
   direction. It does NOT reorder text within the paragraph.
3. **Table `w:bidiVisual` (§17.4.1)** affects cell ordering and
   table-level properties only. It does NOT make cell paragraphs
   RTL.
4. **Writing mode `w:textDirection` (§17.3.1.41)** is the one
   direction property that DOES inherit across containers — a
   paragraph inherits its cell's writing mode, then the section's,
   then horizontal-tb default.

The resolver chain enforces these rules by construction. A
contributor cannot accidentally make a downstream consumer infer
paragraph direction from section bidi.

## Public API

```ts
import {
  resolveSectionDirection,
  resolveTableDirection,
  resolveCellDirection,
  resolveParagraphDirection,
  resolveLogicalAlignment,
  resolveLogicalIndent,
  isRtl,
} from '@superdoc/pm-adapter/direction';
```

Each resolver consumes its parent's context and returns its own:

```ts
const sectionContext = resolveSectionDirection(sectPr);
const tableContext = resolveTableDirection(tblPr, sectionContext);
const cellContext = resolveCellDirection(tcPr, tableContext);
const paragraphContext = resolveParagraphDirection(
  resolvedParagraphProperties,
  sectionContext,
  cellContext,
);
```

The resolved `paragraphContext` carries:

- `inlineDirection: 'ltr' | 'rtl' | undefined` — paragraph inline
  base direction. Undefined when no explicit `w:bidi` is set in
  the paragraph or its style cascade. Consumers should omit the
  `dir` attribute when undefined and let the browser apply the
  Unicode Bidi Algorithm.
- `writingMode: 'horizontal-tb' | 'vertical-rl' | 'vertical-lr'` —
  text flow direction, inherited from the cell, then the section,
  then default.

## How downstream consumers read the context

The resolved context is written onto `ParagraphAttrs.directionContext`
during pm-adapter conversion. Downstream code reads it without
importing from pm-adapter (which would violate the package boundary):

```ts
// in layout-bridge or DomPainter
const inline = block.attrs.directionContext?.inlineDirection;
const writingMode = block.attrs.directionContext?.writingMode;
```

For convenience, the legacy `ParagraphAttrs.direction` scalar
(inline direction only) is also populated for consumers that only
need that one field.

## Logical-to-physical helpers

OOXML uses logical sides (`start`, `end`) that flip based on
direction. CSS uses physical sides (`left`, `right`). Don't ask
"is this RTL?" and map inline — use the helpers:

```ts
import { resolveLogicalAlignment, resolveLogicalIndent } from
  '@superdoc/pm-adapter/direction';

const physicalAlignment = resolveLogicalAlignment(
  resolvedJustification, // 'start' | 'end' | 'left' | ...
  paragraphContext,
);
const physicalIndent = resolveLogicalIndent(
  resolvedIndent, // may have .start / .end
  paragraphContext,
);
```

## What this module does NOT do

- It does NOT infer paragraph base direction from run content.
  Per UAX #9 P2/P3, paragraph base direction without explicit
  `w:bidi` comes from the first strong character — and the
  browser already implements that natively when `dir` is
  omitted. SuperDoc does not need a server-side classifier.
- It does NOT resolve complex-script formatting selection
  (`bCs`/`iCs`/`szCs`/`rFonts/@cs`). That's `RunScriptContext`
  and is implemented in Wave 1b.
- It does NOT handle bidi controls (`w:bdo`/`w:dir`). That's
  Wave 1c.
- It does NOT render vertical text. Wave 4 expands the writing
  mode enum and adds layout for vertical line boxes.

## Why the resolver chain matters

Before this module, several files each computed direction from
raw attributes:

- `pm-adapter/src/attributes/paragraph.ts` —
  `resolveEffectiveParagraphDirection` had a fallback cascade
  through `sectionDirection` (ECMA §17.6.1 violation) and a
  majority-of-runs heuristic (UAX #9 disagreement).
- `layout-bridge/src/position-hit.ts` — conflated `textDirection`
  (writing mode) with `direction` (inline direction).
- DomPainter, table-cell mirroring, and other sites each had their
  own ad-hoc direction detection, sometimes disagreeing.

Centralizing the model fixes the violations by construction and
gives future RTL features (complex-script typography, visual RTL
tables, vertical text, bidi controls) a single source of truth.
