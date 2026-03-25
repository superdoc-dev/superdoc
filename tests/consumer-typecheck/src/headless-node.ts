/**
 * Consumer typecheck: Node.js headless usage.
 *
 * Verifies that Buffer is included in export return types
 * and that SaveOptions includes all fields (fieldsHighlightColor,
 * compression) that headless consumers rely on.
 */
import { Editor } from 'superdoc';
import type { SaveOptions } from 'superdoc';

async function headlessExport() {
  const editor = new Editor({});

  // exportDocument should return Blob | Buffer
  const result = await editor.exportDocument({ isFinalDoc: true });

  // In Node.js, result is Buffer
  if (Buffer.isBuffer(result)) {
    const fs = await import('fs');
    fs.writeFileSync('/tmp/test.docx', result);
  }

  // Save with all options including fieldsHighlightColor and compression
  const opts: SaveOptions = {
    isFinalDoc: true,
    commentsType: 'none',
    fieldsHighlightColor: null,
    compression: 'STORE',
  };
  await editor.exportDocx(opts);
}
