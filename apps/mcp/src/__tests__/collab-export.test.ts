import { describe, it, expect } from 'bun:test';
import { Doc as YDoc } from 'yjs';
import { Editor } from 'superdoc/super-editor';
import { buildAttachEditor } from '../session-manager.js';

/**
 * Regression: `superdoc_save` over a collab attach reported
 * "Exported document data is not binary (got undefined)".
 *
 * Root cause: the attach editor was built with no docx source, so
 * `converter.convertedXml` carried none of the base OOXML parts that
 * `Editor.exportDocx` unguarded-derefs (docProps/custom.xml, word/styles.xml,
 * word/_rels/document.xml.rels). The deref threw; the swallowing catch in
 * exportDocx returned `undefined`.
 *
 * A collab-joiner editor must export a valid .docx even with an empty Yjs doc.
 */
describe('collab attach export (superdoc_save over a room)', () => {
  it('exports binary .docx bytes from a collab-joiner editor with no docx source', async () => {
    const ydoc = new YDoc({ gc: false });
    const editor = await buildAttachEditor(ydoc, 'test-room');

    const exported = await editor.exportDocument();

    // The pre-fix failure mode: exportDocx throws on the missing parts and the
    // catch swallows to undefined.
    expect(exported).toBeDefined();

    const bytes = exported instanceof Uint8Array ? exported : new Uint8Array(await (exported as Blob).arrayBuffer());

    expect(bytes.byteLength).toBeGreaterThan(0);
    // Valid .docx is a ZIP — "PK" local-file-header magic.
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'

    // Round-trip: the exported bytes must re-open as a structurally valid docx
    // carrying the base OOXML parts that were previously missing.
    const [parts] = (await Editor.loadXmlData(Buffer.from(bytes), true))!;
    const names = new Set(parts.map((p: { name: string }) => p.name));
    expect(names.has('word/document.xml')).toBe(true);
    expect(names.has('word/styles.xml')).toBe(true);
    expect(names.has('word/_rels/document.xml.rels')).toBe(true);

    editor.destroy();
  });
});
