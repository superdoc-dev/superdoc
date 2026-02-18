import { closeDocument, openDocument, replaceInDocument, saveDocument } from '../lib/editor';

export interface ReplaceFileResult {
  path: string;
  replacements: number;
}

export interface ReplaceResult {
  find: string;
  replace: string;
  files: ReplaceFileResult[];
  totalReplacements: number;
}

/**
 * Replace pattern in a single file
 */
async function replaceInFile(filePath: string, find: string, replace: string): Promise<ReplaceFileResult> {
  const doc = await openDocument(filePath);

  try {
    const replacements = replaceInDocument(doc, find, replace);

    if (replacements > 0) {
      await saveDocument(doc);
    }

    return { path: filePath, replacements };
  } finally {
    closeDocument(doc);
  }
}

/**
 * Replace a pattern across multiple files
 */
export async function replace(find: string, replaceWith: string, filePaths: string[]): Promise<ReplaceResult> {
  const results = await Promise.all(filePaths.map((fp) => replaceInFile(fp, find, replaceWith)));

  const filesWithReplacements = results.filter((r) => r.replacements > 0);
  const totalReplacements = results.reduce((sum, r) => sum + r.replacements, 0);

  return {
    find,
    replace: replaceWith,
    files: filesWithReplacements,
    totalReplacements,
  };
}
