import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema, doc, p } from 'prosemirror-test-builder';

const handleDocxPasteMock = vi.hoisted(() => vi.fn(() => true));
const handleGoogleDocsHtmlMock = vi.hoisted(() => vi.fn(() => true));
const flattenListsInHtmlMock = vi.hoisted(() => vi.fn((html) => html));

vi.mock('./inputRules/docx-paste/docx-paste.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    handleDocxPaste: handleDocxPasteMock,
  };
});

vi.mock('./inputRules/google-docs-paste/google-docs-paste.js', () => ({
  handleGoogleDocsHtml: handleGoogleDocsHtmlMock,
}));

vi.mock('./inputRules/html/html-helpers.js', () => ({
  flattenListsInHtml: flattenListsInHtmlMock,
}));

import {
  InputRule,
  convertEmToPt,
  cleanHtmlUnnecessaryTags,
  sanitizeHtml,
  handleHtmlPaste,
  handleClipboardPaste,
  isWordHtml,
} from './InputRule.js';

const createEditorContext = (initialDoc) => {
  const baseState = EditorState.create({ schema, doc: initialDoc });
  const selection = TextSelection.create(baseState.doc, 1);
  const state = baseState.apply(baseState.tr.setSelection(selection));
  const view = {
    state,
    lastDispatched: null,
    dispatch: (tr) => {
      view.lastDispatched = tr;
      view.state = view.state.apply(tr);
    },
  };
  const editor = { schema, view, options: { mode: 'text' } };
  return { editor, view };
};

describe('InputRule helpers', () => {
  beforeEach(() => {
    handleDocxPasteMock.mockReset().mockReturnValue('docx-result');
    handleGoogleDocsHtmlMock.mockReset().mockReturnValue('google-result');
    flattenListsInHtmlMock.mockClear();
  });

  it('stores matcher configuration in InputRule instances', () => {
    const handler = vi.fn();
    const rule = new InputRule({ match: /::/, handler });

    expect(rule.match).toEqual(/::/);
    expect(rule.handler).toBe(handler);
  });

  it('converts em sizing to point sizing', () => {
    const input = '<span style="font-size: 1.5em">Test</span>';

    const result = convertEmToPt(input);

    expect(result).toContain('font-size: 18pt');
  });

  it('removes unnecessary HTML constructs', () => {
    const html = '<o:p>keep?</o:p><span> </span><p> </p>&nbsp;text';

    const cleaned = cleanHtmlUnnecessaryTags(html);

    expect(cleaned).toBe('text');
  });

  it('sanitizes forbidden tags and attributes', () => {
    const sanitized = sanitizeHtml(
      '<div linebreaktype="soft"><p data-sd-block-id="block-1"><script>bad()</script><span>ok</span></p></div>',
    );

    expect(sanitized.querySelector('script')).toBeNull();
    const div = sanitized.querySelector('div');
    expect(div?.hasAttribute('linebreaktype')).toBe(false);
    const paragraph = sanitized.querySelector('p');
    expect(paragraph?.hasAttribute('data-sd-block-id')).toBe(false);
    expect(div?.querySelector('span')?.textContent).toBe('ok');
  });

  it('handles single paragraph HTML paste inside a paragraph', () => {
    const { editor, view } = createEditorContext(doc(p('Existing')));

    const handled = handleHtmlPaste('<p>New</p>', editor);

    expect(handled).toBe(true);
    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.firstChild.textContent).toBe('NewExisting');
  });

  it('preserves paragraph structure when pasting multiple paragraphs', () => {
    const { editor, view } = createEditorContext(doc(p('Base')));

    handleHtmlPaste('<p>First</p><p>Second</p>', editor);

    // Multi-paragraph paste should preserve paragraph structure
    // Cursor at start of "Base" → "First" paragraph, "Second" paragraph, then "Base" continues
    expect(view.state.doc.childCount).toBe(3);
    expect(view.state.doc.child(0).textContent).toBe('First');
    expect(view.state.doc.child(1).textContent).toBe('Second');
    expect(view.state.doc.child(2).textContent).toBe('Base');
  });

  it('detects Word generated HTML', () => {
    const html = '<meta name="Generator" content="Microsoft Word">';

    expect(isWordHtml(html)).toBe(true);
    expect(isWordHtml('<p>plain</p>')).toBe(false);
  });

  it('delegates clipboard handling for plain text', () => {
    const editor = { options: { mode: 'text' } };
    const handled = handleClipboardPaste({ editor }, '');

    expect(handled).toBe(false);
    expect(handleDocxPasteMock).not.toHaveBeenCalled();
  });

  it('uses DOCX paste handler when Word HTML is detected in docx mode', () => {
    const editor = { options: { mode: 'docx' } };
    const html = '<meta name="Generator" content="Microsoft Word">';

    const handled = handleClipboardPaste({ editor, view: {} }, html);

    expect(handleDocxPasteMock).toHaveBeenCalledWith(html, editor, {});
    expect(handled).toBe('docx-result');
  });

  it('uses Google Docs handler when matching markup is found', () => {
    const editor = { options: { mode: 'text' } };
    const html = '<div docs-internal-guid-test>Content</div>';

    const handled = handleClipboardPaste({ editor, view: {} }, html);

    expect(handleGoogleDocsHtmlMock).toHaveBeenCalledWith(html, editor, {});
    expect(handled).toBe('google-result');
  });

  it('falls back to browser HTML handler', () => {
    const { editor } = createEditorContext(doc(p('Base')));
    const html = '<p>Content</p>';

    const handled = handleClipboardPaste({ editor, view: editor.view }, html);

    expect(flattenListsInHtmlMock).toHaveBeenCalled();
    expect(handled).toBe(true);
  });
});
