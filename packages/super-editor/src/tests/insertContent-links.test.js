import { describe, it, expect } from 'vitest';
import { loadTestDataForEditorTests, initTestEditor } from './helpers/helpers.js';
import { getExportedResultWithDocContent } from './export/export-helpers/index.js';

/**
 * Regression tests for insertContent({ contentType: 'html' }) hyperlink handling.
 *
 * Validates that HTML with <a> tags inserted via the contentType: 'html' path
 * produces proper ProseMirror link marks and exports as <w:hyperlink> in OOXML.
 */

/** Collect link marks and literal HTML from editor state */
const inspectEditorState = (editor) => {
  const linkMarks = [];
  const literalHtml = [];
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const link = node.marks.find((m) => m.type.name === 'link');
    if (link) linkMarks.push({ pos, text: node.text, href: link.attrs.href });
    if (/<a\s/i.test(node.text)) literalHtml.push({ pos, text: node.text });
  });
  return { linkMarks, literalHtml };
};

/** Find <w:hyperlink> elements in exported OOXML */
const findHyperlinks = (node) => {
  const results = [];
  if (!node || !node.elements) return results;
  for (const el of node.elements) {
    if (el.name === 'w:hyperlink') {
      results.push(el);
    }
    if (el.elements) {
      results.push(...findHyperlinks(el));
    }
  }
  return results;
};

/** Extract text from a <w:hyperlink> element */
const getHyperlinkText = (hyperlink) => {
  const texts = [];
  const walk = (el) => {
    if (!el) return;
    if (el.type === 'text' && typeof el.text === 'string') {
      texts.push(el.text);
    }
    if (el.elements) el.elements.forEach(walk);
  };
  walk(hyperlink);
  return texts.join('');
};

let cachedDocxData = null;

const setupEditor = async () => {
  if (!cachedDocxData) {
    cachedDocxData = await loadTestDataForEditorTests('blank-doc.docx');
  }
  const { docx, media, mediaFiles, fonts } = cachedDocxData;
  const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts, mode: 'docx' });
  return editor;
};

const exportFromEditor = async (editor) => {
  const content = editor.getJSON().content || [];
  return await getExportedResultWithDocContent(content);
};

describe('insertContent links (contentType: html)', () => {
  describe('single link', () => {
    it('produces a link mark in ProseMirror state', async () => {
      const editor = await setupEditor();
      const input = '<p>See <a href="https://example.com">[27]</a> today</p>';

      editor.commands.insertContent(input, { contentType: 'html' });
      await Promise.resolve();

      const { linkMarks, literalHtml } = inspectEditorState(editor);
      expect(linkMarks.length).toBeGreaterThanOrEqual(1);
      expect(linkMarks[0].href).toBe('https://example.com');
      expect(linkMarks[0].text).toBe('[27]');
      expect(literalHtml).toHaveLength(0);
    });

    it('exports <w:hyperlink> with r:id', async () => {
      const editor = await setupEditor();
      editor.commands.insertContent('<p>See <a href="https://example.com">[27]</a> today</p>', {
        contentType: 'html',
      });
      await Promise.resolve();

      const result = await exportFromEditor(editor);
      const hyperlinks = findHyperlinks(result);
      expect(hyperlinks.length).toBeGreaterThanOrEqual(1);
      expect(hyperlinks[0].attributes?.['r:id']).toBeTruthy();
      expect(getHyperlinkText(hyperlinks[0])).toBe('[27]');
    });
  });

  describe('multi-paragraph with multiple links', () => {
    it('all links produce link marks', async () => {
      const editor = await setupEditor();
      const input = `
        <p>First <a href="https://one.com">link one</a> text</p>
        <p>Second <a href="https://two.com">link two</a> text</p>
        <p>Third <a href="https://three.com">link three</a> text</p>
      `;

      editor.commands.insertContent(input, { contentType: 'html' });
      await Promise.resolve();

      const { linkMarks, literalHtml } = inspectEditorState(editor);
      expect(linkMarks).toHaveLength(3);
      expect(linkMarks.map((m) => m.href)).toEqual(['https://one.com', 'https://two.com', 'https://three.com']);
      expect(literalHtml).toHaveLength(0);
    });

    it('all links export as <w:hyperlink> with r:id', async () => {
      const editor = await setupEditor();
      const input = `
        <p>First <a href="https://one.com">link one</a> text</p>
        <p>Second <a href="https://two.com">link two</a> text</p>
        <p>Third <a href="https://three.com">link three</a> text</p>
      `;

      editor.commands.insertContent(input, { contentType: 'html' });
      await Promise.resolve();

      const result = await exportFromEditor(editor);
      const hyperlinks = findHyperlinks(result);
      expect(hyperlinks).toHaveLength(3);
      hyperlinks.forEach((hl) => {
        expect(hl.attributes?.['r:id']).toBeTruthy();
      });
    });
  });
});
