# DOCX creation, editing, and analysis

## Overview

A .docx file is a ZIP archive containing XML files.

## Quick Reference

| Task | Approach |
|------|----------|
| Read/analyze content | `pandoc` or unpack for raw XML |
| Create new document | Use `docx-js` - see Creating New Documents below |
| Edit existing document | Unpack → edit XML → repack - see Editing Existing Documents below |

### Reading Content

```bash
# Text extraction with tracked changes
pandoc --track-changes=all document.docx -o output.md

# Raw XML access - unzip the docx and read word/document.xml
unzip -o document.docx -d unpacked/
cat unpacked/word/document.xml
```

### Editing Existing Documents

#### Step 1: Unpack

```bash
mkdir -p unpacked && unzip -o document.docx -d unpacked/
```

Produces:
```
unpacked/
├── word/
│   ├── document.xml (main content)
│   ├── styles.xml
│   └── media/ (images)
├── _rels/
└── [Content_Types].xml
```

#### Step 2: Edit XML

Edit `word/document.xml` directly. Text lives in `<w:t>` elements inside `<w:r>` (run) inside `<w:p>` (paragraph).

#### Step 3: Repack

```bash
cd unpacked && zip -r ../document.docx . -x ".*"
```

### Common Pitfalls

- **Namespace prefixes**: Always preserve XML namespaces (e.g., `w:`, `r:`)
- **Tracked changes XML**: Look for `<w:del>` and `<w:ins>` elements
- **Comments**: Stored separately in `word/comments.xml`
- **Styles**: Changes to style IDs must be reflected in both `styles.xml` and `document.xml`
