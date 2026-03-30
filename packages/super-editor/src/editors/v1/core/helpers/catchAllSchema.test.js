import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { Schema } from 'prosemirror-model';
import { getCatchAllSchema, detectUnsupportedContent } from './catchAllSchema.js';

// Build a minimal schema that supports only doc, paragraph, text, blockquote, strong, em.
// Tags like <video>, <audio>, <canvas>, <details> are NOT supported.
const minimalSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', parseDOM: [{ tag: 'p' }] },
    blockquote: { content: 'block+', group: 'block', parseDOM: [{ tag: 'blockquote' }] },
    text: { group: 'inline' },
  },
  marks: {
    strong: { parseDOM: [{ tag: 'strong' }, { tag: 'b' }] },
    em: { parseDOM: [{ tag: 'em' }, { tag: 'i' }] },
  },
});

/**
 * Helper to create a DOM element from HTML.
 * @param {string} html
 * @returns {HTMLDivElement}
 */
function htmlToElement(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('getCatchAllSchema', () => {
  it('returns a schema with the catch-all node appended', () => {
    const catchAll = getCatchAllSchema(minimalSchema);
    expect(catchAll.nodes).toHaveProperty('__supereditor__private__unknown__catch__all__node');
  });

  it('caches the schema (same reference on second call)', () => {
    const first = getCatchAllSchema(minimalSchema);
    const second = getCatchAllSchema(minimalSchema);
    expect(first).toBe(second);
  });

  it('preserves all original nodes', () => {
    const catchAll = getCatchAllSchema(minimalSchema);
    for (const name of Object.keys(minimalSchema.nodes)) {
      expect(catchAll.nodes).toHaveProperty(name);
    }
  });
});

describe('detectUnsupportedContent', () => {
  it('reports <video> as unsupported', () => {
    const el = htmlToElement('<p>Hello</p><video src="a.mp4"></video><p>World</p>');
    const items = detectUnsupportedContent(el, minimalSchema);

    expect(items).toEqual([expect.objectContaining({ tagName: 'VIDEO', count: 1 })]);
  });

  it('skips transparent wrappers whose children are parseable elements', () => {
    // <section> is unknown but wraps <p> which IS known — ProseMirror looks through it
    const el = htmlToElement('<section><p>Preserved content</p></section>');
    const items = detectUnsupportedContent(el, minimalSchema);
    expect(items).toEqual([]);
  });

  it('skips unknown wrappers that contain only text', () => {
    // <section>Hello</section> — PM looks through it and preserves the text
    const el = htmlToElement('<section>Hello world</section>');
    const items = detectUnsupportedContent(el, minimalSchema);
    expect(items).toEqual([]);
  });

  it('reports empty unknown elements with no text or children', () => {
    // <video></video> has no text and no known descendants — truly dropped
    const el = htmlToElement('<video></video>');
    const items = detectUnsupportedContent(el, minimalSchema);
    expect(items).toEqual([expect.objectContaining({ tagName: 'VIDEO' })]);
  });

  it('reports unknown elements even when siblings are known', () => {
    // <video> is truly dropped (void, no known descendants), <p> is fine
    const el = htmlToElement('<p>Text</p><video src="a.mp4"></video>');
    const items = detectUnsupportedContent(el, minimalSchema);
    expect(items).toEqual([expect.objectContaining({ tagName: 'VIDEO' })]);
  });

  it('aggregates multiple unsupported elements of the same tag', () => {
    const el = htmlToElement('<p>A</p><video></video><p>B</p><video></video><p>C</p><video></video>');
    const items = detectUnsupportedContent(el, minimalSchema);

    const videoItem = items.find((i) => i.tagName === 'VIDEO');
    expect(videoItem).toBeDefined();
    expect(videoItem.count).toBe(3);
  });

  it('returns empty array for valid HTML (only known nodes)', () => {
    const el = htmlToElement('<p>Hello <strong>world</strong></p><blockquote><p>Quote</p></blockquote>');
    const items = detectUnsupportedContent(el, minimalSchema);
    expect(items).toEqual([]);
  });

  it('truncates outerHTML longer than 200 characters', () => {
    const longAttr = 'x'.repeat(300);
    const el = htmlToElement(`<video data-long="${longAttr}"></video>`);
    const items = detectUnsupportedContent(el, minimalSchema);

    const item = items.find((i) => i.tagName === 'VIDEO');
    expect(item).toBeDefined();
    // 200 chars + 1 ellipsis character
    expect(item.outerHTML.length).toBeLessThanOrEqual(201);
  });
});

// Integration tests for createDocFromHTML with unsupported content detection.
// Module-level mocks are hoisted by vitest so they apply before imports.
vi.mock('../InputRule.js', () => ({
  htmlHandler: (content, _editor, domDoc) => {
    const div = (domDoc ?? document).createElement('div');
    div.innerHTML = content;
    return div;
  },
}));
vi.mock('./htmlSanitizer.js', () => ({
  stripHtmlStyles: (content) => content,
}));
vi.mock('../inputRules/docx-paste/docx-paste.js', () => ({
  wrapTextsInRuns: (doc) => doc,
}));

describe('createDocFromHTML — unsupported content detection', () => {
  let createDocFromHTML;

  beforeEach(async () => {
    const mod = await import('./importHtml.js');
    createDocFromHTML = mod.createDocFromHTML;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('invokes onUnsupportedContent callback with unsupported items', () => {
    const callback = vi.fn();
    const editor = { schema: minimalSchema, options: {} };

    createDocFromHTML('<p>Hello</p><video></video><p>World</p>', editor, {
      onUnsupportedContent: callback,
    });

    expect(callback).toHaveBeenCalledTimes(1);
    const items = callback.mock.calls[0][0];
    expect(items).toEqual([expect.objectContaining({ tagName: 'VIDEO', count: 1 })]);
  });

  it('does NOT invoke callback when all content is valid', () => {
    const callback = vi.fn();
    const editor = { schema: minimalSchema, options: {} };

    createDocFromHTML('<p>Hello <em>world</em></p>', editor, {
      onUnsupportedContent: callback,
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('emits console.warn when warnOnUnsupportedContent is true and no callback', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const editor = { schema: minimalSchema, options: {} };

    createDocFromHTML('<p>Hello</p><video></video>', editor, {
      warnOnUnsupportedContent: true,
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('Unsupported HTML content');
  });

  it('does NOT emit console.warn when callback is provided', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const callback = vi.fn();
    const editor = { schema: minimalSchema, options: {} };

    createDocFromHTML('<p>Hello</p><video></video>', editor, {
      onUnsupportedContent: callback,
      warnOnUnsupportedContent: true,
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does NOT run detection when neither flag is set', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const editor = { schema: minimalSchema, options: {} };

    // No options — should not trigger detection
    createDocFromHTML('<p>Hello</p><video></video>', editor);

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
