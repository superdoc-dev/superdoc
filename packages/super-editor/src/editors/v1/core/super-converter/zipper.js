import JSZip from 'jszip';

/**
 * Take a list of blobs and file names and create a zip file.
 *
 * The previous `@param {Array[Blob]}` / `@param {Array[string]}`
 * syntax was invalid JSDoc (the array type expression is `Type[]`
 * or `Array<Type>`, not `Array[Type]`). TypeScript parsed the
 * malformed syntax and fell back to `any`, leaking through the
 * SD-3213 supported-root audit.
 *
 * @param {Blob[]} blobs List of blobs to zip
 * @param {string[]} fileNames List of file names to zip
 * @returns {Promise<Blob>} The zipped file
 */
export async function createZip(blobs, fileNames) {
  const zip = new JSZip();

  blobs.forEach((blob, index) => {
    zip.file(fileNames[index], blob);
  });

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return zipBlob;
}
