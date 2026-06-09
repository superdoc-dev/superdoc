# Bundled Fonts - License & Attribution Record

_Location: `shared/font-system/assets/LICENSES.md`. This file ships in the same
directory as the font files, `OFL.txt`, and `Apache-2.0.txt`, and travels with
them in every distribution. All strings below were taken verbatim from the
shipped fonts' `name` tables on 2026-06-03._

## Scope (read first)

This record applies to the font software listed below **in every form in which
SuperDoc distributes or serves it**: embedded or bundled within SuperDoc and
its packages, served to browsers as web fonts from a SuperDoc- or
customer-operated host, or redistributed by a customer that embeds SuperDoc.
Web-font delivery counts as distribution under the SIL Open Font License, so the
obligations below are stated to the broadest redistribution case. Lighter
delivery models are covered too. **No edit to this file is required if the
delivery model changes.**

These notices, `OFL.txt`, and `Apache-2.0.txt` are a single unit. Distribute
them together with the font files wherever the fonts go.

SPDX license expression for this bundled font set: `OFL-1.1 AND Apache-2.0`.
Machine-readable asset metadata: `font-assets.manifest.json`.

## Families

| Family | Replaces | License | Reserved Font Name | Version | Upstream source |
| --- | --- | --- | --- | --- | --- |
| Carlito | Calibri | OFL-1.1 | "Carlito" | 1.103 | github.com/googlefonts/carlito |
| Caladea | Cambria | Apache-2.0 | none | 1.002 | Google *crosextra* (via LibreOffice resources) |
| Liberation Sans | Arial | OFL-1.1 | none declared* | 2.1.5 | github.com/liberationfonts/liberation-fonts 2.1.5 |
| Liberation Serif | Times New Roman | OFL-1.1 | none declared* | 2.1.5 | github.com/liberationfonts/liberation-fonts 2.1.5 |
| Liberation Mono | Courier New | OFL-1.1 | none declared* | 2.1.5 | github.com/liberationfonts/liberation-fonts 2.1.5 |

\* The Liberation v2.1.5 files carry no OFL Reserved Font Name. "Liberation" is a
registered Red Hat trademark, which is separate from an OFL RFN. SuperDoc names
the unmodified fonts, which is customary nominative use.

## Verbatim copyright & trademark notices from the font `name` tables

**Carlito** - OFL-1.1

```text
Copyright (c) 2010-2013 by tyPoland Lukasz Dziedzic with Reserved Font Name "Carlito". Licensed under the SIL Open Font License, Version 1.1.
Trademark: Carlito is a trademark of tyPoland Lukasz Dziedzic.
```

**Caladea** - Apache-2.0

```text
Copyright (c) 2012 Huerta Tipografia
Trademark: Caladea is a trademark of Huerta Tipografia
```

**Liberation Sans / Liberation Serif / Liberation Mono** - OFL-1.1

```text
Digitized data copyright (c) 2010 Google Corporation.
Copyright (c) 2012 Red Hat, Inc.
Trademark: Liberation is a trademark of Red Hat, Inc. registered in U.S. Patent and Trademark Office and certain other jurisdictions.
```

No OFL Reserved Font Name is declared in these files. Each file's description
field notes the Arimo / Tinos / Cousine design lineage (Steve Matteson,
Ascender). Those names are not declared as Reserved Font Names here.

## Conversion notice (covers OFL section 1 / FAQ 2.2.1 and Apache-2.0 section 4(b))

The WOFF2 faces in this distribution are **format-only conversions** of the
TrueType sources, produced with `fontTools` (`flavor="woff2"`, Brotli) with **no
subsetting** and the WOFF2 **metadata block omitted**. No glyph outlines,
advance widths, vertical metrics, `cmap`, or `name`-table notices were changed.

Because the font data is unchanged except for WOFF2 compression and the metadata
block is omitted, the conversions are **not "Modified Versions"** under OFL-1.1
(OFL FAQ 2.2.1) and lawfully retain the original font names, including the
Carlito Reserved Font Name. For Caladea, the same statement satisfies the
Apache-2.0 section 4(b) "modified files" notice. Caladea carries **no upstream
`NOTICE` file**, so Apache-2.0 section 4(d) adds nothing.

## Verification evidence (this ship set, 2026-06-03)

- **20 / 20 WOFF2 faces:** WOFF2 flavor, WOFF2 metadata block omitted, `name`
  table byte-identical to the source TTF, identical glyph count and `cmap`.
- **Metrics:** `unitsPerEm`, `hhea` ascent/descent, OS/2 win/typo ascent/descent,
  and every glyph advance width compared source-vs-WOFF2:
  `ALL METRICS PRESERVED` (`evidence/metric-verification-output.txt`).

## Full license texts

- OFL-1.1 (Carlito, Liberation): `OFL.txt` in this directory. The copyright
  notices above are also stacked at the top of that file.
- Apache-2.0 (Caladea): `Apache-2.0.txt` in this directory.

SuperDoc does not relicense these fonts. They remain under their own OFL-1.1 /
Apache-2.0 terms regardless of the license under which SuperDoc itself is offered
(AGPLv3 community build or commercial).
