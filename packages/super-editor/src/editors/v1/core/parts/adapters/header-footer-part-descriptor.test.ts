import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Editor } from '../../Editor.js';
import { mutatePart } from '../mutation/mutate-part.js';
import { createTestEditor, withPart, cleanupParts } from '../testing/test-helpers.js';
import { ensureHeaderFooterDescriptor, SOURCE_HEADER_FOOTER_LOCAL } from './header-footer-part-descriptor.js';
import { initRevision } from '../../../document-api-adapters/plan-engine/revision-tracker.js';

function asEditor(mock: ReturnType<typeof createTestEditor>): Editor {
  return mock as unknown as Editor;
}

describe('header/footer part descriptor', () => {
  let editor: ReturnType<typeof createTestEditor>;

  beforeEach(() => {
    editor = createTestEditor();
    initRevision(asEditor(editor));
  });

  afterEach(() => {
    cleanupParts();
  });

  it('keeps the live footer PM cache for local syncs', () => {
    ensureHeaderFooterDescriptor('word/footer1.xml', 'rId-footer');
    withPart(editor, 'word/footer1.xml', { elements: [{ name: 'w:ftr', elements: [] }] });

    const preservedFooter = { type: 'doc', content: [{ type: 'vectorShape', attrs: { textContent: {} } }] };
    Object.assign(editor.converter, {
      footers: { 'rId-footer': preservedFooter },
      reimportHeaderFooterPart: vi.fn(() => ({ type: 'doc', content: [] })),
    });

    mutatePart({
      editor: asEditor(editor),
      partId: 'word/footer1.xml',
      sectionId: 'rId-footer',
      operation: 'mutate',
      source: SOURCE_HEADER_FOOTER_LOCAL,
      mutate: ({ part }) => {
        (part as { elements: Array<{ attributes?: Record<string, string> }> }).elements[0].attributes = {
          changed: '1',
        };
      },
    });

    expect(editor.converter.reimportHeaderFooterPart).not.toHaveBeenCalled();
    expect(editor.converter.footers['rId-footer']).toBe(preservedFooter);
    expect(editor.converter.headerFooterModified).toBe(true);
  });

  it('reimports footer PM cache for remote syncs', () => {
    ensureHeaderFooterDescriptor('word/footer1.xml', 'rId-footer');
    withPart(editor, 'word/footer1.xml', { elements: [{ name: 'w:ftr', elements: [] }] });

    const reimportedFooter = { type: 'doc', content: [{ type: 'paragraph' }] };
    Object.assign(editor.converter, {
      footers: { 'rId-footer': { type: 'doc', content: [] } },
      reimportHeaderFooterPart: vi.fn(() => reimportedFooter),
    });

    mutatePart({
      editor: asEditor(editor),
      partId: 'word/footer1.xml',
      sectionId: 'rId-footer',
      operation: 'mutate',
      source: 'remote',
      mutate: ({ part }) => {
        (part as { elements: Array<{ attributes?: Record<string, string> }> }).elements[0].attributes = {
          changed: '1',
        };
      },
    });

    expect(editor.converter.reimportHeaderFooterPart).toHaveBeenCalledWith('word/footer1.xml');
    expect(editor.converter.footers['rId-footer']).toBe(reimportedFooter);
    expect(editor.converter.headerFooterModified).toBe(true);
  });
});
