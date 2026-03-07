import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { bootstrapPartSync, resolvePartSyncMode } from './bootstrap.js';
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
      collaborationPartsSync: false,
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

describe('resolvePartSyncMode', () => {
  it('returns "off" when flag is false', () => {
    const editor = createMockEditor({ collaborationPartsSync: false });
    expect(resolvePartSyncMode(editor)).toBe('off');
  });

  it('returns "off" when flag is absent', () => {
    const editor = createMockEditor({});
    delete (editor.options as Record<string, unknown>).collaborationPartsSync;
    expect(resolvePartSyncMode(editor)).toBe('off');
  });

  it('returns "active" when flag is true', () => {
    const editor = createMockEditor({ collaborationPartsSync: true });
    expect(resolvePartSyncMode(editor)).toBe('active');
  });

  it('returns "passive" when flag is "passive"', () => {
    const editor = createMockEditor({ collaborationPartsSync: 'passive' });
    expect(resolvePartSyncMode(editor)).toBe('passive');
  });
});

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

  it('returns noop handle when mode is "off"', () => {
    const editor = createMockEditor();
    const handle = bootstrapPartSync(editor, ydoc, 'off');

    expect(handle.publisher).toBeNull();
    expect(handle.consumer).toBeNull();
    handle.destroy(); // Should not throw
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

    const handle = bootstrapPartSync(editor, ydoc, 'active');

    expect(handle.publisher).not.toBeNull();
    expect(handle.consumer).not.toBeNull();

    // Verify capability was set
    const capability = metaMap.get(META_PARTS_CAPABILITY_KEY) as Record<string, unknown>;
    expect(capability?.version).toBe(1);

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

    const handle = bootstrapPartSync(editor, ydoc, 'active');

    expect(handle.publisher).not.toBeNull();

    // Capability should be backfilled
    const metaMap = ydoc.getMap(META_MAP_KEY);
    const capability = metaMap.get(META_PARTS_CAPABILITY_KEY) as Record<string, unknown>;
    expect(capability?.version).toBe(1);

    handle.destroy();
  });

  it('stays on legacy path when no parts and no meta.docx', () => {
    const editor = createMockEditor();
    const handle = bootstrapPartSync(editor, ydoc, 'active');

    expect(handle.publisher).toBeNull();
    expect(handle.consumer).toBeNull();

    handle.destroy();
  });

  it('passive mode activates publisher but not consumer', () => {
    const editor = createMockEditor();
    const metaMap = ydoc.getMap(META_MAP_KEY);
    metaMap.set('docx', [
      {
        name: 'word/styles.xml',
        content: { type: 'element', name: 'doc', elements: [{ type: 'element', name: 'w:styles', elements: [] }] },
      },
    ]);

    const handle = bootstrapPartSync(editor, ydoc, 'passive');

    expect(handle.publisher).not.toBeNull();
    expect(handle.consumer).toBeNull();

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

    const handle = bootstrapPartSync(editor, ydoc, 'active');

    // Settings should be hydrated
    expect(editor.converter.convertedXml['word/settings.xml']).toBeDefined();

    handle.destroy();
  });

  it('registers partChanged listener and cleans up on destroy', () => {
    const editor = createMockEditor();
    const metaMap = ydoc.getMap(META_MAP_KEY);
    metaMap.set(META_PARTS_CAPABILITY_KEY, { version: 1, enabledAt: '', clientId: 0 });

    const handle = bootstrapPartSync(editor, ydoc, 'active');

    expect(editor.on).toHaveBeenCalledWith('partChanged', expect.any(Function));

    handle.destroy();

    expect(editor.off).toHaveBeenCalledWith('partChanged', expect.any(Function));
  });

  it('falls back when critical part is a non-Y.Map entry', () => {
    const editor = createMockEditor();
    const metaMap = ydoc.getMap(META_MAP_KEY);
    metaMap.set(META_PARTS_CAPABILITY_KEY, { version: 1, enabledAt: '', clientId: 0 });

    // Write a non-Y.Map value for a critical part
    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    partsMap.set('word/styles.xml', 'corrupted-not-a-ymap');

    const handle = bootstrapPartSync(editor, ydoc, 'active');

    // Should fall back to noop due to critical hydration failure
    expect(handle.publisher).toBeNull();
    expect(handle.consumer).toBeNull();

    handle.destroy();
  });
});
