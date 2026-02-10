import { Editor } from '@core/Editor.js';
import { zipFolderToBuffer } from './zipFolderToBuffer.js';

/**
 * Load an unpacked docx from a directory
 * @param dirName path to the directory
 */
export async function loadUnpackedDocx(dirName: string): ReturnType<typeof Editor.loadXmlData> {
  const buffer = await zipFolderToBuffer(dirName);

  return Editor.loadXmlData(buffer, true);
}
