/**
 * Pre-AST normalizer that converts fixed-width ASCII tables to GFM pipe tables.
 *
 * LLMs commonly produce pandoc-style fixed-width tables in markdown:
 *
 *     Name        Age    City
 *     ----------- ------ --------
 *     Alice       30     Seattle
 *     Bob         25     Portland
 *
 * remark-gfm only recognizes GFM pipe-table syntax, so these become paragraphs
 * instead of table nodes in the AST. This module detects fixed-width tables and
 * rewrites them before AST parsing:
 *
 *     | Name | Age | City |
 *     | --- | --- | --- |
 *     | Alice | 30 | Seattle |
 *     | Bob | 25 | Portland |
 *
 * Supported layouts:
 *   (A) border → header → guide → data... → border   (bordered)
 *   (B) header → guide → data...                      (unbounded)
 *
 * Continuation lines (empty first column) are merged into the preceding row.
 * In bordered tables, blank lines between data rows are treated as row separators.
 * In unbounded tables, a blank line terminates the table.
 *
 * Code blocks are skipped entirely (fenced and 4-space/tab-indented).
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect pandoc-style fixed-width ASCII tables in a markdown string and
 * rewrite them as GFM pipe tables that remark-gfm can parse.
 *
 * Code blocks are skipped (fenced and 4-space/tab-indented). Bordered (top/bottom border) and
 * unbounded (header + guide only) layouts are both supported, including
 * continuation lines that wrap across multiple rows.
 *
 * @param markdown - Raw markdown source, possibly containing fixed-width tables.
 * @returns The markdown with fixed-width tables replaced by GFM pipe-table syntax.
 *   Returns the input unchanged if no fixed-width tables are detected.
 */
export function normalizeFixedWidthTables(markdown: string): string {
  const lines = markdown.split('\n');
  const output: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (isFenceOpener(lines[i])) {
      const closeIdx = findFenceClose(lines, i);
      for (let j = i; j <= closeIdx; j++) output.push(lines[j]);
      i = closeIdx + 1;
      continue;
    }

    if (isIndentedCodeOpener(lines[i])) {
      const closeIdx = findIndentedCodeClose(lines, i);
      for (let j = i; j <= closeIdx; j++) output.push(lines[j]);
      i = closeIdx + 1;
      continue;
    }

    const table = tryParseTableAt(lines, i);
    if (table) {
      output.push(...toGfmPipeTable(table));
      i = table.endLine + 1;
      continue;
    }

    output.push(lines[i]);
    i++;
  }

  return output.join('\n');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Character span of a single column, relative to content start (after indent). */
interface ColumnSpan {
  /** Start character index (inclusive), relative to content start. */
  start: number;
  /** End character index (inclusive), relative to content start. */
  end: number;
}

/** Result of parsing a column guide row. */
interface GuideInfo {
  /** Column spans, relative to content start (after stripping leading indent). */
  spans: ColumnSpan[];
  /** Number of leading whitespace characters on the guide row. */
  indent: number;
}

interface ParsedTable {
  /** First line of the table block (top border or header). */
  startLine: number;
  /** Last line of the table block (bottom border or last data row). */
  endLine: number;
  headers: string[];
  rows: string[][];
}

interface TableAnchors {
  topBorderIdx?: number;
  headerIdx: number;
  guideIdx: number;
}

// ---------------------------------------------------------------------------
// Code block handling
// ---------------------------------------------------------------------------

const FENCE_OPEN_RE = /^( {0,3})(`{3,}|~{3,})/;
const INDENTED_CODE_RE = /^(?: {4,}|\t)/;

function isFenceOpener(line: string): boolean {
  return FENCE_OPEN_RE.test(line);
}

function isIndentedCodeOpener(line: string): boolean {
  return INDENTED_CODE_RE.test(line);
}

function findFenceClose(lines: string[], openIdx: number): number {
  const match = lines[openIdx].match(FENCE_OPEN_RE);
  if (!match) return openIdx;

  const char = match[2][0] === '`' ? '`' : '~';
  const minLen = match[2].length;
  const closeRe = new RegExp(`^( {0,3})${char}{${minLen},}\\s*$`);

  for (let i = openIdx + 1; i < lines.length; i++) {
    if (closeRe.test(lines[i])) return i;
  }
  return lines.length - 1; // unclosed fence: consume to end
}

function findIndentedCodeClose(lines: string[], openIdx: number): number {
  for (let i = openIdx + 1; i < lines.length; i++) {
    if (isBlank(lines[i])) continue;
    if (!isIndentedCodeOpener(lines[i])) return i - 1;
  }
  return lines.length - 1;
}

// ---------------------------------------------------------------------------
// Line classification
// ---------------------------------------------------------------------------

/** Count leading whitespace characters on a line. */
function leadingIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

/**
 * Parse a column guide row: 2+ groups of consecutive dashes (≥3 each),
 * separated by whitespace. Returns column spans (relative to content start
 * after stripping indent) and the indent amount, or null.
 */
function parseColumnGuide(line: string): GuideInfo | null {
  const trimmed = line.trimEnd();
  if (!trimmed) return null;

  // Must contain only dashes and spaces
  if (!/^[\s-]+$/.test(trimmed)) return null;

  const indent = leadingIndent(trimmed);
  const content = trimmed.slice(indent);

  const spans: ColumnSpan[] = [];
  let j = 0;

  while (j < content.length) {
    if (content[j] === '-') {
      const start = j;
      while (j < content.length && content[j] === '-') j++;
      if (j - start >= 3) {
        spans.push({ start, end: j - 1 });
      }
    } else {
      j++;
    }
  }

  return spans.length >= 2 ? { spans, indent } : null;
}

/** A solid border line is a single unbroken run of dashes (optional indent). */
function isSolidBorder(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length >= 3 && /^-+$/.test(trimmed);
}

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

// ---------------------------------------------------------------------------
// Cell extraction
// ---------------------------------------------------------------------------

/**
 * Extract cell values from a line using column spans.
 * Strips `indent` characters from the line before slicing so that
 * spans (which are relative to content start) align correctly.
 */
function extractCells(line: string, spans: ColumnSpan[], indent: number): string[] {
  const content = line.length > indent ? line.slice(indent) : '';
  const lastIdx = spans.length - 1;
  return spans.map(({ start, end }, i) => {
    if (start >= content.length) return '';
    // Last column reads to end of line so overflow text isn't truncated.
    const stop = i === lastIdx ? content.length : Math.min(end + 1, content.length);
    return content.slice(start, stop).trim();
  });
}

function hasAlphanumericContent(cells: string[]): boolean {
  return cells.some((cell) => /[a-zA-Z0-9]/.test(cell));
}

/**
 * Detect whether any non-final column has a value that overflows past its
 * span boundary.
 *
 * Finds the continuous non-space run that crosses the boundary and measures
 * the space gap immediately before it. A wide gap (≥2 spaces) is a column
 * separator — the boundary text is the next column starting early due to
 * short padding. A narrow gap (0–1 spaces) is a word break within the same
 * cell value, so the value genuinely overflows.
 *
 *   `ab cdef`    in a 5-char span → 1-space word break → overflow
 *   ` abcdef`    in a 5-char span → leading pad, no content before → overflow
 *   `val      X` in a 29-char span → wide gap → early column start, allowed
 */
function cellsOverflow(line: string, spans: ColumnSpan[], indent: number): boolean {
  const content = line.length > indent ? line.slice(indent) : '';
  for (let i = 0; i < spans.length - 1; i++) {
    const { start, end } = spans[i];
    const afterCol = end + 1;
    if (afterCol >= content.length || content[afterCol] === ' ') continue;
    if (content[end] === ' ') continue;
    // Find where the non-space run crossing the boundary starts.
    let runStart = end;
    while (runStart > start && content[runStart - 1] !== ' ') runStart--;
    // Count consecutive spaces immediately before the run.
    let gapWidth = 0;
    for (let j = runStart - 1; j >= start; j--) {
      if (content[j] === ' ') gapWidth++;
      else break;
    }
    // A wide gap (≥2 spaces) separates the column's value from the next
    // column's early-start text. A narrow gap is a word break within the
    // same value — the cell genuinely overflows.
    if (gapWidth < 2) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Table recognition
// ---------------------------------------------------------------------------

/**
 * Try to recognize a fixed-width table starting at line `i`.
 *
 * Layout A: border at i, header at i+1, guide at i+2.
 * Layout B: header at i, guide at i+1.
 *
 * Rejects candidates where the header indent differs from the guide indent,
 * which prevents cell text corruption from misaligned column slicing.
 */
function tryParseTableAt(lines: string[], i: number): ParsedTable | null {
  // Layout A: top border → header → guide
  if (i + 2 < lines.length && isSolidBorder(lines[i])) {
    const guide = parseColumnGuide(lines[i + 2]);
    if (guide && leadingIndent(lines[i + 1]) === guide.indent) {
      if (hasAlphanumericContent(extractCells(lines[i + 1], guide.spans, guide.indent))) {
        return buildTable(lines, guide, { topBorderIdx: i, headerIdx: i + 1, guideIdx: i + 2 });
      }
    }
  }

  // Layout B: header → guide
  if (i + 1 < lines.length) {
    const guide = parseColumnGuide(lines[i + 1]);
    if (guide && leadingIndent(lines[i]) === guide.indent) {
      if (hasAlphanumericContent(extractCells(lines[i], guide.spans, guide.indent))) {
        return buildTable(lines, guide, { headerIdx: i, guideIdx: i + 1 });
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Table building
// ---------------------------------------------------------------------------

/** Max lines to scan forward when searching for a bottom border. */
const MAX_BORDER_SCAN = 100;

/** Bottom border must be at least this fraction of top border width to match. */
const MIN_BORDER_WIDTH_RATIO = 0.4;

function buildTable(lines: string[], guide: GuideInfo, anchors: TableAnchors): ParsedTable | null {
  const { topBorderIdx, headerIdx, guideIdx } = anchors;
  const { spans, indent } = guide;
  const startLine = topBorderIdx ?? headerIdx;
  const headers = extractCells(lines[headerIdx], spans, indent);

  // Only look for a bottom border when a top border is present.
  let bottomBorderIdx = topBorderIdx !== undefined ? findBottomBorder(lines, guideIdx + 1) : undefined;

  // Validate the candidate bottom border against two structural signals:
  //   1. Border shape: the candidate must resemble the top border (similar width/indent).
  //      This prevents short thematic breaks (---) from being mistaken for table borders.
  //   2. Intermediate indent: all non-blank lines between the guide and the candidate
  //      must have at least the table's leading indent, ruling out unrelated prose.
  if (bottomBorderIdx !== undefined && topBorderIdx !== undefined) {
    const borderOk = bordersMatch(lines[topBorderIdx], lines[bottomBorderIdx]);
    const contentOk = intermediateLinesMeetIndent(lines, guideIdx + 1, bottomBorderIdx, indent);
    if (!borderOk || !contentOk) {
      bottomBorderIdx = undefined; // discard false bottom border → fall back to unbounded
    }
  }

  const { rows, lastConsumedIdx } = parseDataRows(lines, spans, indent, guideIdx + 1, bottomBorderIdx);
  if (rows.length === 0) return null;

  const endLine = bottomBorderIdx ?? lastConsumedIdx;
  return { startLine, endLine, headers, rows };
}

/**
 * Check whether two border lines are structurally similar enough to be a
 * matching top/bottom pair. A short thematic break (`---`, 3 chars) will
 * not match a full-width table border (`---...---`, 70+ chars).
 */
function bordersMatch(topBorder: string, candidateBottom: string): boolean {
  const topLen = topBorder.trim().length;
  const bottomLen = candidateBottom.trim().length;
  if (bottomLen < topLen * MIN_BORDER_WIDTH_RATIO) return false;
  // Indent should be similar (within 2 characters).
  if (Math.abs(leadingIndent(topBorder) - leadingIndent(candidateBottom)) > 2) return false;
  return true;
}

/**
 * Check that all non-blank, non-border lines between fromIdx and toIdx
 * (exclusive) have at least the table's leading indent.
 * Lines with less indent are unrelated prose that wandered between the
 * top border and a candidate bottom border.
 */
function intermediateLinesMeetIndent(lines: string[], fromIdx: number, toIdx: number, indent: number): boolean {
  for (let k = fromIdx; k < toIdx; k++) {
    const line = lines[k];
    if (isBlank(line) || isSolidBorder(line)) continue;
    if (leadingIndent(line) < indent) return false;
  }
  return true;
}

/**
 * Scan forward from `fromIdx` for a solid border line.
 * Skips fenced code blocks and stops at markdown headings.
 */
function findBottomBorder(lines: string[], fromIdx: number): number | undefined {
  const limit = Math.min(fromIdx + MAX_BORDER_SCAN, lines.length);

  for (let i = fromIdx; i < limit; i++) {
    if (isFenceOpener(lines[i])) {
      i = findFenceClose(lines, i);
      continue;
    }
    if (isIndentedCodeOpener(lines[i])) {
      i = findIndentedCodeClose(lines, i);
      continue;
    }
    if (isSolidBorder(lines[i])) return i;
    // A markdown heading means we've left the table's section.
    if (/^#{1,6}\s/.test(lines[i].trimStart())) return undefined;
  }

  return undefined;
}

/**
 * Parse data rows from lines after the column guide.
 *
 * When `boundaryIdx` is defined (bordered table), lines up to but not including
 * the boundary are processed, and blank lines are treated as row separators.
 *
 * When `boundaryIdx` is undefined (unbounded table), the first blank line
 * terminates the table.
 *
 * Continuation lines (first column empty) are merged into the preceding row.
 */
function parseDataRows(
  lines: string[],
  spans: ColumnSpan[],
  indent: number,
  startIdx: number,
  boundaryIdx: number | undefined,
): { rows: string[][]; lastConsumedIdx: number } {
  const rows: string[][] = [];
  const bounded = boundaryIdx !== undefined;
  const limit = boundaryIdx ?? lines.length;
  let lastConsumed = startIdx - 1;
  let skippingOverflow = false;

  for (let i = startIdx; i < limit; i++) {
    if (isBlank(lines[i])) {
      skippingOverflow = false;
      if (bounded) {
        lastConsumed = i;
        continue; // row separator inside bordered table
      }
      break; // unbounded: blank = end of table
    }

    if (isSolidBorder(lines[i])) break;

    // Reject rows where non-final columns overflow their span boundaries.
    // First data row overflow → guide doesn't match data → reject entire table.
    // Later row overflow → skip that row and its continuation lines.
    if (cellsOverflow(lines[i], spans, indent)) {
      if (rows.length === 0) break;
      skippingOverflow = true;
      lastConsumed = i;
      continue;
    }

    const cells = extractCells(lines[i], spans, indent);
    if (!hasAlphanumericContent(cells) && rows.length === 0) break;

    if (cells[0].length === 0 && rows.length > 0) {
      // Continuation line: skip if the parent row was skipped due to overflow.
      if (skippingOverflow) {
        lastConsumed = i;
        continue;
      }
      // Merge non-empty cells into previous row
      const prev = rows[rows.length - 1];
      for (let c = 0; c < spans.length; c++) {
        if (cells[c]) {
          prev[c] = prev[c] ? `${prev[c]} ${cells[c]}` : cells[c];
        }
      }
    } else if (hasAlphanumericContent(cells)) {
      skippingOverflow = false;
      rows.push(cells);
    }

    lastConsumed = i;
  }

  return { rows, lastConsumedIdx: lastConsumed };
}

// ---------------------------------------------------------------------------
// GFM pipe-table output
// ---------------------------------------------------------------------------

function escapePipe(text: string): string {
  return text.replace(/\|/g, '\\|');
}

function toGfmPipeTable({ headers, rows }: ParsedTable): string[] {
  const n = headers.length;
  const cell = (row: string[], i: number) => escapePipe(row[i] ?? '');

  const headerLine = `| ${headers.map(escapePipe).join(' | ')} |`;
  const separator = `| ${Array.from({ length: n }, () => '---').join(' | ')} |`;
  const dataLines = rows.map((row) => `| ${Array.from({ length: n }, (_, i) => cell(row, i)).join(' | ')} |`);

  return [headerLine, separator, ...dataLines];
}
