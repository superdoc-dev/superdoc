/**
 * DOCX fidelity checker utilities.
 *
 * Unzips a DOCX file, parses its XML parts, and runs structural checks on the
 * OOXML content. Used to verify that formatting, styles, numbering, tracked
 * changes, comments, and table structure survive document edits.
 *
 * All XML parsing is regex-based — no XML parser dependency.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// parseDocx
// ---------------------------------------------------------------------------

/**
 * Unzip a DOCX, return raw XML strings for its main parts.
 *
 * @param {string} docxPath - Absolute path to the DOCX file.
 * @returns {Promise<{
 *   documentXml: string,
 *   stylesXml: string|null,
 *   numberingXml: string|null,
 *   commentsXml: string|null,
 * }>}
 */
export async function parseDocx(docxPath) {
  const tempDir = mkdtempSync(join(tmpdir(), 'superdoc-fidelity-'));
  try {
    execSync(`unzip -q "${docxPath}" "word/*.xml" -d "${tempDir}"`, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15000,
    });

    const readPart = (filename) => {
      const path = join(tempDir, 'word', filename);
      if (!existsSync(path)) return null;
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return null;
      }
    };

    const documentXml = readPart('document.xml');
    if (!documentXml) {
      throw new Error(`word/document.xml not found in ${docxPath}`);
    }

    return {
      documentXml,
      stylesXml: readPart('styles.xml'),
      numberingXml: readPart('numbering.xml'),
      commentsXml: readPart('comments.xml'),
    };
  } finally {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}

// ---------------------------------------------------------------------------
// checkRunFormatting
// ---------------------------------------------------------------------------

/**
 * Check if a text run containing `textContent` has a formatting property.
 *
 * @param {string} documentXml
 * @param {string} textContent - Text to search for inside <w:t> elements.
 * @param {'bold'|'italic'|'underline'} property
 * @returns {{ found: boolean, hasProperty: boolean, reason: string }}
 */
export function checkRunFormatting(documentXml, textContent, property) {
  const propertyTag = {
    bold: '<w:b',
    italic: '<w:i',
    underline: '<w:u',
  }[property];

  if (!propertyTag) {
    return { found: false, hasProperty: false, reason: `Unknown property: ${property}` };
  }

  // Match individual <w:r> blocks (greedy is fine within one run)
  const runPattern = /<w:r[\s>][\s\S]*?<\/w:r>/g;
  let match;

  while ((match = runPattern.exec(documentXml)) !== null) {
    const runXml = match[0];

    // Does this run contain the target text?
    const textMatch = /<w:t[^>]*>([^<]*)<\/w:t>/.exec(runXml);
    if (!textMatch) continue;
    if (!textMatch[1].includes(textContent)) continue;

    // Found the run. Now check if its <w:rPr> contains the property tag.
    const rPrMatch = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(runXml);
    if (!rPrMatch) {
      return {
        found: true,
        hasProperty: false,
        reason: `Run containing "${textContent}" has no <w:rPr>`,
      };
    }

    const rPr = rPrMatch[1];
    const hasProperty = rPr.includes(propertyTag);

    return {
      found: true,
      hasProperty,
      reason: hasProperty
        ? `Run containing "${textContent}" has ${property}`
        : `Run containing "${textContent}" does not have ${property}`,
    };
  }

  return {
    found: false,
    hasProperty: false,
    reason: `No run found containing text "${textContent}"`,
  };
}

// ---------------------------------------------------------------------------
// checkTrackedChangeCount
// ---------------------------------------------------------------------------

/**
 * Count tracked changes (insertions and deletions) in document XML.
 *
 * @param {string} documentXml
 * @returns {{ insertions: number, deletions: number }}
 */
export function checkTrackedChangeCount(documentXml) {
  const insertions = (documentXml.match(/<w:ins /g) ?? []).length;
  const deletions = (documentXml.match(/<w:del /g) ?? []).length;
  return { insertions, deletions };
}

// ---------------------------------------------------------------------------
// checkCommentExists
// ---------------------------------------------------------------------------

/**
 * Check if a comment with the given id exists in comments XML.
 *
 * @param {string|null} commentsXml
 * @param {string} commentId - The w:id attribute value to look for.
 * @returns {{ exists: boolean, text: string|null, reason: string }}
 */
export function checkCommentExists(commentsXml, commentId) {
  if (!commentsXml) {
    return { exists: false, text: null, reason: 'commentsXml is null or empty' };
  }

  // Match the full <w:comment ... w:id="X" ...> ... </w:comment> block
  const commentPattern = /<w:comment\s[^>]*>/g;
  let headerMatch;

  while ((headerMatch = commentPattern.exec(commentsXml)) !== null) {
    const headerTag = headerMatch[0];
    const idAttr = /w:id="([^"]*)"/.exec(headerTag);
    if (!idAttr || idAttr[1] !== commentId) continue;

    // Found the opening tag. Now extract the full comment block.
    const start = headerMatch.index;
    const end = commentsXml.indexOf('</w:comment>', start);
    if (end === -1) {
      return { exists: true, text: null, reason: `Comment ${commentId} found but unclosed` };
    }

    const commentBlock = commentsXml.slice(start, end + '</w:comment>'.length);

    // Extract all <w:t> text content from the comment
    const textMatches = commentBlock.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [];
    const text = textMatches
      .map((m) => m.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, ''))
      .join('')
      .trim();

    return {
      exists: true,
      text: text || null,
      reason: `Comment ${commentId} found${text ? ` with text: "${text}"` : ' (no text)'}`,
    };
  }

  return {
    exists: false,
    text: null,
    reason: `Comment with id="${commentId}" not found`,
  };
}

// ---------------------------------------------------------------------------
// checkTableCell
// ---------------------------------------------------------------------------

/**
 * Check table cell content and alignment.
 *
 * @param {string} documentXml
 * @param {number} tableIndex - 0-based index of the table in the document.
 * @param {number} row - 0-based row index.
 * @param {number} col - 0-based column index.
 * @returns {{ text: string|null, alignment: string|null, reason: string }}
 */
export function checkTableCell(documentXml, tableIndex, row, col) {
  // Extract all <w:tbl> blocks
  const tables = extractBlocks(documentXml, 'w:tbl');

  if (tableIndex >= tables.length) {
    return {
      text: null,
      alignment: null,
      reason: `Table index ${tableIndex} out of range (found ${tables.length} tables)`,
    };
  }

  const tableXml = tables[tableIndex];
  const rows = extractBlocks(tableXml, 'w:tr');

  if (row >= rows.length) {
    return {
      text: null,
      alignment: null,
      reason: `Row index ${row} out of range (table has ${rows.length} rows)`,
    };
  }

  const rowXml = rows[row];
  const cells = extractBlocks(rowXml, 'w:tc');

  if (col >= cells.length) {
    return {
      text: null,
      alignment: null,
      reason: `Column index ${col} out of range (row has ${cells.length} cells)`,
    };
  }

  const cellXml = cells[col];

  // Extract text from all <w:t> elements
  const textMatches = cellXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [];
  const text = textMatches
    .map((m) => m.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, ''))
    .join('')
    .trim() || null;

  // Extract alignment from <w:jc w:val="...">
  const jcMatch = /<w:jc\s[^>]*w:val="([^"]*)"/.exec(cellXml);
  const alignment = jcMatch ? jcMatch[1] : null;

  return {
    text,
    alignment,
    reason: `Cell [${tableIndex}][${row}][${col}]: text="${text ?? ''}", alignment="${alignment ?? ''}"`,
  };
}

// ---------------------------------------------------------------------------
// checkParagraphStyle
// ---------------------------------------------------------------------------

/**
 * Check if a paragraph containing textContent has the expected paragraph style.
 *
 * @param {string} documentXml
 * @param {string} textContent - Text to search for.
 * @param {string} expectedStyleId - The w:val of <w:pStyle> to match.
 * @returns {{ found: boolean, hasStyle: boolean, actualStyle: string|null, reason: string }}
 */
export function checkParagraphStyle(documentXml, textContent, expectedStyleId) {
  const paragraphs = extractBlocks(documentXml, 'w:p');

  for (const paraXml of paragraphs) {
    // Skip paragraphs that don't contain the text
    if (!paraXml.includes(textContent)) continue;

    // Verify via <w:t> elements (avoid false positives from attributes)
    const allText = (paraXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [])
      .map((m) => m.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, ''))
      .join('');

    if (!allText.includes(textContent)) continue;

    // Extract paragraph style
    const pPrMatch = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(paraXml);
    if (!pPrMatch) {
      return {
        found: true,
        hasStyle: false,
        actualStyle: null,
        reason: `Paragraph containing "${textContent}" has no <w:pPr>`,
      };
    }

    const pPr = pPrMatch[1];
    const styleMatch = /<w:pStyle\s[^>]*w:val="([^"]*)"/.exec(pPr);
    const actualStyle = styleMatch ? styleMatch[1] : null;
    const hasStyle = actualStyle === expectedStyleId;

    return {
      found: true,
      hasStyle,
      actualStyle,
      reason: hasStyle
        ? `Paragraph containing "${textContent}" has style "${expectedStyleId}"`
        : `Paragraph containing "${textContent}" has style "${actualStyle ?? 'none'}", expected "${expectedStyleId}"`,
    };
  }

  return {
    found: false,
    hasStyle: false,
    actualStyle: null,
    reason: `No paragraph found containing text "${textContent}"`,
  };
}

// ---------------------------------------------------------------------------
// diffDocxXml
// ---------------------------------------------------------------------------

/**
 * Compare two DOCX files at XML element level.
 *
 * Extracts opening tags from document.xml in both files and counts how many
 * differ. Comparing a file to itself returns 0 changed elements.
 *
 * @param {string} originalPath
 * @param {string} outputPath
 * @returns {Promise<{
 *   totalElements: number,
 *   changedElements: number,
 *   ratio: number,
 *   reason: string,
 * }>}
 */
export async function diffDocxXml(originalPath, outputPath) {
  const [{ documentXml: origXml }, { documentXml: outXml }] = await Promise.all([
    parseDocx(originalPath),
    parseDocx(outputPath),
  ]);

  const origTags = extractOpeningTags(origXml);
  const outTags = extractOpeningTags(outXml);

  const totalElements = Math.max(origTags.length, outTags.length);

  if (totalElements === 0) {
    return { totalElements: 0, changedElements: 0, ratio: 0, reason: 'No elements found' };
  }

  // Count tag-by-tag differences (positional comparison)
  let changedElements = 0;
  const maxLen = Math.max(origTags.length, outTags.length);
  for (let i = 0; i < maxLen; i++) {
    const a = origTags[i] ?? '';
    const b = outTags[i] ?? '';
    if (a !== b) changedElements++;
  }

  const ratio = changedElements / totalElements;

  return {
    totalElements,
    changedElements,
    ratio,
    reason: `${changedElements}/${totalElements} elements differ (ratio: ${ratio.toFixed(3)})`,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract all top-level blocks for a given tag name from XML.
 * Handles nested tags with the same name via a depth counter.
 *
 * @param {string} xml
 * @param {string} tagName - e.g. 'w:tbl', 'w:tr', 'w:tc', 'w:p'
 * @returns {string[]}
 */
function extractBlocks(xml, tagName) {
  const blocks = [];
  const openTag = `<${tagName}`;
  const closeTag = `</${tagName}>`;
  let pos = 0;

  while (pos < xml.length) {
    const start = xml.indexOf(openTag, pos);
    if (start === -1) break;

    // Ensure it's a proper tag start (followed by > or whitespace)
    const charAfter = xml[start + openTag.length];
    if (charAfter !== '>' && charAfter !== ' ' && charAfter !== '\n' && charAfter !== '\r' && charAfter !== '\t') {
      pos = start + 1;
      continue;
    }

    // Walk forward counting depth to find matching close tag
    let depth = 1;
    let searchFrom = start + openTag.length;

    while (depth > 0) {
      const nextOpen = xml.indexOf(openTag, searchFrom);
      const nextClose = xml.indexOf(closeTag, searchFrom);

      if (nextClose === -1) break; // malformed XML

      if (nextOpen !== -1 && nextOpen < nextClose) {
        // Check it's a real open tag
        const c = xml[nextOpen + openTag.length];
        if (c === '>' || c === ' ' || c === '\n' || c === '\r' || c === '\t') {
          depth++;
        }
        searchFrom = nextOpen + openTag.length;
      } else {
        depth--;
        searchFrom = nextClose + closeTag.length;
      }
    }

    const end = searchFrom;
    blocks.push(xml.slice(start, end));
    pos = end;
  }

  return blocks;
}

/**
 * Extract all opening XML tags from document XML.
 * Used for structural comparison between two documents.
 *
 * @param {string} xml
 * @returns {string[]}
 */
function extractOpeningTags(xml) {
  // Match opening tags (not closing tags, not self-closing processing instructions)
  const pattern = /<([a-zA-Z][^>/\s]*)[^>]*>/g;
  const tags = [];
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    // Skip closing tags that slip through (e.g. </w:r> — but pattern above won't match those)
    tags.push(match[0]);
  }
  return tags;
}
