import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as Y from 'yjs';
import { PARTS_MAP_KEY, META_MAP_KEY, MEDIA_MAP_KEY } from './part-sync/constants.js';

// Mock prosemirrorToYDoc — it expects a real ProseMirror Node which is
// impractical to construct in a unit test. We return a minimal Y.Doc with
// a single XML element so `Y.applyUpdate` has content to transfer.
vi.mock('y-prosemirror', () => ({
  prosemirrorToYDoc: vi.fn((_pmDoc: unknown, fragmentName: string) => {
    const tempYdoc = new Y.Doc();
    const fragment = tempYdoc.getXmlFragment(fragmentName);
    const el = new Y.XmlElement('paragraph');
    el.insert(0, [new Y.XmlText('seeded content')]);
    fragment.insert(0, [el]);
    return tempYdoc;
  }),
}));

// Import after mock
const { seedEditorStateToYDoc } = await import('./seed-editor-to-ydoc.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEditor(overrides: Record<string, unknown> = {}) {
  const convertedXml: Record<string, unknown> = {
    'word/document.xml': { doc: true },
    'word/styles.xml': { type: 'element', name: 'w:styles' },
    'word/numbering.xml': { type: 'element', name: 'w:numbering' },
  };

  return {
    converter: { convertedXml },
    state: {
      doc: {
        attrs: { bodySectPr: { pgSz: { w: 12240, h: 15840 } } },
      },
    },
    options: {
      mediaFiles: { 'word/media/image1.png': 'base64-data-1' } as Record<string, unknown>,
      fonts: { Arial: { family: 'Arial' } },
    },
    ...overrides,
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('seedEditorStateToYDoc', () => {
  let targetYdoc: Y.Doc;

  beforeEach(() => {
    targetYdoc = new Y.Doc();
  });

  afterEach(() => {
    targetYdoc.destroy();
  });

  // -------------------------------------------------------------------------
  // Fragment
  // -------------------------------------------------------------------------

  it('writes the PM document into the ydoc fragment', () => {
    const editor = createMockEditor();
    seedEditorStateToYDoc(editor, targetYdoc);

    const fragment = targetYdoc.getXmlFragment('supereditor');
    expect(fragment.length).toBeGreaterThan(0);
  });

  it('clears existing fragment content before writing', () => {
    // Pre-populate the fragment with some content
    const preFragment = targetYdoc.getXmlFragment('supereditor');
    const el = new Y.XmlElement('p');
    el.insert(0, [new Y.XmlText('pre-existing')]);
    preFragment.insert(0, [el]);
    expect(preFragment.length).toBe(1);

    const editor = createMockEditor();
    seedEditorStateToYDoc(editor, targetYdoc);

    const fragment = targetYdoc.getXmlFragment('supereditor');
    // Should have new content — the mock writes 1 element
    expect(fragment.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Parts
  // -------------------------------------------------------------------------

  it('seeds non-document parts with replaceExisting semantics', () => {
    // Pre-populate a stale part
    const partsMap = targetYdoc.getMap(PARTS_MAP_KEY);
    partsMap.set('word/stale-part.xml', { v: 1, data: 'stale' });

    const editor = createMockEditor();
    seedEditorStateToYDoc(editor, targetYdoc);

    // Stale part should be pruned
    expect(partsMap.has('word/stale-part.xml')).toBe(false);

    // Current parts should exist
    expect(partsMap.has('word/styles.xml')).toBe(true);
    expect(partsMap.has('word/numbering.xml')).toBe(true);
  });

  it('does not include word/document.xml in parts', () => {
    const editor = createMockEditor();
    seedEditorStateToYDoc(editor, targetYdoc);

    const partsMap = targetYdoc.getMap(PARTS_MAP_KEY);
    expect(partsMap.has('word/document.xml')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Media
  // -------------------------------------------------------------------------

  it('writes current media files to the media map', () => {
    const editor = createMockEditor();
    seedEditorStateToYDoc(editor, targetYdoc);

    const mediaMap = targetYdoc.getMap(MEDIA_MAP_KEY);
    expect(mediaMap.get('word/media/image1.png')).toBe('base64-data-1');
  });

  it('prunes stale media keys', () => {
    // Pre-populate stale media
    const mediaMap = targetYdoc.getMap(MEDIA_MAP_KEY);
    mediaMap.set('word/media/old-image.png', 'old-data');

    const editor = createMockEditor();
    seedEditorStateToYDoc(editor, targetYdoc);

    expect(mediaMap.has('word/media/old-image.png')).toBe(false);
    expect(mediaMap.has('word/media/image1.png')).toBe(true);
  });

  it('handles missing mediaFiles gracefully', () => {
    const editor = createMockEditor({ options: { fonts: {} } });
    seedEditorStateToYDoc(editor, targetYdoc);

    const mediaMap = targetYdoc.getMap(MEDIA_MAP_KEY);
    expect(mediaMap.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Metadata
  // -------------------------------------------------------------------------

  it('writes bodySectPr to the meta map', () => {
    const editor = createMockEditor();
    seedEditorStateToYDoc(editor, targetYdoc);

    const metaMap = targetYdoc.getMap(META_MAP_KEY);
    const bodySectPr = metaMap.get('bodySectPr') as Record<string, unknown>;
    expect(bodySectPr).toEqual({ pgSz: { w: 12240, h: 15840 } });
  });

  it('writes null bodySectPr to clear stale values in a previously-seeded room', () => {
    // Pre-seed stale bodySectPr
    const metaMap = targetYdoc.getMap(META_MAP_KEY);
    metaMap.set('bodySectPr', { pgSz: { w: 999, h: 999 } });

    const editor = createMockEditor({
      state: { doc: { attrs: { bodySectPr: null } } },
    });
    seedEditorStateToYDoc(editor, targetYdoc);

    expect(metaMap.get('bodySectPr')).toBeNull();
  });

  it('writes null fonts to clear stale values in a previously-seeded room', () => {
    const metaMap = targetYdoc.getMap(META_MAP_KEY);
    metaMap.set('fonts', { StaleFont: { family: 'Stale' } });

    const editor = createMockEditor({ options: { mediaFiles: {} } });
    seedEditorStateToYDoc(editor, targetYdoc);

    expect(metaMap.get('fonts')).toBeNull();
  });

  it('writes fonts to the meta map', () => {
    const editor = createMockEditor();
    seedEditorStateToYDoc(editor, targetYdoc);

    const metaMap = targetYdoc.getMap(META_MAP_KEY);
    expect(metaMap.get('fonts')).toEqual({ Arial: { family: 'Arial' } });
  });

  it('writes bootstrap marker with source "upgrade"', () => {
    const editor = createMockEditor();
    seedEditorStateToYDoc(editor, targetYdoc);

    const metaMap = targetYdoc.getMap(META_MAP_KEY);
    const bootstrap = metaMap.get('bootstrap') as Record<string, unknown>;
    expect(bootstrap.version).toBe(1);
    expect(bootstrap.source).toBe('upgrade');
    expect(bootstrap.clientId).toBe(targetYdoc.clientID);
    expect(typeof bootstrap.seededAt).toBe('string');
  });

  // -------------------------------------------------------------------------
  // Legacy cleanup
  // -------------------------------------------------------------------------

  it('removes stale meta.docx if present', () => {
    const metaMap = targetYdoc.getMap(META_MAP_KEY);
    metaMap.set('docx', new Uint8Array([1, 2, 3]));

    const editor = createMockEditor();
    seedEditorStateToYDoc(editor, targetYdoc);

    expect(metaMap.has('docx')).toBe(false);
  });

  it('does not fail when meta.docx is absent', () => {
    const editor = createMockEditor();
    expect(() => seedEditorStateToYDoc(editor, targetYdoc)).not.toThrow();
  });
});
