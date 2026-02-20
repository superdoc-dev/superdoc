import fs from 'fs';
import path from 'path';

const DOCX_EXTENSION = '.docx';

export function isValidDocxFilename(fileName, ignore = new Set()) {
  if (!fileName || typeof fileName !== 'string') return false;
  if (fileName.startsWith('.')) return false;
  if (!fileName.toLowerCase().endsWith(DOCX_EXTENSION)) return false;
  if (ignore.has(fileName)) return false;
  return true;
}

export function filterDocxFiles(files, ignore = new Set()) {
  return files.filter((fileName) => isValidDocxFilename(fileName, ignore));
}

export function loadDocumentsFromFolders(folders, ignore = new Set()) {
  return folders.flatMap(({ key, folder }) => {
    const dir = path.resolve(process.cwd(), folder);
    if (!fs.existsSync(dir)) return [];

    try {
      return filterDocxFiles(fs.readdirSync(dir), ignore).map((file) => ({
        id: `${key}-${file}`,
        filePath: path.join(folder, file),
      }));
    } catch (error) {
      console.error(`Error reading directory ${dir}:`, error.message);
      return [];
    }
  });
}
