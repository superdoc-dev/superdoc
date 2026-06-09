# Third-Party Licenses

This file lists third-party components redistributed in SuperDoc and the license
terms that govern them.

---

## Bundled fonts

SuperDoc bundles open substitute and fallback fonts so that documents
referencing a non-embedded Microsoft core font can render with a reviewed
physical font.

### Scope - applies to all delivery models

These font notices apply wherever SuperDoc distributes or serves the fonts:

- embedded or bundled within SuperDoc and its published packages;
- served to browsers as web fonts from a SuperDoc- or customer-operated host; and
- redistributed by a customer that embeds SuperDoc.

Web-font delivery is distribution under the SIL Open Font License, so these terms
are written to the broadest redistribution case and cover lighter delivery
models too. The authoritative per-family record and the full license texts ship
alongside the fonts at `shared/font-system/assets/` (`LICENSES.md`, `OFL.txt`,
`Apache-2.0.txt`). Distribute that notice set together with the font files.

SPDX license expression for this bundled font set: `OFL-1.1 AND Apache-2.0`.

### Components

| Family | Replaces | License | Reserved Font Name | Version |
| --- | --- | --- | --- | --- |
| Carlito | Calibri | OFL-1.1 | "Carlito" | 1.103 |
| Caladea | Cambria | Apache-2.0 | none | 1.002 |
| Liberation Sans | Arial | OFL-1.1 | none declared | 2.1.5 |
| Liberation Serif | Times New Roman | OFL-1.1 | none declared | 2.1.5 |
| Liberation Mono | Courier New | OFL-1.1 | none declared | 2.1.5 |
| Caprasimo | Cooper Black | OFL-1.1 | none | 1.001 |
| Gelasio | Georgia | OFL-1.1 | none | 1.008 |
| Cardo | Garamond | OFL-1.1 | none | Regular 1.0451; Bold 1.0011; Italic 0.991 |
| Comic Relief | Comic Sans MS | OFL-1.1 | none | 1.200 |
| Noto Sans | Tahoma | OFL-1.1 | none | 2.015 |
| PT Sans | Trebuchet MS | OFL-1.1 | "PT Sans", "PT Serif", "ParaType" | 2.003W OFL |

### Copyright & trademark notices from the font `name` tables

- **Carlito** (OFL-1.1): `Copyright (c) 2010-2013 by tyPoland Lukasz Dziedzic with Reserved Font Name "Carlito". Licensed under the SIL Open Font License, Version 1.1.` Carlito is a trademark of tyPoland Lukasz Dziedzic.
- **Caladea** (Apache-2.0): `Copyright (c) 2012 Huerta Tipografia`. Caladea is a trademark of Huerta Tipografia. No Reserved Font Name. No upstream `NOTICE` file.
- **Liberation Sans / Serif / Mono** (OFL-1.1): `Digitized data copyright (c) 2010 Google Corporation.` / `Copyright (c) 2012 Red Hat, Inc.` "Liberation" is a registered Red Hat trademark. The v2.1.5 files declare no OFL Reserved Font Name. SuperDoc names the unmodified fonts.
- **Caprasimo** (OFL-1.1): `Copyright 2023 The Caprasimo Project Authors (https://github.com/docrepair-fonts/caprasimo-fonts).` The v1.001 file declares no OFL Reserved Font Name.
- **Gelasio** (OFL-1.1): `Copyright 2022 The Gelasio Project Authors (https://github.com/SorkinType/Gelasio).` The v1.008 files declare no OFL Reserved Font Name.
- **Cardo** (OFL-1.1): `Copyright (c) 2002-2011, David J. Perry (hospes02@scholarsfonts.net).` These files declare no OFL Reserved Font Name.
- **Comic Relief** (OFL-1.1): `Copyright 2013 The Comic Relief Project Authors (https://github.com/loudifier/Comic-Relief).` The v1.200 files declare no OFL Reserved Font Name.
- **Noto Sans** (OFL-1.1): `Copyright 2022 The Noto Project Authors (https://github.com/notofonts/latin-greek-cyrillic).` The v2.015 files declare no OFL Reserved Font Name.
- **PT Sans** (OFL-1.1): `Copyright (c) 2010, ParaType Ltd. (http://www.paratype.com/public), with Reserved Font Names "PT Sans", "PT Serif" and "ParaType".`

### Format conversion

The static-source bundled faces are format-only TrueType-to-WOFF2 conversions
(`fontTools`, `flavor="woff2"`, Brotli; no subsetting; WOFF2 metadata omitted).
No design, metric, glyph, `cmap`, or `name`-table change. Gelasio and Noto Sans
ship as static WOFF2 instances generated from upstream variable TrueType sources
at the regular and bold weights; Noto Sans is also instanced at normal width.

Verified for this ship set: 30 / 38 faces are static-source conversions with a
WOFF2 `name` table byte-identical to their source TTF, and 8 / 38 faces are
static variable-font instances with no subsetting. All metrics are preserved.
Under OFL FAQ 2.2.1 the static-source conversions are not Modified Versions and
retain the original font names. For Caladea, this also serves as the Apache-2.0
section 4(b) notice.

### License texts

- OFL-1.1: `shared/font-system/assets/OFL.txt`, with per-font copyright notices stacked at top.
- Apache-2.0: `shared/font-system/assets/Apache-2.0.txt`.

The fonts remain under their own OFL-1.1 / Apache-2.0 terms and are not
relicensed under SuperDoc's terms (AGPLv3 community build or commercial).

---

## rtf.js (EMF/WMF Rendering)

**Location:** `packages/super-editor/src/editors/v1/core/super-converter/v3/handlers/wp/helpers/rtfjs/`

**Source:** https://github.com/nicktf/rtf.js

**License:** MIT

```text
The MIT License (MIT)

Copyright (c) 2015 Thomas Bluemel
Copyright (c) 2016 Tom Zoehner
Copyright (c) 2018 Thomas Bluemel
Copyright (c) 2020 Ynse Hoornenborg

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Usage:** EMF (Enhanced Metafile) and WMF (Windows Metafile) image rendering to SVG format.
