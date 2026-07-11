import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness.js';
import { initTestEditor } from '../../../tests/helpers/helpers.js';
import { PARTS_MAP_KEY } from './constants.js';
import { decodeYjsToEnvelope } from './json-crdt.js';
import type { Editor } from '../../../core/Editor.js';

const HOST_TEXT = 'Alpha metadata target.';
const METADATA_ID = 'meta-sync-1';
const METADATA_NAMESPACE = 'urn:test:metadata-sync';
const CUSTOM_XML_PATHS = [
  'customXml/item1.xml',
  'customXml/itemProps1.xml',
  'customXml/_rels/item1.xml.rels',
  'word/_rels/document.xml.rels',
] as const;

type TestProvider = {
  synced: boolean;
  isSynced: boolean;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  awareness: Awareness;
};

type EditorWithConverter = Editor & {
  converter: {
    convertedXml: Record<string, unknown>;
  };
};

function createProviderStub(ydoc: Y.Doc): TestProvider {
  return {
    synced: true,
    isSynced: true,
    on: vi.fn(),
    off: vi.fn(),
    disconnect: vi.fn(),
    awareness: new Awareness(ydoc),
  };
}

function schemaDoc(text: string) {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { paraId: 'p1' },
        content: [
          {
            type: 'run',
            attrs: {},
            content: [{ type: 'text', text }],
          },
        ],
      },
    ],
  };
}

function createCollaborativeEditor(ydoc: Y.Doc): Editor {
  return initTestEditor({
    loadFromSchema: true,
    content: schemaDoc(HOST_TEXT),
    isHeadless: true,
    ydoc,
    collaborationProvider: createProviderStub(ydoc),
    useImmediateSetTimeout: false,
    user: { name: 'Test', email: 'test@example.com' },
  }).editor as Editor;
}

function getConvertedXml(editor: Editor): Record<string, unknown> {
  return (editor as EditorWithConverter).converter.convertedXml;
}

function getPartsMap(ydoc: Y.Doc): Y.Map<unknown> {
  return ydoc.getMap(PARTS_MAP_KEY) as Y.Map<unknown>;
}

function syncYDocs(source: Y.Doc, target: Y.Doc): void {
  Y.applyUpdate(target, Y.encodeStateAsUpdate(source));
}

function partData(ydoc: Y.Doc, path: string): unknown {
  return decodeYjsToEnvelope(getPartsMap(ydoc).get(path))?.data;
}

function trackPartsUpdateTransactions(ydoc: Y.Doc): { count: () => number; destroy: () => void } {
  let count = 0;
  const handler = (transaction: Y.Transaction) => {
    const origin = transaction.origin as { event?: unknown } | null;
    if (origin?.event === 'parts-update') count += 1;
  };
  ydoc.on('afterTransaction', handler);
  return {
    count: () => count,
    destroy: () => ydoc.off('afterTransaction', handler),
  };
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

function relationshipTargets(relsPart: unknown): string[] {
  const doc = relsPart as
    | {
        elements?: Array<{
          name?: string;
          elements?: Array<{ attributes?: Record<string, string> }>;
        }>;
      }
    | undefined;
  const root = doc?.elements?.find((element) => element.name === 'Relationships');
  return (root?.elements ?? [])
    .map((relationship) => relationship.attributes?.Target)
    .filter((target): target is string => typeof target === 'string');
}

async function waitForPart(editor: Editor, path: string): Promise<void> {
  await vi.waitFor(() => {
    expect(getConvertedXml(editor)[path]).toBeDefined();
  });
}

describe('custom XML writes through Yjs part-sync', () => {
  it('syncs anchored metadata payload parts after part-sync is active', async () => {
    const ydocA = new Y.Doc();
    const ydocB = new Y.Doc();
    const editorA = createCollaborativeEditor(ydocA);
    const editorB = createCollaborativeEditor(ydocB);
    const partsUpdateTracker = trackPartsUpdateTransactions(ydocA);

    try {
      await vi.waitFor(() => {
        expect((editorA as unknown as { _partPublisher?: unknown })._partPublisher).toBeDefined();
        expect((editorB as unknown as { _partPublisher?: unknown })._partPublisher).toBeDefined();
      });

      const inserted = await Promise.resolve(editorA.doc.insert({ value: HOST_TEXT }));
      const blockId = resolveBlockId(inserted);
      const start = HOST_TEXT.indexOf('metadata');
      const end = start + 'metadata'.length;

      const attached = editorA.doc.metadata.attach({
        id: METADATA_ID,
        namespace: METADATA_NAMESPACE,
        payload: { label: 'Alpha' },
        target: {
          kind: 'selection',
          start: { kind: 'text', blockId, offset: start },
          end: { kind: 'text', blockId, offset: end },
        },
      });
      expect(attached.success).toBe(true);
      expect(partsUpdateTracker.count()).toBe(1);

      for (const path of CUSTOM_XML_PATHS) {
        expect(getPartsMap(ydocA).has(path)).toBe(true);
      }
      expect(relationshipTargets(partData(ydocA, 'word/_rels/document.xml.rels'))).toContain('../customXml/item1.xml');

      syncYDocs(ydocA, ydocB);

      for (const path of CUSTOM_XML_PATHS) {
        await waitForPart(editorB, path);
      }
      expect(relationshipTargets(getConvertedXml(editorB)['word/_rels/document.xml.rels'])).toContain(
        '../customXml/item1.xml',
      );

      await vi.waitFor(() => {
        expect(editorB.doc.metadata.get({ id: METADATA_ID })?.payload).toEqual({ label: 'Alpha' });
      });
      expect(editorB.doc.metadata.list({ namespace: METADATA_NAMESPACE }).items).toEqual([
        expect.objectContaining({
          id: METADATA_ID,
          namespace: METADATA_NAMESPACE,
          partName: 'customXml/item1.xml',
        }),
      ]);

      const updated = editorA.doc.metadata.update({
        id: METADATA_ID,
        payload: { label: 'Beta' },
      });
      expect(updated.success).toBe(true);
      expect(partsUpdateTracker.count()).toBe(2);

      syncYDocs(ydocA, ydocB);
      await vi.waitFor(() => {
        expect(editorB.doc.metadata.get({ id: METADATA_ID })?.payload).toEqual({ label: 'Beta' });
      });

      const removed = editorA.doc.metadata.remove({ id: METADATA_ID });
      expect(removed.success).toBe(true);
      expect(partsUpdateTracker.count()).toBe(3);

      expect(getPartsMap(ydocA).has('customXml/item1.xml')).toBe(false);
      expect(getPartsMap(ydocA).has('customXml/itemProps1.xml')).toBe(false);
      expect(getPartsMap(ydocA).has('customXml/_rels/item1.xml.rels')).toBe(false);
      expect(relationshipTargets(partData(ydocA, 'word/_rels/document.xml.rels'))).not.toContain(
        '../customXml/item1.xml',
      );

      syncYDocs(ydocA, ydocB);
      await vi.waitFor(() => {
        expect(getConvertedXml(editorB)['customXml/item1.xml']).toBeUndefined();
        expect(getConvertedXml(editorB)['customXml/itemProps1.xml']).toBeUndefined();
        expect(getConvertedXml(editorB)['customXml/_rels/item1.xml.rels']).toBeUndefined();
      });
      expect(relationshipTargets(getConvertedXml(editorB)['word/_rels/document.xml.rels'])).not.toContain(
        '../customXml/item1.xml',
      );
      expect(editorB.doc.metadata.list({ namespace: METADATA_NAMESPACE }).items).toEqual([]);
    } finally {
      partsUpdateTracker.destroy();
      editorA.destroy();
      editorB.destroy();
      ydocA.destroy();
      ydocB.destroy();
    }
  });

  it('syncs customXml.parts create, patch, and remove as complete package deltas', async () => {
    const ydocA = new Y.Doc();
    const ydocB = new Y.Doc();
    const editorA = createCollaborativeEditor(ydocA);
    const editorB = createCollaborativeEditor(ydocB);
    const partsUpdateTracker = trackPartsUpdateTransactions(ydocA);

    try {
      await vi.waitFor(() => {
        expect((editorA as unknown as { _partPublisher?: unknown })._partPublisher).toBeDefined();
        expect((editorB as unknown as { _partPublisher?: unknown })._partPublisher).toBeDefined();
      });

      const created = editorA.doc.customXml.parts.create({
        content: '<refs xmlns="urn:test:custom-sync"><ref id="a">one</ref></refs>',
        schemaRefs: ['urn:test:custom-sync'],
      });
      expect(created.success).toBe(true);
      if (!created.success) return;
      expect(partsUpdateTracker.count()).toBe(1);

      for (const path of CUSTOM_XML_PATHS) {
        expect(getPartsMap(ydocA).has(path)).toBe(true);
      }
      expect(relationshipTargets(partData(ydocA, 'word/_rels/document.xml.rels'))).toContain('../customXml/item1.xml');

      syncYDocs(ydocA, ydocB);
      for (const path of CUSTOM_XML_PATHS) {
        await waitForPart(editorB, path);
      }

      await vi.waitFor(() => {
        expect(editorB.doc.customXml.parts.get({ target: { id: created.id } })?.content).toContain('>one<');
      });

      const patched = editorA.doc.customXml.parts.patch({
        target: { id: created.id },
        content: '<refs xmlns="urn:test:custom-sync"><ref id="a">two</ref></refs>',
        schemaRefs: ['urn:test:custom-sync', 'urn:test:custom-sync:patched'],
      });
      expect(patched.success).toBe(true);
      expect(partsUpdateTracker.count()).toBe(2);

      syncYDocs(ydocA, ydocB);
      await vi.waitFor(() => {
        const info = editorB.doc.customXml.parts.get({ target: { id: created.id } });
        expect(info?.content).toContain('>two<');
        expect(info?.schemaRefs).toEqual(['urn:test:custom-sync', 'urn:test:custom-sync:patched']);
      });

      const removed = editorA.doc.customXml.parts.remove({ target: { id: created.id } });
      expect(removed.success).toBe(true);
      expect(partsUpdateTracker.count()).toBe(3);

      expect(getPartsMap(ydocA).has('customXml/item1.xml')).toBe(false);
      expect(getPartsMap(ydocA).has('customXml/itemProps1.xml')).toBe(false);
      expect(getPartsMap(ydocA).has('customXml/_rels/item1.xml.rels')).toBe(false);
      expect(relationshipTargets(partData(ydocA, 'word/_rels/document.xml.rels'))).not.toContain(
        '../customXml/item1.xml',
      );

      syncYDocs(ydocA, ydocB);
      await vi.waitFor(() => {
        expect(getConvertedXml(editorB)['customXml/item1.xml']).toBeUndefined();
        expect(getConvertedXml(editorB)['customXml/itemProps1.xml']).toBeUndefined();
        expect(getConvertedXml(editorB)['customXml/_rels/item1.xml.rels']).toBeUndefined();
      });
      expect(relationshipTargets(getConvertedXml(editorB)['word/_rels/document.xml.rels'])).not.toContain(
        '../customXml/item1.xml',
      );
      expect(editorB.doc.customXml.parts.list().items).toEqual([]);
    } finally {
      partsUpdateTracker.destroy();
      editorA.destroy();
      editorB.destroy();
      ydocA.destroy();
      ydocB.destroy();
    }
  });
});
