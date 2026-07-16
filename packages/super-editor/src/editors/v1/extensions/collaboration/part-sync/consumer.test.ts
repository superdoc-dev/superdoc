import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import {
  createPartConsumer,
  isApplyingRemotePartChanges,
  isCustomXmlPartPath,
  isCustomXmlTombstonePath,
} from './consumer.js';
import { encodeEnvelopeToYjs } from './json-crdt.js';
import { PARTS_MAP_KEY } from './constants.js';
import { registerPartDescriptor, clearPartDescriptors } from '../../../core/parts/registry/part-registry.js';
import { clearInvalidationHandlers } from '../../../core/parts/invalidation/part-invalidation-registry.js';

const CUSTOM_XML_PROPS_RELATIONSHIP_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEditor() {
  const convertedXml: Record<string, unknown> = {};

  return {
    options: { user: { name: 'test' } },
    converter: {
      convertedXml,
      documentModified: false,
      documentGuid: null,
      promoteToGuid: () => 'test-guid',
    },
    state: { tr: { setMeta: vi.fn() } },
    view: undefined,
    safeEmit: vi.fn().mockReturnValue([]),
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as import('../../../core/Editor.js').Editor;
}

function writeRemoteEnvelope(localDoc: Y.Doc, partId: string, data: unknown, v = 1) {
  // Create a remote doc and sync to simulate remote write
  const remoteDoc = new Y.Doc();
  Y.applyUpdate(remoteDoc, Y.encodeStateAsUpdate(localDoc));

  const remotePartsMap = remoteDoc.getMap(PARTS_MAP_KEY);
  const envelope = encodeEnvelopeToYjs({ v, clientId: remoteDoc.clientID, data });
  remotePartsMap.set(partId, envelope);

  // Sync back
  Y.applyUpdate(localDoc, Y.encodeStateAsUpdate(remoteDoc));
  remoteDoc.destroy();
}

function deleteRemoteParts(localDoc: Y.Doc, partIds: string[]) {
  const remoteDoc = new Y.Doc();
  Y.applyUpdate(remoteDoc, Y.encodeStateAsUpdate(localDoc));

  const remotePartsMap = remoteDoc.getMap(PARTS_MAP_KEY);
  remoteDoc.transact(() => {
    for (const partId of partIds) {
      remotePartsMap.delete(partId);
    }
  });

  Y.applyUpdate(localDoc, Y.encodeStateAsUpdate(remoteDoc));
  remoteDoc.destroy();
}

function getMockConverter(editor: import('../../../core/Editor.js').Editor): {
  convertedXml: Record<string, unknown>;
  removedCustomXmlPaths?: Set<string>;
} {
  return (
    editor as unknown as {
      converter: {
        convertedXml: Record<string, unknown>;
        removedCustomXmlPaths?: Set<string>;
      };
    }
  ).converter;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PartConsumer', () => {
  let ydoc: Y.Doc;

  beforeEach(() => {
    ydoc = new Y.Doc();
  });

  afterEach(() => {
    ydoc.destroy();
    clearPartDescriptors();
    clearInvalidationHandlers();
  });

  it('applies remote create to local state', () => {
    const editor = createMockEditor();
    const consumer = createPartConsumer(editor, ydoc);

    writeRemoteEnvelope(ydoc, 'word/settings.xml', {
      type: 'element',
      name: 'document',
      elements: [{ type: 'element', name: 'w:settings', elements: [] }],
    });

    expect(editor.converter.convertedXml['word/settings.xml']).toBeDefined();

    consumer.destroy();
  });

  it('applies remote mutate to local state', () => {
    const editor = createMockEditor();
    // Pre-populate the part
    editor.converter.convertedXml['word/settings.xml'] = {
      type: 'element',
      name: 'document',
      elements: [{ type: 'element', name: 'w:settings', elements: [] }],
    };

    const consumer = createPartConsumer(editor, ydoc);

    writeRemoteEnvelope(ydoc, 'word/settings.xml', {
      type: 'element',
      name: 'document',
      elements: [{ type: 'element', name: 'w:settings', elements: [{ name: 'new' }] }],
    });

    const part = editor.converter.convertedXml['word/settings.xml'] as Record<string, unknown>;
    const elements = (part.elements as Array<{ elements?: unknown[] }>)?.[0]?.elements;
    expect(elements).toHaveLength(1);

    consumer.destroy();
  });

  it('skips word/document.xml', () => {
    const editor = createMockEditor();
    const consumer = createPartConsumer(editor, ydoc);

    writeRemoteEnvelope(ydoc, 'word/document.xml', { some: 'data' });

    expect(editor.converter.convertedXml['word/document.xml']).toBeUndefined();

    consumer.destroy();
  });

  it('skips invalid envelopes', () => {
    const editor = createMockEditor();
    const consumer = createPartConsumer(editor, ydoc);

    // Write a non-envelope value
    const remoteDoc = new Y.Doc();
    Y.applyUpdate(remoteDoc, Y.encodeStateAsUpdate(ydoc));
    const partsMap = remoteDoc.getMap(PARTS_MAP_KEY);
    const yMap = new Y.Map<unknown>();
    yMap.set('invalid', true);
    partsMap.set('word/settings.xml', yMap);
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(remoteDoc));
    remoteDoc.destroy();

    expect(editor.converter.convertedXml['word/settings.xml']).toBeUndefined();

    consumer.destroy();
  });

  it('isApplyingRemotePartChanges is false by default', () => {
    expect(isApplyingRemotePartChanges()).toBe(false);
  });

  it('cleans up observer on destroy', () => {
    const editor = createMockEditor();
    const consumer = createPartConsumer(editor, ydoc);
    consumer.destroy();

    // Writing after destroy should not trigger any apply
    writeRemoteEnvelope(ydoc, 'word/settings.xml', { some: 'data' });
    expect(editor.converter.convertedXml['word/settings.xml']).toBeUndefined();
  });

  it('skips retry for same (v, clientId) that failed', () => {
    const editor = createMockEditor();
    // Cause a failure: part already exists for create operation
    editor.converter.convertedXml['word/numbering.xml'] = { broken: true };

    const consumer = createPartConsumer(editor, ydoc);

    // First remote write — this will attempt mutate (since part exists)
    writeRemoteEnvelope(ydoc, 'word/numbering.xml', null as unknown, 1);

    // The part should remain as-is (null data is invalid)
    consumer.destroy();
  });

  it('marks remote customXml deletes as converter tombstones', () => {
    const editor = createMockEditor();
    const converter = getMockConverter(editor);
    const customXmlPaths = [
      'customXml/item1.xml',
      'customXml/itemProps1.xml',
      'customXml/itemPropsFOREIGN.xml',
      'customXml/_rels/item1.xml.rels',
    ];
    const itemRelsPart = {
      elements: [
        {
          name: 'Relationships',
          elements: [
            {
              name: 'Relationship',
              attributes: {
                Type: CUSTOM_XML_PROPS_RELATIONSHIP_TYPE,
                Target: './itemPropsFOREIGN.xml',
              },
            },
          ],
        },
      ],
    };

    for (const path of customXmlPaths) {
      const data = path.endsWith('.rels') ? itemRelsPart : { elements: [] };
      converter.convertedXml[path] = data;
      writeRemoteEnvelope(ydoc, path, data);
    }

    const consumer = createPartConsumer(editor, ydoc);
    deleteRemoteParts(ydoc, customXmlPaths);

    for (const path of customXmlPaths) {
      expect(converter.convertedXml[path]).toBeUndefined();
      expect(converter.removedCustomXmlPaths?.has(path)).toBe(true);
    }

    consumer.destroy();
  });

  it('clears converter.bibliographyPart when the deleted part is the bibliography storage part', () => {
    const editor = createMockEditor();
    const converter = getMockConverter(editor) as ReturnType<typeof getMockConverter> & {
      bibliographyPart?: { partPath: string | null } | null;
    };

    const bibliographyPartPath = 'customXml/item1.xml';
    const customXmlPaths = [bibliographyPartPath, 'customXml/itemProps1.xml', 'customXml/_rels/item1.xml.rels'];

    // Stub the bibliography cache the way the exporter would leave it after
    // import: it points at the storage part that a peer is about to delete.
    converter.bibliographyPart = { partPath: bibliographyPartPath };

    for (const path of customXmlPaths) {
      converter.convertedXml[path] = { elements: [] };
      writeRemoteEnvelope(ydoc, path, { elements: [] });
    }

    const consumer = createPartConsumer(editor, ydoc);
    deleteRemoteParts(ydoc, customXmlPaths);

    // Tombstones recorded for every removed path…
    for (const path of customXmlPaths) {
      expect(converter.removedCustomXmlPaths?.has(path)).toBe(true);
    }
    // …and the bibliography cache no longer points at the deleted part, so
    // syncBibliographyPartToPackage cannot resurrect it on the next export.
    expect(converter.bibliographyPart?.partPath).toBeNull();

    consumer.destroy();
  });

  it('invalidates the bibliography cache when a remote write targets the cached storage part', () => {
    const editor = createMockEditor();
    const converter = getMockConverter(editor) as ReturnType<typeof getMockConverter> & {
      bibliographyPart?: { partPath: string | null } | null;
    };

    const bibliographyPartPath = 'customXml/item1.xml';
    // Cache points at the storage part a collaborator is about to overwrite.
    converter.bibliographyPart = { partPath: bibliographyPartPath };

    const consumer = createPartConsumer(editor, ydoc);

    // Remote collaborator creates/updates the very part the cache references.
    writeRemoteEnvelope(ydoc, bibliographyPartPath, { type: 'element', name: 'root', elements: [] });

    // The written content must be applied locally…
    expect(converter.convertedXml[bibliographyPartPath]).toBeDefined();
    // …and the stale bibliography cache must be invalidated so the next export
    // rebuilds from the received content instead of overwriting it.
    expect(converter.bibliographyPart?.partPath).toBeNull();

    consumer.destroy();
  });

  it('custom-XML path predicates agree on canonical-but-uppercased part names', () => {
    const path = 'CustomXML/item1.xml';
    expect(isCustomXmlPartPath(path)).toBe(isCustomXmlTombstonePath({} as never, path));
    expect(isCustomXmlPartPath(path)).toBe(true);
  });

  it('marks remote customXml deletes as tombstones when the local part is already absent', () => {
    const editor = createMockEditor();
    const converter = getMockConverter(editor);
    const customXmlPaths = ['customXml/item1.xml', 'customXml/itemProps1.xml', 'customXml/_rels/item1.xml.rels'];

    for (const path of customXmlPaths) {
      writeRemoteEnvelope(ydoc, path, { elements: [] });
    }

    const consumer = createPartConsumer(editor, ydoc);
    deleteRemoteParts(ydoc, customXmlPaths);

    expect(Object.keys(converter.convertedXml)).toEqual([]);
    for (const path of customXmlPaths) {
      expect(converter.removedCustomXmlPaths?.has(path)).toBe(true);
    }

    consumer.destroy();
  });
});
