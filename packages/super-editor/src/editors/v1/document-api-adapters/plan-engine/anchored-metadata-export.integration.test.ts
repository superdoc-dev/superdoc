import { describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

function seedMetadataPart(
  convertedXml: Record<string, unknown>,
  partName: string,
  namespace: string,
  entries: Array<{ id: string; json: string }>,
): void {
  convertedXml[partName] = {
    elements: [
      {
        type: 'element',
        name: 'refs',
        attributes: { xmlns: namespace },
        elements: entries.map((entry) => ({
          type: 'element',
          name: 'ref',
          attributes: { id: entry.id, encoding: 'json' },
          elements: [{ type: 'text', text: entry.json }],
        })),
      },
    ],
  };
}

async function createEditorWithEmptyPackage() {
  const docData = await loadTestDataForEditorTests('blank-doc.docx');
  const { editor } = initTestEditor({
    content: docData.docx,
    media: docData.media,
    mediaFiles: docData.mediaFiles,
    fonts: docData.fonts,
    useImmediateSetTimeout: false,
    isHeadless: true,
    user: { name: 'Test', email: 'test@example.com' },
  });
  return editor;
}

describe('anchored metadata export filtering', () => {
  it('removes anchored-metadata entries from customXml when exporting final doc', async () => {
    const editor = await createEditorWithEmptyPackage();

    try {
      editor.commands.insertContent('Hello');
      editor.commands.insertStructuredContentInline({
        attrs: {
          id: '101',
          tag: 'meta-resolved',
          alias: 'Anchored metadata',
        },
        text: 'Anchor',
      });

      const convertedXml = (editor as unknown as { converter: { convertedXml: Record<string, unknown> } }).converter
        .convertedXml;
      seedMetadataPart(convertedXml, 'customXml/item1.xml', 'urn:test:metadata', [
        { id: 'meta-resolved', json: '{"v":1}' },
        { id: 'meta-orphan', json: '{"v":2}' },
      ]);

      const updatedDocs = (await editor.exportDocx({ isFinalDoc: true, getUpdatedDocs: true })) as Record<
        string,
        string | null
      >;

      const metadataXml = updatedDocs['customXml/item1.xml'];
      expect(typeof metadataXml).toBe('string');
      expect(metadataXml).not.toContain('meta-resolved');
      expect(metadataXml).not.toContain('meta-orphan');
    } finally {
      editor.destroy();
    }
  });
});
