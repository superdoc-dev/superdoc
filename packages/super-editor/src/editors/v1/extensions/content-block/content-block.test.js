import { describe, it, expect } from 'vitest';
import { Schema, DOMParser } from 'prosemirror-model';
import { createDefaultHorizontalRuleAttrs } from './content-block.js';
import { createDocFromHTML } from '../../core/helpers/importHtml.js';
import { createDocFromMarkdown } from '../../core/helpers/importMarkdown.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal ProseMirror schema that mirrors the real extension setup:
 *   - paragraph with a broad `div` rule at default priority (50)
 *   - contentBlock with `div[data-type]` at priority 60 and `hr` rule
 *
 * This reproduces the real parser priority interaction between paragraph
 * and contentBlock without pulling in the full extension framework.
 */
function buildTestSchema() {
  return new Schema({
    nodes: {
      doc: { content: 'block+' },

      paragraph: {
        group: 'block',
        content: 'inline*',
        parseDOM: [{ tag: 'p' }, { tag: 'div' }],
      },

      contentBlock: {
        group: 'inline',
        content: '',
        atom: true,
        inline: true,
        isolating: true,
        attrs: {
          horizontalRule: { default: false },
          size: { default: null },
          background: { default: null },
        },
        parseDOM: [
          { tag: 'div[data-type="contentBlock"]', priority: 60 },
          { tag: 'hr', getAttrs: () => createDefaultHorizontalRuleAttrs() },
        ],
        toDOM(node) {
          return ['div', { 'data-type': 'contentBlock' }];
        },
      },

      text: { group: 'inline' },
    },
  });
}

/**
 * Parse an HTML string using the test schema's DOMParser.
 */
function parseHTML(html) {
  const schema = buildTestSchema();
  const container = document.createElement('div');
  container.innerHTML = html;
  return DOMParser.fromSchema(schema).parse(container);
}

/**
 * Find the first node of the given type in a PM document.
 * Returns null if not found.
 */
function findNode(doc, typeName) {
  let found = null;
  doc.descendants((node) => {
    if (!found && node.type.name === typeName) {
      found = node;
      return false;
    }
  });
  return found;
}

/**
 * Build a mock editor suitable for createDocFromHTML / createDocFromMarkdown.
 * happy-dom provides the global `document` so the import pipeline has DOM access.
 */
function buildMockEditor() {
  return { schema: buildTestSchema(), options: {} };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('contentBlock <hr> parsing', () => {
  describe('raw DOMParser', () => {
    it('parses <hr> into a contentBlock with horizontalRule attrs', () => {
      const doc = parseHTML('<hr>');

      const cb = findNode(doc, 'contentBlock');
      expect(cb).not.toBeNull();
      expect(cb.attrs.horizontalRule).toBe(true);
      expect(cb.attrs.size).toEqual({ width: '100%', height: 2 });
      expect(cb.attrs.background).toBe('#e5e7eb');
    });

    it('auto-wraps the inline contentBlock in a paragraph', () => {
      const doc = parseHTML('<hr>');

      // doc > paragraph > contentBlock
      const paragraph = doc.firstChild;
      expect(paragraph.type.name).toBe('paragraph');

      const cb = findNode(paragraph, 'contentBlock');
      expect(cb).not.toBeNull();
    });

    it('parses <hr> alongside other content', () => {
      const doc = parseHTML('<p>before</p><hr><p>after</p>');

      const blocks = [];
      doc.forEach((child) => blocks.push(child));

      expect(blocks).toHaveLength(3);
      expect(blocks[0].type.name).toBe('paragraph');
      expect(blocks[0].textContent).toBe('before');
      expect(blocks[1].type.name).toBe('paragraph');
      expect(findNode(blocks[1], 'contentBlock')).not.toBeNull();
      expect(blocks[2].type.name).toBe('paragraph');
      expect(blocks[2].textContent).toBe('after');
    });
  });

  describe('full HTML import pipeline', () => {
    it('parses <hr> through createDocFromHTML', () => {
      const editor = buildMockEditor();
      const doc = createDocFromHTML('<hr>', editor);

      const cb = findNode(doc, 'contentBlock');
      expect(cb).not.toBeNull();
      expect(cb.attrs.horizontalRule).toBe(true);
      expect(cb.attrs.size).toEqual({ width: '100%', height: 2 });
      expect(cb.attrs.background).toBe('#e5e7eb');
    });
  });

  describe('full markdown import pipeline', () => {
    it('parses --- through createDocFromMarkdown', () => {
      const editor = buildMockEditor();
      const doc = createDocFromMarkdown('---', editor);

      const cb = findNode(doc, 'contentBlock');
      expect(cb).not.toBeNull();
      expect(cb.attrs.horizontalRule).toBe(true);
      expect(cb.attrs.size).toEqual({ width: '100%', height: 2 });
      expect(cb.attrs.background).toBe('#e5e7eb');
    });
  });
});

describe('contentBlock shared defaults', () => {
  it('insertHorizontalRule and <hr> parsing use the same default attrs', () => {
    // Parse an <hr> and extract the attrs set by getAttrs
    const doc = parseHTML('<hr>');
    const parsedAttrs = findNode(doc, 'contentBlock').attrs;

    // Get the attrs the insertHorizontalRule command would use
    const commandAttrs = createDefaultHorizontalRuleAttrs();

    expect(parsedAttrs.horizontalRule).toBe(commandAttrs.horizontalRule);
    expect(parsedAttrs.size).toEqual(commandAttrs.size);
    expect(parsedAttrs.background).toBe(commandAttrs.background);
  });
});

describe('contentBlock div[data-type] parsing', () => {
  it('still parses div[data-type="contentBlock"] correctly', () => {
    const doc = parseHTML('<div data-type="contentBlock"></div>');

    const cb = findNode(doc, 'contentBlock');
    expect(cb).not.toBeNull();
    expect(cb.attrs.horizontalRule).toBe(false);
  });

  it('priority prevents paragraph from consuming div[data-type="contentBlock"]', () => {
    // If priority were missing, paragraph's broad `div` rule (priority 50)
    // would match first because paragraph registers before contentBlock.
    // With priority 60, contentBlock's rule wins.
    const doc = parseHTML('<div data-type="contentBlock"></div>');

    const cb = findNode(doc, 'contentBlock');
    expect(cb).not.toBeNull();

    // contentBlock is inline, so PM wraps it in a paragraph.
    // Verify the paragraph contains a contentBlock child (not that the
    // div was consumed as a paragraph itself with no contentBlock inside).
    const topChild = doc.firstChild;
    expect(topChild.type.name).toBe('paragraph');
    expect(findNode(topChild, 'contentBlock')).not.toBeNull();
  });
});
