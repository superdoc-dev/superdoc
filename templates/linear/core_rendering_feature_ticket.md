## Rendering Feature: [FEATURE NAME]

### Summary
Ensure [FEATURE NAME] renders correctly across all supported Word content containers and respects all applicable style sources (direct formatting, styles, themes).

### Requirements

**Containers:**

Rendering must work consistently when [FEATURE NAME] appears in:

- Document body (w:body)
- Paragraphs (w:p)
- Lists
- Tables (w:tbl)
- Headers & footers (w:hdr, w:ftr)
- Textboxes / shapes (w:txbxContent)
- Structured content / content controls (w:sdtContent)
- Footnotes: w:footnotes
- Endnotes: w:endnotes

### Acceptance Criteria

- [FEATURE NAME] render identically in all listed containers.
- Behavior is consistent regardless of how the feature is applied (manual, style, defaults).
- Mixed usage (feature on/off within the same paragraph/run group) renders correctly.
- No container-specific rendering differences.

### Styles / Inheritance — should be applied in a centralized way already:

Rendering must respect the full style cascade, including:

- Direct formatting (content XML): w:*Pr
- Applied styles: paragraph (w:pStyle), character (w:rStyle), table (w:tblStyle)
- Style inheritance: w:style/w:basedOn, linked styles
- Style defaults: styles.xml → w:docDefaults and default styles
- List / numbering levels (if applicable): numbering.xml → w:lvl/*Pr
- Themes (attribute-level): themeColor, *Theme, resolved via theme/theme1.xml

### Sample Docs:

### Test Coverage

Add fixtures covering [FEATURE NAME] applied via:

- Direct formatting
- Character style
- Paragraph style
- Document defaults

Each fixture must include:

- Body
- Table
- Header/footer
- Structured content
- Textbox
- List

### Notes / Edge Cases / Out of Scope

[Optional — only if known]
