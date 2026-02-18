import { closeDocument, getDocumentText, openDocument, searchDocument } from '../lib/editor';

export interface SearchMatch {
  from: number;
  to: number;
  text: string;
  context?: string;
}

export interface SearchFileResult {
  path: string;
  matches: SearchMatch[];
}

export interface SearchResult {
  pattern: string;
  files: SearchFileResult[];
  totalMatches: number;
}

/**
 * Extract context around a match position
 */
function getMatchContext(fullText: string, from: number, to: number, contextChars = 40): string {
  const start = Math.max(0, from - contextChars);
  const end = Math.min(fullText.length, to + contextChars);

  let context = fullText.slice(start, end);

  // Add ellipsis if truncated
  if (start > 0) context = `...${context}`;
  if (end < fullText.length) context = `${context}...`;

  return context.replace(/\n/g, ' ');
}

/**
 * Search for a pattern in a single file
 */
async function searchFile(filePath: string, pattern: string): Promise<SearchFileResult> {
  const doc = await openDocument(filePath);

  try {
    const matches = searchDocument(doc, pattern);
    const fullText = getDocumentText(doc);

    return {
      path: filePath,
      matches: matches.map((m) => ({
        ...m,
        context: getMatchContext(fullText, m.from, m.to),
      })),
    };
  } finally {
    closeDocument(doc);
  }
}

/**
 * Search for a pattern across multiple files
 */
export async function search(pattern: string, filePaths: string[]): Promise<SearchResult> {
  const results = await Promise.all(filePaths.map((fp) => searchFile(fp, pattern)));

  const filesWithMatches = results.filter((r) => r.matches.length > 0);
  const totalMatches = filesWithMatches.reduce((sum, r) => sum + r.matches.length, 0);

  return {
    pattern,
    files: filesWithMatches,
    totalMatches,
  };
}
