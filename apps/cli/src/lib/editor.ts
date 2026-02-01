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

/**
 * Search for text in the document
 * Returns array of matches with positions
 */
export function searchDocument(
  doc: DocumentEditor,
  pattern: string,
): Array<{ from: number; to: number; text: string }> {
  type Match = { from: number; to: number; text: string };
  const matches = doc.editor.commands.search?.(pattern, {
    highlight: false,
  }) as Match[] | undefined;
  if (!matches) return [];
  return matches.map((m) => ({
    from: m.from,
    to: m.to,
    text: m.text,
  }));
}

/**
 * Replace all occurrences of a pattern with replacement text
 * Returns the number of replacements made
 */
export function replaceInDocument(doc: DocumentEditor, find: string, replaceWith: string): number {
  // Search for all matches
  const matches = searchDocument(doc, find);
  if (matches.length === 0) return 0;

  // Sort matches by position descending (replace from end to start to avoid position shifts)
  const sortedMatches = [...matches].sort((a, b) => b.from - a.from);

  // Replace each match using editor chain
  for (const match of sortedMatches) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc.editor.chain() as any).setTextSelection({ from: match.from, to: match.to }).insertContent(replaceWith).run();
  }

  return matches.length;
}
