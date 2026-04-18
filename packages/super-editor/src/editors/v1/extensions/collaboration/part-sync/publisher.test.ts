import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { createPartPublisher } from './publisher.js';
import { PARTS_MAP_KEY } from './constants.js';
import type { PartChangedEvent } from '../../../core/parts/types.js';
import { registerPartDescriptor, clearPartDescriptors } from '../../../core/parts/registry/part-registry.js';
import { clearInvalidationHandlers } from '../../../core/parts/invalidation/part-invalidation-registry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEditor(ydoc: Y.Doc) {
  const converter = {
    convertedXml: {} as Record<string, unknown>,
    documentModified: false,
    documentGuid: null,
  };

  return {
    options: { user: { name: 'test' }, ydoc },
    converter,
    _compoundDepth: 0,
    emit: vi.fn(),
  } as unknown as import('../../../core/Editor.js').Editor;
}

function makeEvent(partId: string, operation: 'mutate' | 'create' | 'delete', source = 'test'): PartChangedEvent {
  return {
    parts: [{ partId: partId as import('../../../core/parts/types.js').PartId, operation, changedPaths: [] }],
    source,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PartPublisher', () => {
  let ydoc: Y.Doc;

  beforeEach(() => {
    ydoc = new Y.Doc();
  });

  afterEach(() => {
    ydoc.destroy();
    clearPartDescriptors();
    clearInvalidationHandlers();
  });

  it('publishes a create event to Yjs parts map', () => {
    const editor = createMockEditor(ydoc);
    editor.converter.convertedXml['word/styles.xml'] = { type: 'element', name: 'doc' };
    const publisher = createPartPublisher(editor, ydoc);

    publisher.handlePartChanged(makeEvent('word/styles.xml', 'create'));

    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    const entry = partsMap.get('word/styles.xml');
    expect(entry).toBeInstanceOf(Y.Map);
    expect((entry as Y.Map<unknown>).get('v')).toBe(1);
    expect((entry as Y.Map<unknown>).get('clientId')).toBe(ydoc.clientID);

    publisher.destroy();
  });

  it('increments version on subsequent publishes', () => {
    const editor = createMockEditor(ydoc);
    editor.converter.convertedXml['word/styles.xml'] = { elements: [] };
    const publisher = createPartPublisher(editor, ydoc);

    publisher.handlePartChanged(makeEvent('word/styles.xml', 'mutate'));
    publisher.handlePartChanged(makeEvent('word/styles.xml', 'mutate'));

    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    const entry = partsMap.get('word/styles.xml') as Y.Map<unknown>;
    expect(entry.get('v')).toBe(2);

    publisher.destroy();
  });

  it('deletes key on delete operation', () => {
    const editor = createMockEditor(ydoc);
    const publisher = createPartPublisher(editor, ydoc);

    // Seed an entry first
    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    partsMap.set('word/header1.xml', new Y.Map());

    publisher.handlePartChanged(makeEvent('word/header1.xml', 'delete'));
    expect(partsMap.has('word/header1.xml')).toBe(false);

    publisher.destroy();
  });

  it('ignores remote-source events', () => {
    const editor = createMockEditor(ydoc);
    editor.converter.convertedXml['word/styles.xml'] = {};
    const publisher = createPartPublisher(editor, ydoc);

    publisher.handlePartChanged(makeEvent('word/styles.xml', 'mutate', 'collab:remote:parts'));

    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    expect(partsMap.has('word/styles.xml')).toBe(false);

    publisher.destroy();
  });

  it('ignores word/document.xml', () => {
    const editor = createMockEditor(ydoc);
    editor.converter.convertedXml['word/document.xml'] = {};
    const publisher = createPartPublisher(editor, ydoc);

    publisher.handlePartChanged(makeEvent('word/document.xml', 'mutate'));

    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    expect(partsMap.has('word/document.xml')).toBe(false);

    publisher.destroy();
  });

  describe('compound buffering', () => {
    it('buffers events during compound and flushes on success', () => {
      const editor = createMockEditor(ydoc);
      editor.converter.convertedXml['word/styles.xml'] = { v: 'a' };
      editor.converter.convertedXml['word/numbering.xml'] = { v: 'b' };
      const publisher = createPartPublisher(editor, ydoc);

      // Simulate compound start
      (editor as unknown as { _compoundDepth: number })._compoundDepth = 1;

      publisher.handlePartChanged(makeEvent('word/styles.xml', 'mutate'));
      publisher.handlePartChanged(makeEvent('word/numbering.xml', 'mutate'));

      // Nothing published yet
      const partsMap = ydoc.getMap(PARTS_MAP_KEY);
      expect(partsMap.size).toBe(0);

      // Flush on compound success
      publisher.flush();

      expect(partsMap.has('word/styles.xml')).toBe(true);
      expect(partsMap.has('word/numbering.xml')).toBe(true);

      publisher.destroy();
    });

    it('drops buffered events on compound failure', () => {
      const editor = createMockEditor(ydoc);
      editor.converter.convertedXml['word/styles.xml'] = {};
      const publisher = createPartPublisher(editor, ydoc);

      (editor as unknown as { _compoundDepth: number })._compoundDepth = 1;
      publisher.handlePartChanged(makeEvent('word/styles.xml', 'mutate'));

      publisher.drop();

      const partsMap = ydoc.getMap(PARTS_MAP_KEY);
      expect(partsMap.size).toBe(0);

      publisher.destroy();
    });
  });

  it('does nothing after destroy', () => {
    const editor = createMockEditor(ydoc);
    editor.converter.convertedXml['word/styles.xml'] = {};
    const publisher = createPartPublisher(editor, ydoc);
    publisher.destroy();

    publisher.handlePartChanged(makeEvent('word/styles.xml', 'mutate'));

    const partsMap = ydoc.getMap(PARTS_MAP_KEY);
    expect(partsMap.size).toBe(0);
  });
});
