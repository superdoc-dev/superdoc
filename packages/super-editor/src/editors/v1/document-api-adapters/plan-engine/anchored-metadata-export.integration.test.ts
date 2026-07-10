import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness.js';
import JSZip from 'jszip';
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

function createProviderStub(ydoc: Y.Doc) {
  return {
    synced: true,
    isSynced: true,
    on: vi.fn(),
    off: vi.fn(),
    disconnect: vi.fn(),
    awareness: new Awareness(ydoc),
  };
}

async function createCollaborativeEditorWithEmptyPackage(ydoc: Y.Doc) {
  const docData = await loadTestDataForEditorTests('blank-doc.docx');
  const { editor } = initTestEditor({
    content: docData.docx,
    media: docData.media,
    mediaFiles: docData.mediaFiles,
    fonts: docData.fonts,
    ydoc,
    collaborationProvider: createProviderStub(ydoc),
    useImmediateSetTimeout: false,
    isHeadless: true,
    user: { name: 'Test', email: 'test@example.com' },
  });
  return editor;
}

function resolveBlockId(insertReceipt: unknown): string {
  const receipt = insertReceipt as {
    target?: { blockId?: unknown };
    resolution?: { target?: { blockId?: unknown } };
  };
  const direct = receipt.target?.blockId;
  if (typeof direct === 'string' && direct.length > 0) return direct;
  const resolved = receipt.resolution?.target?.blockId;
  if (typeof resolved === 'string' && resolved.length > 0) return resolved;
  throw new Error('insert receipt did not include a blockId');
}

function convertedXml(editor: unknown): Record<string, unknown> {
  return (editor as { converter: { convertedXml: Record<string, unknown> } }).converter.convertedXml;
}

function syncYDocs(source: Y.Doc, target: Y.Doc): void {
  Y.applyUpdate(target, Y.encodeStateAsUpdate(source));
}

async function readZipPart(buffer: Uint8Array, path: string): Promise<string | undefined> {
  const zip = await JSZip.loadAsync(buffer);
  return zip.files[path]?.async('string');
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

  it('exports metadata customXml parts received from a collaborator', async () => {
    const ydocA = new Y.Doc();
    const ydocB = new Y.Doc();
    const editorA = await createCollaborativeEditorWithEmptyPackage(ydocA);

    await vi.waitFor(() => {
      expect((editorA as unknown as { _partPublisher?: unknown })._partPublisher).toBeDefined();
    });

    // Model the real join order: A seeds the room first, then B receives that
    // state BEFORE bootstrapping, so B hydrates instead of seeding. Creating
    // both editors on unsynced ydocs makes both seed the same baseline keys as
    // concurrent Yjs writes, and the map-key conflict is then resolved by
    // clientID — with the wrong winner, B's baseline word/_rels/document.xml.rels
    // silently discards A's published rels update.
    syncYDocs(ydocA, ydocB);
    const editorB = await createCollaborativeEditorWithEmptyPackage(ydocB);
    const hostText = 'Alpha metadata target.';

    try {
      await vi.waitFor(() => {
        expect((editorB as unknown as { _partPublisher?: unknown })._partPublisher).toBeDefined();
      });

      const inserted = await Promise.resolve(editorA.doc.insert({ value: hostText }));
      const blockId = resolveBlockId(inserted);
      const start = hostText.indexOf('metadata');
      const end = start + 'metadata'.length;

      const attached = editorA.doc.metadata.attach({
        id: 'meta-export-sync',
        namespace: 'urn:test:metadata-export-sync',
        payload: { label: 'Remote export' },
        target: {
          kind: 'selection',
          start: { kind: 'text', blockId, offset: start },
          end: { kind: 'text', blockId, offset: end },
        },
      });
      expect(attached.success).toBe(true);

      syncYDocs(ydocA, ydocB);
      await vi.waitFor(() => {
        expect(convertedXml(editorB)['customXml/item1.xml']).toBeDefined();
        expect(convertedXml(editorB)['customXml/itemProps1.xml']).toBeDefined();
        expect(convertedXml(editorB)['customXml/_rels/item1.xml.rels']).toBeDefined();
        // The baseline package already contains document.xml.rels, so checking
        // mere existence would pass before the remote UPDATE lands — wait for
        // the received rels content to reference the custom XML part.
        expect(JSON.stringify(convertedXml(editorB)['word/_rels/document.xml.rels'])).toContain(
          'relationships/customXml',
        );
      });

      const exported = (await editorB.exportDocx({ getUpdatedDocs: false })) as Uint8Array;
      const metadataXml = await readZipPart(exported, 'customXml/item1.xml');
      const propsXml = await readZipPart(exported, 'customXml/itemProps1.xml');
      const itemRelsXml = await readZipPart(exported, 'customXml/_rels/item1.xml.rels');
      const documentRelsXml = await readZipPart(exported, 'word/_rels/document.xml.rels');

      expect(metadataXml).toContain('meta-export-sync');
      expect(metadataXml).toContain('Remote export');
      expect(propsXml).toContain('datastoreItem');
      expect(itemRelsXml).toContain('customXmlProps');
      expect(documentRelsXml).toContain('relationships/customXml');
      expect(documentRelsXml).toContain('../customXml/item1.xml');
    } finally {
      editorA.destroy();
      editorB.destroy();
      ydocA.destroy();
      ydocB.destroy();
    }
  });
});
