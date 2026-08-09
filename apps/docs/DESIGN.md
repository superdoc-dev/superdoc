---
version: alpha
name: SuperDoc Docs — Editorial
description: >-
  Visual system for the SuperDoc v2 documentation. The "Editorial" direction:
  precise developer-tool foundations with a branded, expressive surface — the
  marketing radial gradient and blue-to-violet gradient text as signatures,
  brand-aligned Inter 600 hero type, and the document (with its live marks) as the hero
  object. This file is the normative source for the docs app.
colors:
  # Interactive — SuperDoc Blue is the only saturated hue in UI chrome.
  primary: "#1355FF"
  primary-hover: "#0F44CC"
  on-primary: "#FFFFFF"
  primary-50: "#EEF4FF"
  primary-100: "#D9E4FF"
  primary-200: "#B3C9FF"
  primary-300: "#7DA2FF"
  primary-400: "#4478FF"
  primary-500: "#1355FF"
  primary-600: "#0F44CC"
  primary-700: "#0B3399"
  # Signature gradient endpoints. These are the ONLY gradient tokens; the full
  # radial recipe lives in the Colors section prose. Gradient is marketing-only.
  gradient-from: "#2563EB"
  gradient-to: "#9333EA"
  gradient-anchor: "#1355FF"
  # Text — darkened from the brand #666 for AA at small sizes.
  ink: "#212121"
  ink-secondary: "#5A5A61"
  ink-tertiary: "#71717A"
  # Surfaces
  surface: "#FFFFFF"
  canvas: "#FAFAFA"
  surface-dark: "#0B0C10"
  surface-dark-raised: "#15171F"
  on-surface-dark: "#E6E8EE"
  on-surface-dark-muted: "#8B90A0"
  border: "#DBDBDB"
  border-soft: "#ECECEE"
  # Document marks — belong to paper, never to UI chrome. Fixed light-system
  # values regardless of app theme.
  mark-insert: "#00853D"
  mark-delete: "#CB0E47"
  selection-fill: "#D9E4FF"
  selection-outline: "#1355FF"
  # Semantic
  success: "#00853D"
  error: "#ED4337"
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 64px
    fontWeight: "600"
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  display-md:
    fontFamily: Inter
    fontSize: 44px
    fontWeight: "800"
    lineHeight: 1.05
    letterSpacing: "-0.035em"
  headline-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: "700"
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: "600"
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: "600"
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: "400"
    lineHeight: 1.6
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: "400"
    lineHeight: 1.6
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: "400"
    lineHeight: 1.55
  label-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: "600"
    lineHeight: 1
    letterSpacing: "-0.005em"
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: "500"
    lineHeight: 1.4
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: "500"
    lineHeight: 1
    letterSpacing: "0.08em"
  code:
    fontFamily: JetBrains Mono
    fontSize: 13.5px
    fontWeight: "400"
    lineHeight: 1.7
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: "400"
    lineHeight: 1.4
rounded:
  page: 2px
  sm: 6px
  md: 9px
  lg: 14px
  xl: 18px
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  "2xl": 64px
  gutter: 20px
  content-max: 1080px
  reading-max: 660px
components:
  eyebrow:
    typography: "{typography.label-caps}"
    textColor: "{colors.primary-600}"
  gradient-text:
    typography: "{typography.display-lg}"
    textColor: "{colors.gradient-from}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    height: 48px
    padding: "0 22px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    height: 48px
    padding: "0 20px"
  button-secondary-hover:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
  button-command:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.code}"
    rounded: "{rounded.sm}"
    padding: "9px 15px"
  button-command-hover:
    textColor: "{colors.ink}"
  path-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "0"
  path-card-hover:
    backgroundColor: "{colors.surface}"
  code-block:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.on-surface-dark}"
    typography: "{typography.code}"
    rounded: "{rounded.lg}"
    padding: "20px"
  callout:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "14px 18px"
  receipt-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.code}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
  document-page:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.page}"
    padding: "34px 40px"
  mark-selection:
    backgroundColor: "{colors.selection-fill}"
    textColor: "{colors.ink}"
  mark-insertion:
    textColor: "{colors.mark-insert}"
  mark-deletion:
    textColor: "{colors.mark-delete}"
  nav:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-secondary}"
    height: 64px
---

# SuperDoc Documentation — Editorial direction

## Overview

SuperDoc is a document engine, and the documentation should feel like it was
built by people who care about type rendering and pixel alignment — because
they do. The personality is the Precision Toolmaker: precise, crafted,
confident, quietly authoritative. The docs surface adds one thing on
top of that foundation: warmth. This is the reader's first real contact with
the product, so it is allowed to be expressive where the product UI would stay
flat.

The result is "Editorial": disciplined developer-tool foundations with a
branded landing feel. Two signatures carry the brand: the marketing radial
gradient behind the hero, and blue-to-violet gradient text on a single phrase.
Everything else is restrained. Generous whitespace, a clear type hierarchy
anchored on Inter 600 hero type, and the document itself, a real page with live
selection, tracked changes, and a caret, as the hero object that no competitor
can copy.

The emotional target: a developer lands, immediately understands this is
infrastructure they can trust, and feels invited rather than sold to. Confident,
not loud. Designed, not decorated.

## Colors

The palette is blue-anchored and neutral-supported. **SuperDoc Blue
(`primary`, #1355FF) is the only saturated hue permitted in UI chrome** —
buttons, links, focus rings, and selection. Everything structural is a cool
neutral.

- **Primary (#1355FF):** The signature. One primary action per view. Hovers
  *darker* to `primary-hover` (#0F44CC) so it stays AA-legible.
- **Ink (#212121 / #5A5A61 / #71717A):** Headings, body, and metadata. The
  secondary and tertiary steps are darkened from the brand #666/#9A9AA2
  so small text clears WCAG AA on white (4.6:1+).
- **Document marks:** Insertions are `mark-insert` green (#00853D), deletions
  `mark-delete` (#CB0E47), selection a `primary-100` fill with a `primary-500`
  outline. These live on paper and use fixed light-system values regardless of
  the app's light/dark theme.
- **Neutrals:** `surface` (#FFFFFF) for cards and pages, `canvas` (#FAFAFA)
  behind them, `border` / `border-soft` for dividers. `surface-dark` (#0B0C10)
  is reserved for code blocks and terminal surfaces.

**The marketing gradient** is the branded hero wash — a soft radial that reads
as personality without shouting. It is the reason this direction feels like
SuperDoc and not generic docs. Use it only on the docs home hero and marketing
bands:

```css
background: radial-gradient(
  circle at -30% -60%,
  #1355ff, #8968f633, #b785f140, #fcd36152,
  #e8caec00, #f1e0f073, #f1e0f0, #f5f5fa, #f5f5fa
);
```

**Gradient text** applies `gradient-from` (#2563EB) → `gradient-to` (#9333EA)
via `background-clip: text` on one emphasized phrase per hero, never more.
Colors to avoid entirely: neon greens, oranges, and any warm saturated hue as a
UI element. The system is cool and precise.

## Typography

Two families do all the work. **Inter** (400–800) is the voice; **JetBrains
Mono** is the machine register for code, receipts, versions, and eyebrows.

- **Docs home display (Inter 600):** The home hero uses `display-lg` (64px at
  desktop, fluid from 26px) with -0.02em tracking and a 1.1 line height. Size,
  weight, tracking, and line height all match the SuperDoc website hero so the
  two surfaces read as one family; only the headline copy is
  documentation-specific. Larger editorial page displays may use `display-md`
  (44px/800) when their hierarchy calls for it.
- **Headings (Inter 700 → 600):** `headline-lg` for page titles, `headline-md`
  and `headline-sm` for sections. Tracking tightens as size grows.
- **Body (Inter 400):** `body-md` (16px / 1.6) is the default; `body-lg` for
  ledes. Prose lines cap at `reading-max` (660px) for legibility.
- **Machine voice (JetBrains Mono):** `label-caps` for the uppercase eyebrow,
  `code` for snippets and inline operations, receipts, and versions. This is how
  the docs signal "this is programmable," so use it deliberately — labels,
  operations, and receipts — not as decorative flourish.
- **Gradient text** is a typographic device, not a color: apply it to one phrase
  in a display headline, never to body or UI.

## Layout & Spacing

Content is centered within `content-max` (1080px); prose within a page caps at
`reading-max` (660px). Rhythm follows an **8px base scale** (`spacing.base`)
with a 4px half-step (`xs`) for micro-adjustments.

- **Docs home:** a compact full-width hero band (the gradient), then a
  two-column path grid (Editor / Headless) at a `gutter` (20px) gap, collapsing
  to one column below ~54rem. Each path card pairs copy with a representative
  preview of its runtime.
- **Article page:** a three-zone shell with a sticky translucent nav (64px), a
  ~240px left navigation rail, and the reading column with a right-hand TOC.
  Section spacing uses `xl` (40px) above `## ` headings.
- **Generosity is the default.** Hero and section padding lean large (`2xl`,
  64px, at desktop) and compress fluidly on small screens. Whitespace is how
  this system conveys confidence.

## Elevation & Depth

Depth is layered and soft, never heavy. The stack, low to high:

- **Ambient (hero):** the radial marketing gradient provides atmospheric depth
  behind the home hero — the only place background color does this work.
- **Cards / path cards:** rest on `canvas` with a hairline `border-soft` and a
  soft two-part shadow (`0 2px 8px rgba(0,0,0,.04), 0 20px 44px rgba(0,0,0,.07)`).
  On hover they lift 2–3px, the border shifts to `primary-200`, and the shadow
  deepens with a faint blue tint.
- **Document pages:** the paper shadow is the signature elevation —
  `0 1px 2px rgba(0,0,0,.06), 0 10px 30px rgba(0,0,0,.09)` — a real sheet on a
  desk, at `rounded.page` (2px).
- **Code / terminal surfaces:** `surface-dark` with a `1px` #23262E edge; they
  sit visually "in" the page, not floating above it.

Product UI stays flat. Gradients and glows are marketing-band only.

## Shapes

Softer than the product, but never rounded for its own sake.

- **Hero, path cards, media:** `rounded.xl` (18px) — the generous, editorial
  radius that gives the landing surface its warmth.
- **Buttons, inputs, code blocks:** `rounded.md`–`lg` (9–14px).
- **Command chips, small controls:** `rounded.sm` (6px).
- **Badges / pills:** `rounded.full`.
- **Document pages:** `rounded.page` (2px) — paper has almost square corners,
  and that near-sharpness is deliberate. It reads as a real document.

Do not mix radii arbitrarily within one component; the page's 2px is the one
intentional break from the soft UI radii, and it earns it by being paper.

## Components

### Buttons

One hierarchy. **Primary** is solid `primary`, 48px tall, `rounded.md`, and
hovers *darker*. **Secondary** is a white/`surface` button with a `border`; on a
gradient band it becomes a 75%-white glass button with a 6px backdrop blur.
**Command** is a monospace `$ npm install superdoc` chip on `canvas` that borders
blue on hover. It is the docs home hero's only action so the release headline
does not compete with a generic call to action. Every variant shows a visible
2px `primary` focus ring at a 2px offset.

### Path card

The home's core object. A bordered `rounded.xl` card split into a copy zone
(a `headline-sm` title, `body-sm` description, and a blue call-to-action link)
and a runtime preview on `canvas`: a mini editor with a
document page and live marks for the Editor path, a dark `code-block` /terminal
for the Headless path. The two cards must stay the same height.

### Code block

`surface-dark` background, `code` typography, `rounded.lg`, with an optional
chrome bar (three dots + a mono filename). Syntax tints: keywords #7AA2FF,
strings #98C379, functions #E5C07B, comments #5C6370.

### Callout

Left-accent note: `canvas` fill, `rounded.md`, a 3px `primary` (or semantic)
left border, a colored `label-lg` title and `body-sm` body. Variants recolor the
accent to `success` / `error` only — never the whole surface loudly.

### Receipt bar

The proof-of-operation strip beneath a demo: mono `code` type on `surface`,
`rounded.sm`, showing status → operation → detail. The status dot and word use
`success` green. This is a brand device: every successful mutation returns a
receipt.

### Document page & marks

A `surface` sheet at `rounded.page` with the paper shadow. Marks render inline:
`mark-selection` (fill + outline), `mark-insertion` (green underline),
`mark-deletion` (red strikethrough), and a blinking `primary` caret. Respect
`prefers-reduced-motion` — the caret stops blinking. One comment anchor may hang
in the right margin, tethered by a short blue rule.

### Nav

Sticky, 64px, translucent `surface` at 80% with a 12px backdrop blur and a
`border-soft` bottom. The shell matches the SuperDoc website while its links
remain documentation-specific. Left: the canonical SuperDoc mark, a 20px/700
blue wordmark, and a muted `Docs` suffix. Use `primary-400` for the wordmark in
dark mode. Center: top-level documentation sections at 14px/500. Right: search,
theme, GitHub, and the shared contact action. The logo returns to the
documentation home at `/docs`.

The current WebP mark is the approved interim navigation asset. Replace it with
an approved vector when original artwork or a reviewed redraw is available.

## Do's and Don'ts

- **Do** load Inter 800. `display-md` and editorial section headings depend on
  it.
- **Do** reserve the radial gradient for the home hero and marketing bands, and
  gradient text for one phrase per hero.
- **Don't** put any gradient inside product UI, prose, article bodies, or the
  document page. Those stay flat.
- **Do** use `primary` blue as the only saturated hue in UI chrome; one primary
  action per view.
- **Don't** use document-mark green or red for UI — they belong to paper only.
- **Do** keep document pages at `rounded.page` (2px); **don't** round them to
  match the soft UI radii — the near-sharp corner is what makes them read as
  paper.
- **Do** maintain WCAG AA (4.5:1 normal text, 3:1 large); primary hovers darker,
  not lighter, to preserve it.
- **Don't** cap prose wider than `reading-max` (660px), and don't crowd the
  hero — whitespace is the confidence.
- **Do** use JetBrains Mono deliberately for machine voice (code, operations,
  receipts, versions, eyebrows); **don't** scatter it as decoration.
- **Do** limit a headline to one document mark or one gradient phrase — never
  stack emphasis devices.
- **Do** lead with the headline and cut the scaffolding around it. Omit category
  tags (e.g. "PATH 01 · EDITOR") and hint lines that restate what the title and
  content already say. Add labels only when they genuinely disambiguate.
