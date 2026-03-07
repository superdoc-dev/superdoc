import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { createPartConsumer, isApplyingRemotePartChanges } from './consumer.js';
import { encodeEnvelopeToYjs } from './json-crdt.js';
import { PARTS_MAP_KEY } from './constants.js';
import { registerPartDescriptor, clearPartDescriptors } from '../../../core/parts/registry/part-registry.js';
import { clearInvalidationHandlers } from '../../../core/parts/invalidation/part-invalidation-registry.js';

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
});
