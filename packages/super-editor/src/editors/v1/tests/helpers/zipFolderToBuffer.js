import JSZip from 'jszip';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Zip a folder (already-extracted DOCX) into a buffer so it can be fed into Editor.loadXmlData.
 * @param {string} folderPath absolute path to the folder
 * @returns {Promise<Buffer>}
 */
export const zipFolderToBuffer = async (folderPath) => {
  const zip = new JSZip();

  const addFolder = async (basePath, targetFolder) => {
    const entries = await fs.readdir(basePath, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = join(basePath, entry.name);
      if (entry.isDirectory()) {
        const nested = targetFolder.folder(entry.name);
        await addFolder(absolute, nested);
      } else {
        const content = await fs.readFile(absolute);
        targetFolder.file(entry.name, content);
      }
    }
  };

  await addFolder(folderPath, zip);
  return zip.generateAsync({ type: 'nodebuffer' });
};
