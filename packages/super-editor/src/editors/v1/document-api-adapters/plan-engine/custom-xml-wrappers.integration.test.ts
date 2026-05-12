/* @vitest-environment jsdom */

/**
 * customXml.parts.* read-side smoke tests against a real editor.
 *
 * - Empty document: list returns no parts; get returns null.
 * - Manually injecting a custom XML part into the converter package:
 *   list discovers it, get returns its content, filters work.
 *
 * Write side (`create` / `patch` / `remove`) is implemented behind a
 * `CAPABILITY_UNAVAILABLE` stub for now; tests exist only for the
 * lookup-shaped failures, not for actual write behavior.
 */

import { describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import { Editor } from '../../core/Editor.js';

const NAMESPACE = 'urn:test:1';
const PART_NAME = 'customXml/item1.xml';
const PROPS_PART_NAME = 'customXml/itemProps1.xml';
const ITEM_ID = '{F94E36C5-3D55-44E3-9CE6-29F345BB8E78}';

function makeStorageDoc() {
  return {
    declaration: { attributes: { version: '1.0', encoding: 'UTF-8' } },
    elements: [
      {
        type: 'element',
        name: 'refs',
        attributes: { xmlns: NAMESPACE },
        elements: [
          {
            type: 'element',
            name: 'ref',
            attributes: { id: 'a' },
            elements: [],
          },
        ],
      },
    ],
  };
}

function makePropsDoc(itemId: string, schemaRefUris: string[]) {
  return {
    declaration: { attributes: { version: '1.0', encoding: 'UTF-8' } },
    elements: [
      {
        type: 'element',
        name: 'ds:datastoreItem',
        attributes: {
          'ds:itemID': itemId,
          'xmlns:ds': 'http://schemas.openxmlformats.org/officeDocument/2006/customXml',
        },
        elements: [
          {
            type: 'element',
            name: 'ds:schemaRefs',
            elements: schemaRefUris.map((uri) => ({
              type: 'element',
              name: 'ds:schemaRef',
              attributes: { 'ds:uri': uri },
            })),
          },
        ],
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

describe('customXml.parts read-side (integration)', () => {
  it('returns no parts when the document has none', async () => {
    const editor = await createEditorWithEmptyPackage();
    const list = editor.doc.customXml.parts.list();
    expect(list.items).toEqual([]);
    expect(list.total).toBe(0);
    editor.destroy();
  });

  it('discovers a manually injected part and exposes its summary', async () => {
    const editor = await createEditorWithEmptyPackage();
    const converted = (editor as unknown as { converter: { convertedXml: Record<string, unknown> } }).converter
      .convertedXml;
    converted[PART_NAME] = makeStorageDoc();
    converted[PROPS_PART_NAME] = makePropsDoc(ITEM_ID, [NAMESPACE]);

    const list = editor.doc.customXml.parts.list();
    expect(list.items.length).toBe(1);
    const item = list.items[0]!;
    expect(item.id).toBe(ITEM_ID);
    expect(item.partName).toBe(PART_NAME);
    expect(item.propsPartName).toBe(PROPS_PART_NAME);
    expect(item.rootNamespace).toBe(NAMESPACE);
    expect(item.schemaRefs).toEqual([NAMESPACE]);
    editor.destroy();
  });

  it('filters by rootNamespace', async () => {
    const editor = await createEditorWithEmptyPackage();
    const converted = (editor as unknown as { converter: { convertedXml: Record<string, unknown> } }).converter
      .convertedXml;
    converted[PART_NAME] = makeStorageDoc();
    converted[PROPS_PART_NAME] = makePropsDoc(ITEM_ID, [NAMESPACE]);

    expect(editor.doc.customXml.parts.list({ rootNamespace: NAMESPACE }).items.length).toBe(1);
    expect(editor.doc.customXml.parts.list({ rootNamespace: 'urn:other' }).items.length).toBe(0);
    editor.destroy();
  });

  it('filters by schemaRef', async () => {
    const editor = await createEditorWithEmptyPackage();
    const converted = (editor as unknown as { converter: { convertedXml: Record<string, unknown> } }).converter
      .convertedXml;
    converted[PART_NAME] = makeStorageDoc();
    converted[PROPS_PART_NAME] = makePropsDoc(ITEM_ID, [NAMESPACE]);

    expect(editor.doc.customXml.parts.list({ schemaRef: NAMESPACE }).items.length).toBe(1);
    expect(editor.doc.customXml.parts.list({ schemaRef: 'urn:other' }).items.length).toBe(0);
    editor.destroy();
  });

  it('get by id returns full content', async () => {
    const editor = await createEditorWithEmptyPackage();
    const converted = (editor as unknown as { converter: { convertedXml: Record<string, unknown> } }).converter
      .convertedXml;
    converted[PART_NAME] = makeStorageDoc();
    converted[PROPS_PART_NAME] = makePropsDoc(ITEM_ID, [NAMESPACE]);

    const info = editor.doc.customXml.parts.get({ target: { id: ITEM_ID } });
    expect(info).not.toBeNull();
    expect(info!.id).toBe(ITEM_ID);
    expect(info!.partName).toBe(PART_NAME);
    expect(info!.content).toContain('<refs');
    expect(info!.content).toContain('xmlns="urn:test:1"');
    editor.destroy();
  });

  it('get by partName returns full content (for parts without a Properties Part)', async () => {
    const editor = await createEditorWithEmptyPackage();
    const converted = (editor as unknown as { converter: { convertedXml: Record<string, unknown> } }).converter
      .convertedXml;
    // Storage Part only — simulates a foreign producer's orphan part.
    converted[PART_NAME] = makeStorageDoc();

    const info = editor.doc.customXml.parts.get({ target: { partName: PART_NAME } });
    expect(info).not.toBeNull();
    expect(info!.id).toBeUndefined();
    expect(info!.propsPartName).toBeUndefined();
    expect(info!.partName).toBe(PART_NAME);
    expect(info!.rootNamespace).toBe(NAMESPACE);
    expect(info!.schemaRefs).toEqual([]);
    expect(info!.content).toContain('<refs');
    editor.destroy();
  });

  it('returns null for unknown id', async () => {
    const editor = await createEditorWithEmptyPackage();
    const info = editor.doc.customXml.parts.get({ target: { id: '{NOT-A-REAL-ID}' } });
    expect(info).toBeNull();
    editor.destroy();
  });

  it('rejects partName targets that point at non-storage-part files', async () => {
    const editor = await createEditorWithEmptyPackage();
    // get returns null (not the document content).
    expect(editor.doc.customXml.parts.get({ target: { partName: 'word/document.xml' } })).toBeNull();
    expect(editor.doc.customXml.parts.get({ target: { partName: '[Content_Types].xml' } })).toBeNull();
    // patch and remove return TARGET_NOT_FOUND, not a successful mutation.
    const patch = editor.doc.customXml.parts.patch({
      target: { partName: 'word/document.xml' },
      content: '<a/>',
    });
    expect(patch.success).toBe(false);
    if (!patch.success) expect(patch.failure.code).toBe('TARGET_NOT_FOUND');
    const remove = editor.doc.customXml.parts.remove({ target: { partName: 'word/document.xml' } });
    expect(remove.success).toBe(false);
    if (!remove.success) expect(remove.failure.code).toBe('TARGET_NOT_FOUND');
    editor.destroy();
  });

  it('pairs storage and props parts via the item rels file, not by filename', async () => {
    // Foreign doc shape: item1.xml is linked to itemPropsFOREIGN.xml via
    // customXml/_rels/item1.xml.rels. The index-match heuristic would
    // miss the props; the rels-based pairing must find it.
    const editor = await createEditorWithEmptyPackage();
    const converted = (editor as unknown as { converter: { convertedXml: Record<string, unknown> } }).converter
      .convertedXml;
    converted[PART_NAME] = makeStorageDoc();
    converted['customXml/itemPropsFOREIGN.xml'] = makePropsDoc(ITEM_ID, [NAMESPACE]);
    converted['customXml/_rels/item1.xml.rels'] = {
      declaration: { attributes: { version: '1.0', encoding: 'UTF-8' } },
      elements: [
        {
          type: 'element',
          name: 'Relationships',
          attributes: { xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships' },
          elements: [
            {
              type: 'element',
              name: 'Relationship',
              attributes: {
                Id: 'rId1',
                Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps',
                Target: 'itemPropsFOREIGN.xml',
              },
            },
          ],
        },
      ],
    };

    const list = editor.doc.customXml.parts.list();
    expect(list.items.length).toBe(1);
    const item = list.items[0]!;
    expect(item.id).toBe(ITEM_ID);
    expect(item.propsPartName).toBe('customXml/itemPropsFOREIGN.xml');
    expect(item.schemaRefs).toEqual([NAMESPACE]);

    editor.destroy();
  });
});

describe('customXml.parts write-side', () => {
  it('create makes a part discoverable via list and get', async () => {
    const editor = await createEditorWithEmptyPackage();

    const created = editor.doc.customXml.parts.create({
      content: '<refs xmlns="urn:test:1"><ref id="x"/></refs>',
      schemaRefs: ['urn:test:1'],
    });
    expect(created.success).toBe(true);
    if (!created.success) return;
    expect(created.id).toMatch(/^\{[0-9A-F-]+\}$/);
    expect(created.partName).toBe('customXml/item1.xml');
    expect(created.propsPartName).toBe('customXml/itemProps1.xml');

    const list = editor.doc.customXml.parts.list();
    expect(list.items.length).toBe(1);
    const summary = list.items[0]!;
    expect(summary.id).toBe(created.id);
    expect(summary.rootNamespace).toBe('urn:test:1');
    expect(summary.schemaRefs).toEqual(['urn:test:1']);

    const info = editor.doc.customXml.parts.get({ target: { id: created.id } });
    expect(info).not.toBeNull();
    expect(info!.content).toContain('<refs');
    expect(info!.content).toContain('xmlns="urn:test:1"');

    editor.destroy();
  });

  it('create allocates non-colliding indexes when called multiple times', async () => {
    const editor = await createEditorWithEmptyPackage();
    const a = editor.doc.customXml.parts.create({ content: '<a xmlns="urn:a"/>' });
    const b = editor.doc.customXml.parts.create({ content: '<b xmlns="urn:b"/>' });
    expect(a.success && b.success).toBe(true);
    if (!a.success || !b.success) return;
    expect(a.partName).toBe('customXml/item1.xml');
    expect(b.partName).toBe('customXml/item2.xml');
    expect(a.id).not.toBe(b.id);
    expect(editor.doc.customXml.parts.list().items.length).toBe(2);
    editor.destroy();
  });

  it('create wires up the document-level relationship', async () => {
    const editor = await createEditorWithEmptyPackage();
    const created = editor.doc.customXml.parts.create({ content: '<a xmlns="urn:a"/>' });
    expect(created.success).toBe(true);

    const converted = (editor as unknown as { converter: { convertedXml: Record<string, unknown> } }).converter
      .convertedXml;
    const relsDoc = converted['word/_rels/document.xml.rels'] as { elements?: Array<{ elements?: Array<{ attributes?: Record<string, string> }> }> } | undefined;
    const relsRoot = relsDoc?.elements?.[0];
    const customXmlRels = (relsRoot?.elements ?? []).filter(
      (rel) =>
        rel?.attributes?.Type ===
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml',
    );
    expect(customXmlRels.length).toBe(1);
    expect(customXmlRels[0]!.attributes?.Target).toBe('../customXml/item1.xml');

    editor.destroy();
  });

  it('patch updates content while preserving itemID', async () => {
    const editor = await createEditorWithEmptyPackage();
    const created = editor.doc.customXml.parts.create({
      content: '<a xmlns="urn:a">one</a>',
      schemaRefs: ['urn:a'],
    });
    expect(created.success).toBe(true);
    if (!created.success) return;

    const patched = editor.doc.customXml.parts.patch({
      target: { id: created.id },
      content: '<a xmlns="urn:a">two</a>',
    });
    expect(patched.success).toBe(true);

    const info = editor.doc.customXml.parts.get({ target: { id: created.id } });
    expect(info!.id).toBe(created.id);
    expect(info!.content).toContain('>two<');
    expect(info!.content).not.toContain('>one<');
    expect(info!.schemaRefs).toEqual(['urn:a']); // preserved
    editor.destroy();
  });

  it('patch can update schemaRefs alone', async () => {
    const editor = await createEditorWithEmptyPackage();
    const created = editor.doc.customXml.parts.create({
      content: '<a xmlns="urn:a"/>',
      schemaRefs: ['urn:a'],
    });
    if (!created.success) return;

    const patched = editor.doc.customXml.parts.patch({
      target: { id: created.id },
      schemaRefs: ['urn:a', 'urn:b'],
    });
    expect(patched.success).toBe(true);

    const info = editor.doc.customXml.parts.get({ target: { id: created.id } });
    expect(info!.schemaRefs).toEqual(['urn:a', 'urn:b']);
    editor.destroy();
  });

  it('patch returns TARGET_NOT_FOUND for unknown id', async () => {
    const editor = await createEditorWithEmptyPackage();
    const result = editor.doc.customXml.parts.patch({
      target: { id: '{NOPE}' },
      content: '<a xmlns="urn:a"/>',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failure.code).toBe('TARGET_NOT_FOUND');
    }
    editor.destroy();
  });

  it('remove deletes the part and its linked package files', async () => {
    const editor = await createEditorWithEmptyPackage();
    const created = editor.doc.customXml.parts.create({ content: '<a xmlns="urn:a"/>' });
    if (!created.success) return;

    const removed = editor.doc.customXml.parts.remove({ target: { id: created.id } });
    expect(removed.success).toBe(true);

    expect(editor.doc.customXml.parts.list().items).toEqual([]);

    const converted = (editor as unknown as { converter: { convertedXml: Record<string, unknown> } }).converter
      .convertedXml;
    expect(converted['customXml/item1.xml']).toBeUndefined();
    expect(converted['customXml/itemProps1.xml']).toBeUndefined();
    expect(converted['customXml/_rels/item1.xml.rels']).toBeUndefined();

    const relsDoc = converted['word/_rels/document.xml.rels'] as { elements?: Array<{ elements?: Array<{ attributes?: Record<string, string> }> }> } | undefined;
    const relsRoot = relsDoc?.elements?.[0];
    const lingering = (relsRoot?.elements ?? []).filter(
      (rel) =>
        rel?.attributes?.Type ===
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml',
    );
    expect(lingering).toEqual([]);

    editor.destroy();
  });

  it('remove returns TARGET_NOT_FOUND for unknown id', async () => {
    const editor = await createEditorWithEmptyPackage();
    const result = editor.doc.customXml.parts.remove({ target: { id: '{NOPE}' } });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failure.code).toBe('TARGET_NOT_FOUND');
    }
    editor.destroy();
  });

  it('round-trip: create → export → reimport preserves id, content, schemaRefs', async () => {
    const editor = await createEditorWithEmptyPackage();
    const created = editor.doc.customXml.parts.create({
      content: '<refs xmlns="urn:round-trip:1"><ref id="a"/><ref id="b"/></refs>',
      schemaRefs: ['urn:round-trip:1', 'urn:round-trip:audit'],
    });
    if (!created.success) return;
    const originalId = created.id;

    const buf = (await editor.exportDocx()) as Buffer | Uint8Array;
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    editor.destroy();

    // Reimport from the exported bytes through the canonical loader.
    const [reloadedDocx, reloadedMedia, reloadedMediaFiles, reloadedFonts] = await Editor.loadXmlData(
      bytes,
      true,
    );
    const { editor: reloaded } = initTestEditor({
      content: reloadedDocx,
      media: reloadedMedia,
      mediaFiles: reloadedMediaFiles,
      fonts: reloadedFonts,
      useImmediateSetTimeout: false,
      isHeadless: true,
      user: { name: 'Test', email: 'test@example.com' },
    });

    const list = reloaded.doc.customXml.parts.list();
    expect(list.items.length).toBe(1);
    const summary = list.items[0]!;
    expect(summary.id).toBe(originalId);
    expect(summary.rootNamespace).toBe('urn:round-trip:1');
    expect(summary.schemaRefs).toEqual(['urn:round-trip:1', 'urn:round-trip:audit']);

    const info = reloaded.doc.customXml.parts.get({ target: { id: originalId } });
    expect(info!.content).toContain('<ref');
    expect(info!.content).toContain('id="a"');
    expect(info!.content).toContain('id="b"');

    reloaded.destroy();
  });
});
