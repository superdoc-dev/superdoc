# Rendering Ticket Template (Word / DOCX)

This directory contains the canonical **Linear ticket template** for implementing or fixing **rendering support** in SuperDoc’s Word/DOCX engine.

The template is designed to be:
- Feature-agnostic (usable for any rendering feature)
- Consistent across tickets
- Easy for AI agents (Codex, Claude, etc.) to fill automatically
- Explicit about containers, styles, and test expectations

---

## When to use this template

Use `rendering-feature.md` for any work involving:
- Rendering a new Word feature
- Fixing incorrect or inconsistent rendering
- Ensuring feature parity across containers (body, tables, headers, etc.)
- Handling style inheritance, defaults, or theme-driven formatting

Examples:
- Table borders
- Text decorations (superscript, underline, etc.)
- Paragraph spacing / alignment
- Shading, fills, borders
- Font, color, or layout-related behavior

---

## How to fill the template

### Required placeholders
Agents or authors should replace the following placeholders:

- `{{feature_name}}`  
  Short, descriptive name (e.g. “Table Borders”, “Superscript”)

- `{{application_level_1..3}}`  
  Where the feature can be applied (e.g. table-level, cell-level, run-level)

- `{{attribute_1..3}}`  
  Relevant attributes for the feature (e.g. style, color, width, alignment)

- `{{sample_docs_or_links}}`  
  Links to fixture documents or examples (Linear uploads or repo files)

- `{{notes}}`  
  Optional. Use “N/A” if there are no known edge cases.

---

## Container expectations

Unless explicitly out of scope, rendering features are expected to work across **all listed containers** in the template.  
If a container truly does not apply, it should be called out in **Notes / Out of Scope**.

---

## Style expectations

All rendering features must respect Word’s full style cascade:
- Direct formatting
- Applied styles
- Style inheritance
- Document defaults
- Numbering (if applicable)
- Themes

**Direct formatting always overrides other sources.**

---

## Test expectations

Each rendering ticket is expected to include:
- Fixtures covering all applicable style sources
- Coverage across all major containers
- Enough variation to catch inheritance and override bugs

---

## Agent usage (important)

AI agents generating Linear tickets should:
1. Start from `rendering-feature.md`
2. Fully replace all placeholders
3. Preserve section structure and headings
4. Output the final Markdown as the Linear ticket body

Do not invent new sections or remove required ones.

---

## Versioning

If this template changes in a non-backward-compatible way, update this README and note the change in the template header.

---

**Source of truth:**  
This template is the single canonical format for rendering-related Linear tickets in SuperDoc.
