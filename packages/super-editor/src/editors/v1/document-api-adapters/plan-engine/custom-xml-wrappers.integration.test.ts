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
});

describe('customXml.parts write-side (stubs)', () => {
  it('create returns CAPABILITY_UNAVAILABLE until Phase B lands', async () => {
    const editor = await createEditorWithEmptyPackage();
    const result = editor.doc.customXml.parts.create({ content: '<a/>' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failure.code).toBe('CAPABILITY_UNAVAILABLE');
    }
    editor.destroy();
  });

  it('patch returns CAPABILITY_UNAVAILABLE', async () => {
    const editor = await createEditorWithEmptyPackage();
    const result = editor.doc.customXml.parts.patch({ target: { id: '{X}' }, content: '<a/>' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failure.code).toBe('CAPABILITY_UNAVAILABLE');
    }
    editor.destroy();
  });

  it('remove returns CAPABILITY_UNAVAILABLE', async () => {
    const editor = await createEditorWithEmptyPackage();
    const result = editor.doc.customXml.parts.remove({ target: { id: '{X}' } });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failure.code).toBe('CAPABILITY_UNAVAILABLE');
    }
    editor.destroy();
  });
});
