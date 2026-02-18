import { readFile, writeFile } from 'node:fs/promises';
import { Editor } from 'superdoc/super-editor';

export interface DocumentEditor {
  editor: Editor;
  path: string;
}

/**
 * Opens a document in headless mode using the new Editor.open() API
 */
export async function openDocument(path: string): Promise<DocumentEditor> {
  const buffer = await readFile(path);

  const editor = await Editor.open(buffer, {
    documentId: path,
  });

  return { editor, path };
}

/**
 * Saves the document back to disk
 */
export async function saveDocument(doc: DocumentEditor): Promise<void> {
  const result = await doc.editor.exportDocument({ format: 'docx' });
  // In headless mode, exportDocument returns a Buffer/Uint8Array directly
  await writeFile(doc.path, result as Buffer);
}

/**
 * Closes and cleans up the editor
 */
export function closeDocument(doc: DocumentEditor): void {
  doc.editor.destroy();
}

/**
 * Gets the plain text content of the document
 */
export function getDocumentText(doc: DocumentEditor): string {
  const { state } = doc.editor;
  return state.doc.textContent;
}

export interface DocRange {
  from: number;
  to: number;
}

export interface SearchMatch {
  from: number;
  to: number;
  text: string;
  ranges?: DocRange[];
}

/**
 * Search for text in the document
 * Returns array of matches with positions
 */
export function searchDocument(doc: DocumentEditor, pattern: string): SearchMatch[] {
  const matches = doc.editor.commands.search?.(pattern, {
    highlight: false,
  }) as SearchMatch[] | undefined;
  if (!matches) return [];
  return matches.map((m) => ({
    from: m.from,
    to: m.to,
    text: m.text,
    ranges: m.ranges,
  }));
}

/**
 * Replace all occurrences of a pattern with replacement text
 * Returns the number of replacements made
 *
 * Handles cross-paragraph matches by replacing each range individually,
 * preserving document structure (paragraph boundaries, bookmarks, etc.)
 */
export function replaceInDocument(doc: DocumentEditor, find: string, replaceWith: string): number {
  // Search for all matches
  const matches = searchDocument(doc, find);
  if (matches.length === 0) return 0;

  // Collect all ranges from all matches, then sort by position descending
  // For multi-range matches (cross-paragraph), we replace each range separately
  // to avoid deleting content between ranges (paragraph boundaries, etc.)
  const allRanges: Array<{ from: number; to: number; isFirst: boolean }> = [];

  for (const match of matches) {
    if (match.ranges && match.ranges.length > 0) {
      // Multi-range match: add each range, marking the first one for replacement text
      match.ranges.forEach((range, index) => {
        allRanges.push({
          from: range.from,
          to: range.to,
          isFirst: index === 0,
        });
      });
    } else {
      // Single range match
      allRanges.push({
        from: match.from,
        to: match.to,
        isFirst: true,
      });
    }
  }

  // Sort by position descending (replace from end to start to avoid position shifts)
  allRanges.sort((a, b) => b.from - a.from);

  // Replace each range
  // For multi-range matches: first range gets the replacement text, others are deleted
  for (const range of allRanges) {
    const content = range.isFirst ? replaceWith : '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc.editor.chain() as any).setTextSelection({ from: range.from, to: range.to }).insertContent(content).run();
  }

  return matches.length;
}
