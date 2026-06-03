/* @vitest-environment jsdom */

/**
 * customXml.parts.* integration tests against a real editor.
 *
 * Read side:
 *   - Empty document: list returns no parts; get returns null.
 *   - Manually injected custom XML parts: list discovers them, get
 *     returns content, filters work.
 *   - Foreign producer cases: partName-only targeting, OPC rels-based
 *     props pairing (including `./` and `../customXml/` Target forms),
 *     and non-customXml partName targets are rejected.
 *
 * Write side:
 *   - create / patch / remove round-trip through export and reimport.
 *   - Tombstone semantics for parts that originated in the imported zip.
 *   - Remove → create index recycling.
 *   - Bibliography part cache invalidation.
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

  it('resolves rels Target with ./ prefix (valid OPC relative path)', async () => {
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
                // VALID OPC: "./itemPropsFOREIGN.xml" is sibling relative.
                Target: './itemPropsFOREIGN.xml',
              },
            },
          ],
        },
      ],
    };
    const list = editor.doc.customXml.parts.list();
    expect(list.items.length).toBe(1);
    expect(list.items[0]!.propsPartName).toBe('customXml/itemPropsFOREIGN.xml');
    editor.destroy();
  });

  it('resolves rels Target with ../customXml/ prefix (valid OPC relative path)', async () => {
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
                // VALID OPC: "../customXml/itemPropsFOREIGN.xml" is also acceptable.
                Target: '../customXml/itemPropsFOREIGN.xml',
              },
            },
          ],
        },
      ],
    };
    const list = editor.doc.customXml.parts.list();
    expect(list.items.length).toBe(1);
    expect(list.items[0]!.propsPartName).toBe('customXml/itemPropsFOREIGN.xml');
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
    const relsDoc = converted['word/_rels/document.xml.rels'] as
      | { elements?: Array<{ elements?: Array<{ attributes?: Record<string, string> }> }> }
      | undefined;
    const relsRoot = relsDoc?.elements?.[0];
    const customXmlRels = (relsRoot?.elements ?? []).filter(
      (rel) =>
        rel?.attributes?.Type === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml',
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

    const relsDoc = converted['word/_rels/document.xml.rels'] as
      | { elements?: Array<{ elements?: Array<{ attributes?: Record<string, string> }> }> }
      | undefined;
    const relsRoot = relsDoc?.elements?.[0];
    const lingering = (relsRoot?.elements ?? []).filter(
      (rel) =>
        rel?.attributes?.Type === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml',
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

  it('remove → create on the same index does not tombstone the new part on export', async () => {
    // Reproduces the collision: a foreign DOCX has item1.xml, the
    // customer removes it (which records a tombstone), then creates a
    // fresh part. nextCustomXmlItemIndex returns 1 (recycling), and
    // without the tombstone-clear the exporter would null the new
    // part. With the clear, the new part survives export+reimport.

    // Seed: simulate a foreign DOCX with item1.xml already present
    // by creating and round-tripping through export+reimport.
    let editor = await createEditorWithEmptyPackage();
    const seeded = editor.doc.customXml.parts.create({
      content: '<old xmlns="urn:original"/>',
    });
    expect(seeded.success).toBe(true);

    const seededBytes = (await editor.exportDocx()) as Buffer | Uint8Array;
    const seededBuf = seededBytes instanceof Uint8Array ? seededBytes : new Uint8Array(seededBytes);
    editor.destroy();

    const [docx0, media0, mf0, fonts0] = await Editor.loadXmlData(seededBuf, true);
    ({ editor } = initTestEditor({
      content: docx0,
      media: media0,
      mediaFiles: mf0,
      fonts: fonts0,
      useImmediateSetTimeout: false,
      isHeadless: true,
      user: { name: 'Test', email: 'test@example.com' },
    }));

    // Confirm the seed survived.
    const beforeRemoveList = editor.doc.customXml.parts.list();
    expect(beforeRemoveList.items.length).toBe(1);
    const originalId = beforeRemoveList.items[0]!.id!;

    // Remove the original, then create a new part. Without the
    // tombstone-clear, the new part lands on customXml/item1.xml and the
    // exporter nulls it out.
    const removed = editor.doc.customXml.parts.remove({ target: { id: originalId } });
    expect(removed.success).toBe(true);
    const created = editor.doc.customXml.parts.create({ content: '<fresh xmlns="urn:fresh"/>' });
    expect(created.success).toBe(true);
    if (!created.success) return;
    expect(created.partName).toBe('customXml/item1.xml');

    // Export + reimport. The new part must survive.
    const finalBytes = (await editor.exportDocx()) as Buffer | Uint8Array;
    const finalBuf = finalBytes instanceof Uint8Array ? finalBytes : new Uint8Array(finalBytes);
    editor.destroy();

    const [docx1, media1, mf1, fonts1] = await Editor.loadXmlData(finalBuf, true);
    const { editor: reloaded } = initTestEditor({
      content: docx1,
      media: media1,
      mediaFiles: mf1,
      fonts: fonts1,
      useImmediateSetTimeout: false,
      isHeadless: true,
      user: { name: 'Test', email: 'test@example.com' },
    });

    const finalList = reloaded.doc.customXml.parts.list();
    expect(finalList.items.length).toBe(1);
    expect(finalList.items[0]!.id).toBe(created.id);
    const finalGet = reloaded.doc.customXml.parts.get({ target: { id: created.id } });
    expect(finalGet!.content).toContain('<fresh');
    expect(finalGet!.content).not.toContain('<old');

    reloaded.destroy();
  });

  it('omits <ds:schemaRefs> when create is called without schemaRefs (ECMA-376 §22.5.2.3)', async () => {
    // Per spec: schemaRefs omitted = app may infer schemas; schemaRefs
    // present + empty = explicit "no schemas". These are different.
    const editor = await createEditorWithEmptyPackage();
    const created = editor.doc.customXml.parts.create({ content: '<a xmlns="urn:a"/>' });
    if (!created.success) return;

    const converted = (editor as unknown as { converter: { convertedXml: Record<string, unknown> } }).converter
      .convertedXml;
    const propsDoc = converted[created.propsPartName] as
      | { elements?: Array<{ name: string; elements?: Array<{ name: string }> }> }
      | undefined;
    const root = propsDoc?.elements?.[0];
    const schemaRefsEl = (root?.elements ?? []).find((el) => el?.name === 'ds:schemaRefs');
    expect(schemaRefsEl, 'omitted schemaRefs should not produce a <ds:schemaRefs/> element').toBeUndefined();
    editor.destroy();
  });

  it('emits an empty <ds:schemaRefs/> when create is called with schemaRefs: []', async () => {
    const editor = await createEditorWithEmptyPackage();
    const created = editor.doc.customXml.parts.create({
      content: '<a xmlns="urn:a"/>',
      schemaRefs: [],
    });
    if (!created.success) return;

    const converted = (editor as unknown as { converter: { convertedXml: Record<string, unknown> } }).converter
      .convertedXml;
    const propsDoc = converted[created.propsPartName] as
      | { elements?: Array<{ name: string; elements?: Array<{ name: string }> }> }
      | undefined;
    const root = propsDoc?.elements?.[0];
    const schemaRefsEl = (root?.elements ?? []).find((el) => el?.name === 'ds:schemaRefs');
    expect(schemaRefsEl, 'empty array should produce an explicit <ds:schemaRefs/> element').toBeDefined();
    expect(schemaRefsEl?.elements ?? []).toEqual([]);
    editor.destroy();
  });

  it('surfaces the fresh itemID when patch creates a Properties Part on a foreign Storage Part', async () => {
    // Seed: a Storage Part with no Properties Part (foreign producer
    // case). The caller targets it by partName since there's no id.
    const editor = await createEditorWithEmptyPackage();
    const converted = (editor as unknown as { converter: { convertedXml: Record<string, unknown> } }).converter
      .convertedXml;
    converted[PART_NAME] = makeStorageDoc();
    // No Properties Part exists for PART_NAME.

    // Before patch, get returns the part with no itemID (no Properties Part exists).
    const beforePatch = editor.doc.customXml.parts.get({ target: { partName: PART_NAME } });
    expect(beforePatch).not.toBeNull();
    expect(beforePatch!.id, 'no Properties Part means no itemID').toBeUndefined();

    // Patch schemaRefs — this mints a fresh GUID and writes a new
    // Properties Part. Caller should learn the new id from the result.
    const patched = editor.doc.customXml.parts.patch({
      target: { partName: PART_NAME },
      schemaRefs: ['urn:foreign'],
    });
    expect(patched.success).toBe(true);
    if (!patched.success) return;
    expect(patched.id, 'patch should surface the new itemID').toBeDefined();
    expect(patched.id).toMatch(/^\{[0-9A-F-]+\}$/);

    // Caller can now address the part by id.
    const info = editor.doc.customXml.parts.get({ target: { id: patched.id! } });
    expect(info).not.toBeNull();
    expect(info!.schemaRefs).toEqual(['urn:foreign']);

    editor.destroy();
  });

  it('removing the bibliography part does not resurrect it via syncBibliographyPartToPackage on export', async () => {
    // Seed: simulate a doc with a bibliography custom XML part already
    // loaded. The converter's bibliographyPart cache will hold sources.
    const editor = await createEditorWithEmptyPackage();
    const converter = (
      editor as unknown as { converter: { convertedXml: Record<string, unknown>; bibliographyPart?: unknown } }
    ).converter;
    // Fake a populated bibliographyPart cache pointing at customXml/item1.xml.
    converter.bibliographyPart = {
      sources: [
        {
          tag: 'src1',
          type: 'book',
          fields: { title: 'A Book' },
        },
      ],
      partPath: 'customXml/item1.xml',
      itemPropsPath: 'customXml/itemProps1.xml',
      itemRelsPath: 'customXml/_rels/item1.xml.rels',
      selectedStyle: '/APA.XSL',
      styleName: 'APA',
      version: '6',
    };
    // Pretend the part also exists in convertedXml (it was loaded from a real doc).
    converter.convertedXml['customXml/item1.xml'] = {
      declaration: { attributes: { version: '1.0', encoding: 'UTF-8' } },
      elements: [
        {
          type: 'element',
          name: 'b:Sources',
          attributes: {
            xmlns: 'http://schemas.openxmlformats.org/officeDocument/2006/bibliography',
            'xmlns:b': 'http://schemas.openxmlformats.org/officeDocument/2006/bibliography',
          },
          elements: [],
        },
      ],
    };

    // Locate the part by partName and remove it.
    const removed = editor.doc.customXml.parts.remove({
      target: { partName: 'customXml/item1.xml' },
    });
    expect(removed.success).toBe(true);

    // Without a fix, syncBibliographyPartToPackage will re-create the part
    // when exportDocx runs, because bibliographyPart.sources still has the
    // cached entries.
    await editor.exportDocx();

    // After export, convertedXml should NOT have the part again (or, if
    // it does, that's the staleness bug).
    const partResurrectedInConvertedXml = converter.convertedXml['customXml/item1.xml'] !== undefined;
    expect(
      partResurrectedInConvertedXml,
      'syncBibliographyPartToPackage re-added the removed part to convertedXml',
    ).toBe(false);

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
    const [reloadedDocx, reloadedMedia, reloadedMediaFiles, reloadedFonts] = await Editor.loadXmlData(bytes, true);
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
