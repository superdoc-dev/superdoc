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
