import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { bootstrapPartSync } from './bootstrap.js';
import { META_MAP_KEY, META_PARTS_CAPABILITY_KEY, PARTS_MAP_KEY } from './constants.js';
import { encodeEnvelopeToYjs } from './json-crdt.js';
import { clearPartDescriptors, registerPartDescriptor } from '../../../core/parts/registry/part-registry.js';
import { clearInvalidationHandlers } from '../../../core/parts/invalidation/part-invalidation-registry.js';
import { stylesPartDescriptor } from '../../../core/parts/adapters/styles-part-descriptor.js';
import { settingsPartDescriptor } from '../../../core/parts/adapters/settings-part-descriptor.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEditor(opts: Record<string, unknown> = {}) {
  const converter = {
    convertedXml: {} as Record<string, unknown>,
    documentModified: false,
    documentGuid: null,
    promoteToGuid: () => 'test-guid',
    numbering: { abstracts: {}, definitions: {} },
    translatedNumbering: {},
    translatedLinkedStyles: {},
  };

  return {
    options: {
      user: { name: 'test' },
      ...opts,
    },
    converter,
    state: { tr: { setMeta: vi.fn() } },
    view: undefined,
    safeEmit: vi.fn().mockReturnValue([]),
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as import('../../../core/Editor.js').Editor;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('bootstrapPartSync', () => {
  let ydoc: Y.Doc;

  beforeEach(() => {
    ydoc = new Y.Doc();
    registerPartDescriptor(stylesPartDescriptor);
    registerPartDescriptor(settingsPartDescriptor);
  });

  afterEach(() => {
    ydoc.destroy();
    clearPartDescriptors();
    clearInvalidationHandlers();
  });

  it('activates after migration from meta.docx', () => {
    const editor = createMockEditor();
    const metaMap = ydoc.getMap(META_MAP_KEY);
    metaMap.set('docx', [
      {
        name: 'word/styles.xml',
        content: { type: 'element', name: 'doc', elements: [{ type: 'element', name: 'w:styles', elements: [] }] },
      },
    ]);

    const handle = bootstrapPartSync(editor, ydoc);

    expect(handle.publisher).not.toBeNull();
    expect(handle.consumer).not.toBeNull();

    // Verify capability was set
    const capability = metaMap.get(META_PARTS_CAPABILITY_KEY) as Record<string, unknown>;
    expect(capability?.version).toBe(1);

    handle.destroy();
  });

  it('enters degraded mode when migration from meta.docx fails', () => {
    const editor = createMockEditor();
    const metaMap = ydoc.getMap(META_MAP_KEY);
    // meta.docx entry with null content triggers a migration parse error
    metaMap.set('docx', [{ name: 'word/styles.xml', content: null }]);

    const handle = bootstrapPartSync(editor, ydoc);

    // Should return noop — degraded mode, NOT seed from local converter
    expect(handle.publisher).toBeNull();
    expect(handle.consumer).toBeNull();

    // Should NOT have seeded parts from local converter
    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    expect(partsMap.size).toBe(0);

    // Should emit degraded event with migration-failure reason
    expect(editor.safeEmit).toHaveBeenCalledWith(
      'parts:degraded',
      expect.objectContaining({
        reason: 'migration-failure',
      }),
    );

    handle.destroy();
  });

  it('activates when parts already exist (backfill)', () => {
    const editor = createMockEditor();
    const partsMap = ydoc.getMap(PARTS_MAP_KEY);

    // Pre-populate parts without capability marker
    const envelope = encodeEnvelopeToYjs({
      v: 1,
      clientId: 0,
      data: { type: 'element', name: 'doc', elements: [{ type: 'element', name: 'w:settings', elements: [] }] },
    });
    partsMap.set('word/settings.xml', envelope);

    const handle = bootstrapPartSync(editor, ydoc);

    expect(handle.publisher).not.toBeNull();

    // Capability should be backfilled
    const metaMap = ydoc.getMap(META_MAP_KEY);
    const capability = metaMap.get(META_PARTS_CAPABILITY_KEY) as Record<string, unknown>;
    expect(capability?.version).toBe(1);

    handle.destroy();
  });

  it('seeds from local converter when no parts and no meta.docx', () => {
    const editor = createMockEditor();
    // Add a part to the converter so seedPartsFromEditor has something to write
    editor.converter.convertedXml['word/settings.xml'] = {
      type: 'element',
      name: 'doc',
      elements: [{ type: 'element', name: 'w:settings', elements: [] }],
    };

    const handle = bootstrapPartSync(editor, ydoc);

    // Should activate (not noop) after seeding
    expect(handle.publisher).not.toBeNull();
    expect(handle.consumer).not.toBeNull();

    // Parts map should have the seeded part
    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    expect(partsMap.has('word/settings.xml')).toBe(true);

    // Capability should be set
    const metaMap = ydoc.getMap(META_MAP_KEY);
    const capability = metaMap.get(META_PARTS_CAPABILITY_KEY) as Record<string, unknown>;
    expect(capability?.version).toBe(1);

    handle.destroy();
  });

  it('hydrates local state from parts map', () => {
    const editor = createMockEditor();

    // Set up capability and parts
    const metaMap = ydoc.getMap(META_MAP_KEY);
    metaMap.set(META_PARTS_CAPABILITY_KEY, { version: 1, enabledAt: '', clientId: 0 });

    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    const settingsData = {
      type: 'element',
      name: 'document',
      elements: [{ type: 'element', name: 'w:settings', elements: [{ name: 'w:zoom' }] }],
    };
    partsMap.set('word/settings.xml', encodeEnvelopeToYjs({ v: 1, clientId: 0, data: settingsData }));

    const handle = bootstrapPartSync(editor, ydoc);

    // Settings should be hydrated
    expect(editor.converter.convertedXml['word/settings.xml']).toBeDefined();

    handle.destroy();
  });

  it('prunes and tombstones local custom-XML parts absent from an authoritative parts map (late joiner)', () => {
    const editor = createMockEditor();

    // Late joiner loaded the original DOCX: convertedXml holds a custom-XML part
    // (item1) that a peer already deleted, plus one (item2) still shared.
    const survivingData = { type: 'element', name: 'root', elements: [] };
    editor.converter.convertedXml['customXml/item1.xml'] = { type: 'element', name: 'root', elements: [] };
    editor.converter.convertedXml['customXml/itemProps1.xml'] = {
      type: 'element',
      name: 'ds:datastoreItem',
      elements: [],
    };
    editor.converter.convertedXml['customXml/_rels/item1.xml.rels'] = {
      type: 'element',
      name: 'Relationships',
      elements: [],
    };
    editor.converter.convertedXml['customXml/item2.xml'] = survivingData;

    // Authoritative map (capability marker present) carries item2 but NOT item1.
    const metaMap = ydoc.getMap(META_MAP_KEY);
    metaMap.set(META_PARTS_CAPABILITY_KEY, { version: 1, enabledAt: '', clientId: 0 });
    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    partsMap.set('customXml/item2.xml', encodeEnvelopeToYjs({ v: 1, clientId: 0, data: survivingData }));

    const handle = bootstrapPartSync(editor, ydoc);

    // item1 family pruned locally and tombstoned for export.
    expect(editor.converter.convertedXml['customXml/item1.xml']).toBeUndefined();
    expect(editor.converter.convertedXml['customXml/itemProps1.xml']).toBeUndefined();
    expect(editor.converter.convertedXml['customXml/_rels/item1.xml.rels']).toBeUndefined();

    const removed = (editor.converter as unknown as { removedCustomXmlPaths?: Set<string> }).removedCustomXmlPaths;
    expect(removed?.has('customXml/item1.xml')).toBe(true);
    expect(removed?.has('customXml/itemProps1.xml')).toBe(true);
    expect(removed?.has('customXml/_rels/item1.xml.rels')).toBe(true);

    // The part still present in the authoritative map survives.
    expect(editor.converter.convertedXml['customXml/item2.xml']).toBeDefined();
    expect(removed?.has('customXml/item2.xml')).toBeFalsy();

    handle.destroy();
  });

  it('clears stale custom-XML tombstones for parts present in the authoritative parts map', () => {
    const editor = createMockEditor();
    const converter = editor.converter as typeof editor.converter & {
      removedCustomXmlPaths: Set<string>;
    };
    const recreatedItemData = { type: 'element', name: 'recreated-root', elements: [] };
    const recreatedPropsData = {
      type: 'element',
      name: 'ds:datastoreItem',
      elements: [],
    };
    const recreatedRelsData = {
      type: 'element',
      name: 'Relationships',
      elements: [],
    };
    const absentItemData = { type: 'element', name: 'absent-root', elements: [] };
    const staleTombstonePaths = ['customXml/item1.xml', 'customXml/itemProps1.xml', 'customXml/_rels/item1.xml.rels'];

    converter.removedCustomXmlPaths = new Set(staleTombstonePaths);
    converter.convertedXml['customXml/item2.xml'] = absentItemData;

    const metaMap = ydoc.getMap(META_MAP_KEY);
    metaMap.set(META_PARTS_CAPABILITY_KEY, { version: 1, enabledAt: '', clientId: 0 });
    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    partsMap.set('customXml/item1.xml', encodeEnvelopeToYjs({ v: 1, clientId: 0, data: recreatedItemData }));
    partsMap.set('customXml/itemProps1.xml', encodeEnvelopeToYjs({ v: 1, clientId: 0, data: recreatedPropsData }));
    partsMap.set('customXml/_rels/item1.xml.rels', encodeEnvelopeToYjs({ v: 1, clientId: 0, data: recreatedRelsData }));

    const handle = bootstrapPartSync(editor, ydoc);

    expect(converter.convertedXml['customXml/item1.xml']).toEqual(recreatedItemData);
    expect(converter.convertedXml['customXml/itemProps1.xml']).toEqual(recreatedPropsData);
    expect(converter.convertedXml['customXml/_rels/item1.xml.rels']).toEqual(recreatedRelsData);
    for (const path of staleTombstonePaths) {
      expect(converter.removedCustomXmlPaths.has(path)).toBe(false);
    }

    expect(converter.convertedXml['customXml/item2.xml']).toBeUndefined();
    expect(converter.removedCustomXmlPaths.has('customXml/item2.xml')).toBe(true);

    handle.destroy();
  });

  it('keeps stale custom-XML tombstones when an authoritative part fails hydration', () => {
    const editor = createMockEditor();
    const converter = editor.converter as typeof editor.converter & {
      removedCustomXmlPaths: Set<string>;
    };
    const staleLocalData = { type: 'element', name: 'stale-root', elements: [] };
    const hydratedData = { type: 'element', name: 'hydrated-root', elements: [] };

    converter.convertedXml['customXml/item1.xml'] = staleLocalData;
    converter.removedCustomXmlPaths = new Set(['customXml/item1.xml', 'customXml/item2.xml']);

    const metaMap = ydoc.getMap(META_MAP_KEY);
    metaMap.set(META_PARTS_CAPABILITY_KEY, { version: 1, enabledAt: '', clientId: 0 });
    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    partsMap.set('customXml/item1.xml', { v: 'invalid', clientId: 0, data: staleLocalData });
    partsMap.set('customXml/item2.xml', encodeEnvelopeToYjs({ v: 1, clientId: 0, data: hydratedData }));

    const handle = bootstrapPartSync(editor, ydoc);

    expect(converter.convertedXml['customXml/item1.xml']).toEqual(staleLocalData);
    expect(converter.convertedXml['customXml/item2.xml']).toEqual(hydratedData);
    expect(converter.removedCustomXmlPaths.has('customXml/item1.xml')).toBe(true);
    expect(converter.removedCustomXmlPaths.has('customXml/item2.xml')).toBe(false);

    handle.destroy();
  });

  it('invalidates the bibliography cache when hydration receives the cached storage part', () => {
    const editor = createMockEditor();
    const converter = editor.converter as typeof editor.converter & {
      bibliographyPart?: { partPath: string | null } | null;
    };

    const bibliographyPartPath = 'customXml/item1.xml';
    // Local cache points at a storage part the authoritative map has updated.
    converter.bibliographyPart = { partPath: bibliographyPartPath };
    converter.convertedXml[bibliographyPartPath] = { type: 'element', name: 'stale-root', elements: [] };

    const freshData = { type: 'element', name: 'fresh-root', elements: [] };
    const metaMap = ydoc.getMap(META_MAP_KEY);
    metaMap.set(META_PARTS_CAPABILITY_KEY, { version: 1, enabledAt: '', clientId: 0 });
    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    partsMap.set(bibliographyPartPath, encodeEnvelopeToYjs({ v: 1, clientId: 0, data: freshData }));

    const handle = bootstrapPartSync(editor, ydoc);

    // The map's content replaces the local part…
    expect(converter.convertedXml[bibliographyPartPath]).toEqual(freshData);
    // …and the stale cache is invalidated so export cannot resurrect it.
    expect(converter.bibliographyPart?.partPath).toBeNull();

    handle.destroy();
  });

  it('does not tombstone absent custom-XML parts when hydration rolls back', () => {
    const editor = createMockEditor();
    const prunedPartId = 'customXml/item1.xml' as const;
    const survivingPartId = 'customXml/item2.xml' as const;
    const converter = editor.converter as typeof editor.converter & {
      bibliographyPart?: { partPath: string | null } | null;
      removedCustomXmlPaths?: Set<string>;
    };
    const originalSurvivingData = { type: 'element', name: 'local-root', elements: [] };
    const expectedSurvivingData = { type: 'element', name: 'local-root', elements: [] };
    const remoteSurvivingData = { type: 'element', name: 'remote-root', elements: [] };

    converter.convertedXml[prunedPartId] = { type: 'element', name: 'pruned-root', elements: [] };
    converter.convertedXml[survivingPartId] = originalSurvivingData;
    converter.bibliographyPart = { partPath: prunedPartId };

    registerPartDescriptor({
      id: prunedPartId,
      ensurePart() {
        return { type: 'element', name: 'pruned-root', elements: [] };
      },
      onDelete() {
        throw new Error('delete failed');
      },
    });

    const metaMap = ydoc.getMap(META_MAP_KEY);
    metaMap.set(META_PARTS_CAPABILITY_KEY, { version: 1, enabledAt: '', clientId: 0 });
    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    partsMap.set(survivingPartId, encodeEnvelopeToYjs({ v: 1, clientId: 0, data: remoteSurvivingData }));

    const handle = bootstrapPartSync(editor, ydoc);

    expect(handle.publisher).toBeNull();
    expect(converter.convertedXml[prunedPartId]).toBeDefined();
    expect(converter.convertedXml[survivingPartId]).toEqual(expectedSurvivingData);
    expect(converter.removedCustomXmlPaths?.has(prunedPartId)).toBeFalsy();
    expect(converter.bibliographyPart?.partPath).toBe(prunedPartId);

    handle.destroy();
  });

  it('registers partChanged listener and cleans up on destroy', () => {
    const editor = createMockEditor();
    const metaMap = ydoc.getMap(META_MAP_KEY);
    metaMap.set(META_PARTS_CAPABILITY_KEY, { version: 1, enabledAt: '', clientId: 0 });

    const handle = bootstrapPartSync(editor, ydoc);

    expect(editor.on).toHaveBeenCalledWith('partChanged', expect.any(Function));

    handle.destroy();

    expect(editor.off).toHaveBeenCalledWith('partChanged', expect.any(Function));
  });

  it('seeds when fragment has content but only local client has written (first-client)', () => {
    const editor = createMockEditor();
    editor.converter.convertedXml['word/styles.xml'] = {
      type: 'element',
      name: 'doc',
      elements: [{ type: 'element', name: 'w:styles', elements: [] }],
    };

    // Fragment has content from local y-prosemirror push (only our clientID)
    const fragment = ydoc.getXmlFragment('supereditor');
    const el = new Y.XmlElement('paragraph');
    el.insert(0, [new Y.XmlText('loaded content')]);
    fragment.insert(0, [el]);

    const handle = bootstrapPartSync(editor, ydoc);

    // Should activate — no remote state, seeding is safe
    expect(handle.publisher).not.toBeNull();
    expect(handle.consumer).not.toBeNull();

    // Parts should be seeded
    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    expect(partsMap.has('word/styles.xml')).toBe(true);

    handle.destroy();
  });

  it('enters degraded mode when room has remote client state but no parts', () => {
    const editor = createMockEditor();

    // Simulate a legacy room: fragment has content from a REMOTE client
    const remoteDoc = new Y.Doc();
    const remoteFragment = remoteDoc.getXmlFragment('supereditor');
    const el = new Y.XmlElement('paragraph');
    el.insert(0, [new Y.XmlText('shared content')]);
    remoteFragment.insert(0, [el]);

    // Merge remote state into our ydoc so it has another clientID
    const remoteUpdate = Y.encodeStateAsUpdate(remoteDoc);
    Y.applyUpdate(ydoc, remoteUpdate);
    remoteDoc.destroy();

    const handle = bootstrapPartSync(editor, ydoc);

    // Should return noop — remote state present, cannot seed safely
    expect(handle.publisher).toBeNull();
    expect(handle.consumer).toBeNull();

    // Should NOT have seeded parts from local converter
    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    expect(partsMap.size).toBe(0);

    // Should emit degraded event
    expect(editor.safeEmit).toHaveBeenCalledWith(
      'parts:degraded',
      expect.objectContaining({
        reason: 'existing-room-no-parts',
      }),
    );

    handle.destroy();
  });

  it('returns noop and emits degraded event on critical hydration failure', () => {
    const editor = createMockEditor();
    const metaMap = ydoc.getMap(META_MAP_KEY);
    metaMap.set(META_PARTS_CAPABILITY_KEY, { version: 1, enabledAt: '', clientId: 0 });

    // Write a non-Y.Map value for a critical part
    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    partsMap.set('word/styles.xml', 'corrupted-not-a-ymap');

    const handle = bootstrapPartSync(editor, ydoc);

    // Should fall back to noop — degraded mode (document sync continues)
    expect(handle.publisher).toBeNull();
    expect(handle.consumer).toBeNull();

    // Should emit degraded event with per-part failure detail
    expect(editor.safeEmit).toHaveBeenCalledWith(
      'parts:degraded',
      expect.objectContaining({
        reason: 'critical-hydration-failure',
        failures: expect.arrayContaining([expect.stringContaining('word/styles.xml')]),
      }),
    );

    // Should also emit exception for telemetry
    expect(editor.safeEmit).toHaveBeenCalledWith(
      'exception',
      expect.objectContaining({
        error: expect.objectContaining({
          message: expect.stringContaining('Degraded'),
        }),
      }),
    );

    handle.destroy();
  });
});
