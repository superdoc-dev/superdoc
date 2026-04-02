# PRD: Level 3 Benchmark v2 -- Document Fidelity

## Context

The v1 benchmark (47/48 pass, 8 providers, 6 tasks) proves that all approaches (baseline, vendor, SuperDoc MCP, SuperDoc CLI) can complete simple DOCX tasks. Pass rates are equivalent. The efficiency gap (SuperDoc uses more tokens) is documented.

What v1 does not measure: **document fidelity**. Raw approaches (unzip + sed + rezip) pass text-content checks but silently destroy formatting, styles, numbering, tracked changes, comments, and table structure. SuperDoc preserves these because it operates through the document model, not raw XML. This is SuperDoc's core value proposition, and the benchmark doesn't capture it yet.

## CEO Feedback (verbatim direction)

> The bigger gap is that we're not yet measuring the area where SuperDoc should actually win.

Six areas to address:

1. Document fidelity / integrity scoring (formatting, numbering, tables)
2. Minimal edits vs full rewrites
3. Fragile, real-world cases (tables, redlines, nested lists, existing comments)
4. Multi-step workflows that stress structure
5. Synthetic names only (no real or customer-like names)
6. Production-safe document editing, not just task completion

## What needs to change

### 1. Fidelity scoring (new metric dimension)

V1 checks: "Is the right text in the document?" (correctness) and "Is unrelated text still there?" (collateral).

V2 adds: "Did the edit preserve the document's structural integrity?"

Fidelity checks would inspect the output DOCX at the OOXML level:

- **Formatting preservation**: Does bold/italic/underline survive a find-and-replace?
- **Style references**: Are paragraph styles still referenced by ID, not baked as inline formatting?
- **Numbering continuity**: Does list numbering continue correctly after insertions?
- **Table structure**: Are column widths, cell borders, alignments, and merged cells intact?
- **Tracked changes validity**: Are `<w:ins>` and `<w:del>` elements well-formed with author and date?
- **Comment survival**: Do existing comments and their anchor ranges survive an edit?
- **Minimal diff**: How much of the XML changed? A surgical edit should touch fewer elements than a full rewrite.

Each of these can be checked deterministically by parsing the output DOCX's XML. No LLM judge needed.

### 2. New fixture documents

V1 fixtures are simple documents. V2 needs richer fixtures designed to be fragile:

- A document with **mixed inline formatting** (bold terms, italic definitions, underlined cross-references)
- A document with **tables** (multi-column, merged cells, numeric alignment, header rows with styling)
- A document with **nested numbered lists** (multi-level: 1, 1.1, 1.1.a) where numbering state matters
- A document with **existing tracked changes and comments** that must survive new edits
- A document with **headers, footers, and page breaks** that shouldn't be disturbed

All fixtures must use clearly synthetic names. Replace any real-sounding entities:
- "Iqidis Corp" → "Astra Dynamics" or "Initech Ltd"
- "TechVentures LLC" → "Globex Industries" or "Umbrella Corp"
- Use obviously fictional addresses, dates, amounts

### 3. New task categories

V1 tasks: 3 reading, 3 editing (simple text operations).

V2 adds tasks where raw approaches are expected to fail fidelity checks:

**Formatting-sensitive edits:**
- Replace a defined term throughout, preserving bold/italic on each occurrence
- Change a heading's text without losing its heading style

**Table operations:**
- Update a cell value in a specific row/column
- Add a row or column without breaking existing structure
- Change numeric alignment in a column

**Tracked changes:**
- Make an edit using tracked changes mode
- Edit a document that already has tracked changes, without corrupting existing ones
- Add a comment to a specific clause

**List structure:**
- Insert subpoints under an existing numbered item, maintaining numbering
- Convert a bulleted list to numbered without breaking indentation levels

**Multi-step workflows:**
- Extract data, transform it, create a new structure, insert it (multiple sequential operations)
- Edit multiple sections in a single pass without cross-contamination

**Existing annotations:**
- Edit content in a document that has comments, ensuring comment anchors stay valid
- Add tracked changes alongside existing ones

### 4. Fidelity assertion approach

The provider already captures the output DOCX file path (`outputFile`). V2 adds a fidelity checker that:

1. Unzips the output DOCX
2. Parses `word/document.xml` (and `word/comments.xml`, `word/numbering.xml`, `word/styles.xml`)
3. Runs structural checks against expected properties
4. Returns a fidelity score (0-1) with specific failures listed

This could be a new assertion function in `checks.cjs` (e.g., `benchmarkFidelity`) or a standalone utility that the assertions call.

The key insight: fidelity checks compare **properties of the output DOCX**, not text content. They answer "is this a valid, well-formed document that preserves the structures we care about?"

### 5. Minimal diff scoring

For editing tasks, compare the input and output DOCX at the XML level:

- Count how many XML elements changed
- Count how many paragraphs were rewritten vs surgically edited
- Flag if the entire `document.xml` was regenerated (a sign of full rewrite)

A SuperDoc edit should produce a small, targeted diff. A raw unzip+sed edit might produce a small diff too (sed is surgical). But a raw approach that regenerates XML (python-docx, docx-js) will produce a large diff.

### 6. Synthetic names migration

Update all existing fixtures and test assertions to use clearly fictional names. This is a cleanup task, not a new feature. Run through every fixture and assertion that references entity names and replace with synthetic alternatives.

## What stays the same

- The benchmark matrix (4 conditions x 2 agents)
- The Promptfoo infrastructure
- The efficiency metrics (steps, latency, tokens, cost)
- The provider architecture (Claude Agent SDK, Codex SDK, MCP integration)
- Deterministic scoring (no LLM judge)

## Expected outcome

When v2 is complete, the benchmark should show:

- **Pass rates diverge**: Raw approaches fail fidelity checks on formatting-sensitive and structure-sensitive tasks. SuperDoc maintains high pass rates.
- **Fidelity scores differentiate**: Even when both approaches "pass" a text check, SuperDoc scores higher on fidelity (formatting preserved, numbering intact, comments survived).
- **The value story becomes clear**: SuperDoc's advantage is not speed or cost (it's actually more expensive). It's document integrity. The benchmark proves this with numbers.

## Non-goals for v2

- Visual/pixel-level rendering comparison (future v3)
- Additional agent platforms (Cursor, Windsurf)
- CI integration
- Performance under rate limiting
