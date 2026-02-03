# Rendering Support: {{feature_name}}

## Summary
Ensure {{feature_name}} renders correctly across all supported Word content containers and respects all applicable style sources (direct formatting, styles, themes).

---

## Requirements

### Feature Support
Support rendering {{feature_name}} applied at:
- {{application_level_1}} (e.g., table-level)
- {{application_level_2}} (e.g., cell-level)
- {{application_level_3}} (e.g., custom/partial application)

Support all relevant feature attributes, including:
- {{attribute_1}} (e.g., styles)
- {{attribute_2}} (e.g., colors)
- {{attribute_3}} (e.g., widths)

---

## Containers
Rendering must work consistently when {{feature_name}} appears within:

- Main document: `w:document/w:body`
- Tables: `w:tbl` / `w:tr` / `w:tc`
- Headers / Footers parts: `w:hdr`, `w:ftr`  
  *(referenced via `w:sectPr` → `w:headerReference` / `w:footerReference`)*
- Structured content: `w:sdt` → `w:sdtContent`
- Textboxes / shapes text: `w:txbxContent`  
  *(reachable via `w:drawing` and legacy `w:pict`)*
- Footnotes: `w:footnotes`
- Endnotes: `w:endnotes`
- Comments: `w:comments`

---

## Styles / Inheritance
Rendering must respect the full style cascade, including:
- **Direct formatting** (content XML): `w:*Pr`
- **Applied styles**: paragraph (`w:pStyle`), character (`w:rStyle`), table (`w:tblStyle`)
- **Style inheritance**: `w:style/w:basedOn`, linked styles
- **Style defaults**: `styles.xml` → `w:docDefaults` and default styles
- **List/numbering levels** (if applicable): `numbering.xml` → `w:lvl/*Pr`
- **Themes** (attribute-level): `themeColor`, `*Theme`, resolved via `theme/theme1.xml`

Direct formatting overrides all other sources.

---

## Acceptance Criteria
- {{feature_name}} renders identically to Word in all listed containers.
- {{feature_name}} renders identically to Word regardless of how styles are applied/inherited.

---

## Test Coverage

Add fixtures covering {{feature_name}} applied via:
- Direct formatting
- Character style
- Paragraph style
- Document defaults

Each fixture must include:
- Body
- Table
- Header / footer
- Structured content
- Textbox
- List

---

## Sample Documents
{{sample_docs_or_links}}

---

## Notes / Edge Cases / Out of Scope
{{notes}}
