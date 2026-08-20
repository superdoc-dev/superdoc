# Bundled fonts

These faces are embedded into exported PDFs. They are open-licensed and
renamed to generic slots so the exporter can map DOCX font families onto them:

| File(s)            | Actual font | License |
|--------------------|-------------|---------|
| `Sans-*.ttf`       | **Ubuntu** (Regular/Bold/Italic/BoldItalic) | Ubuntu Font Licence 1.0 |
| `Serif-*.ttf`      | **PT Serif** (Regular/Bold/Italic/BoldItalic) | SIL Open Font License 1.1 |
| `Mono-*.ttf`       | **Ubuntu Mono** (Regular/Bold)              | Ubuntu Font Licence 1.0 |
| `Symbol-Regular.ttf` | **DejaVu Sans** (per-glyph fallback for geometric bullets/dingbats missing from the primary font) | DejaVu Fonts License (Bitstream Vera derivative, permissive) |
| `CJK-Regular.ttf`  | **Noto Sans SC** (lazy per-glyph fallback for CJK — only fetched when a CJK glyph is exported) | SIL Open Font License 1.1 |

These are *substitute* faces, used only for fonts the DOCX does not embed. When
a DOCX embeds its own fonts, those are extracted, deobfuscated and embedded
byte-exact instead (see `../src/fontExtract.ts` and `../FINDINGS.md`).

Ubuntu / Ubuntu Mono © Canonical Ltd., Ubuntu Font Licence v1.0
(https://ubuntu.com/legal/font-licence). PT Serif © ParaType, SIL OFL 1.1.
