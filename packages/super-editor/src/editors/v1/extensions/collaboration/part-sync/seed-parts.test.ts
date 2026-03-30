import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { seedPartsFromEditor } from './seed-parts.js';
import { decodeYjsToEnvelope } from './json-crdt.js';
import { PARTS_MAP_KEY, META_MAP_KEY, META_PARTS_CAPABILITY_KEY, META_PARTS_SCHEMA_VERSION_KEY } from './constants.js';

function createMockEditor(convertedXml: Record<string, unknown>) {
  return { converter: { convertedXml } } as any;
}

describe('seedPartsFromEditor', () => {
  let ydoc: Y.Doc;

  beforeEach(() => {
    ydoc = new Y.Doc();
  });

  afterEach(() => {
    ydoc.destroy();
  });

  it('writes all non-document parts to the parts map', () => {
    const editor = createMockEditor({
      'word/document.xml': { doc: true },
      'word/styles.xml': { type: 'element', name: 'w:styles' },
      'word/numbering.xml': { type: 'element', name: 'w:numbering' },
      '[Content_Types].xml': { type: 'element', name: 'Types' },
    });

    seedPartsFromEditor(editor, ydoc);

    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    expect(partsMap.has('word/styles.xml')).toBe(true);
    expect(partsMap.has('word/numbering.xml')).toBe(true);
    expect(partsMap.has('[Content_Types].xml')).toBe(true);
  });

  it('excludes word/document.xml', () => {
    const editor = createMockEditor({
      'word/document.xml': { doc: true },
      'word/styles.xml': { type: 'element' },
    });

    seedPartsFromEditor(editor, ydoc);

    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    expect(partsMap.has('word/document.xml')).toBe(false);
  });

  it('sets partsCapability marker', () => {
    const editor = createMockEditor({
      'word/styles.xml': { type: 'element' },
    });

    seedPartsFromEditor(editor, ydoc);

    const metaMap = ydoc.getMap(META_MAP_KEY);
    const capability = metaMap.get(META_PARTS_CAPABILITY_KEY) as Record<string, unknown>;
    expect(capability.version).toBe(1);
    expect(capability.clientId).toBe(ydoc.clientID);
  });

  it('sets partsSchemaVersion', () => {
    const editor = createMockEditor({
      'word/styles.xml': { type: 'element' },
    });

    seedPartsFromEditor(editor, ydoc);

    const metaMap = ydoc.getMap(META_MAP_KEY);
    expect(metaMap.get(META_PARTS_SCHEMA_VERSION_KEY)).toBe(1);
  });

  it('skips existing keys when replaceExisting is false', () => {
    // Pre-populate a part
    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    const existing = new Y.Map();
    existing.set('v', 5);
    existing.set('clientId', 999);
    existing.set('data', new Y.Map());
    partsMap.set('word/styles.xml', existing);

    const editor = createMockEditor({
      'word/styles.xml': { type: 'element', name: 'overwritten' },
      'word/numbering.xml': { type: 'element' },
    });

    seedPartsFromEditor(editor, ydoc);

    // Existing key should be untouched (v=5)
    const entry = partsMap.get('word/styles.xml') as Y.Map<unknown>;
    expect(entry.get('v')).toBe(5);

    // New key should be written
    expect(partsMap.has('word/numbering.xml')).toBe(true);
  });

  it('replaceExisting: true overwrites all keys and prunes stale ones', () => {
    // Pre-populate with a stale part
    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    const stale = new Y.Map();
    stale.set('v', 1);
    stale.set('clientId', 0);
    stale.set('data', new Y.Map());
    partsMap.set('word/stale-part.xml', stale);

    const editor = createMockEditor({
      'word/styles.xml': { type: 'element', name: 'fresh' },
    });

    seedPartsFromEditor(editor, ydoc, { replaceExisting: true });

    // Stale key should be deleted
    expect(partsMap.has('word/stale-part.xml')).toBe(false);

    // Fresh key should be written
    expect(partsMap.has('word/styles.xml')).toBe(true);
    const envelope = decodeYjsToEnvelope(partsMap.get('word/styles.xml') as Y.Map<unknown>);
    expect((envelope?.data as Record<string, unknown>)?.name).toBe('fresh');
  });

  it('sets envelope version to 1', () => {
    const editor = createMockEditor({
      'word/styles.xml': { type: 'element' },
    });

    seedPartsFromEditor(editor, ydoc);

    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    const entry = partsMap.get('word/styles.xml') as Y.Map<unknown>;
    const envelope = decodeYjsToEnvelope(entry);
    expect(envelope?.v).toBe(1);
  });

  it('does nothing when converter has no convertedXml', () => {
    const editor = { converter: {} } as any;

    seedPartsFromEditor(editor, ydoc);

    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    expect(partsMap.size).toBe(0);
  });
});
