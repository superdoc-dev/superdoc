import { beforeAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { createDocFromMarkdown } from './importMarkdown.js';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

let docData;

beforeAll(async () => {
  docData = await loadTestDataForEditorTests('blank-doc.docx');
});

let editor;

beforeEach(() => {
  ({ editor } = initTestEditor({
    content: docData.docx,
    media: docData.media,
    mediaFiles: docData.mediaFiles,
    fonts: docData.fonts,
  }));
});

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function collectNodeTypes(doc) {
  const types = [];
  doc.descendants((node) => {
    types.push(node.type.name);
    return true;
  });
  return types;
}

function collectTopLevelParagraphs(doc) {
  const paragraphs = [];
  doc.forEach((node) => {
    if (node.type.name === 'paragraph') {
      paragraphs.push(node);
    }
  });
  return paragraphs;
}

function hasNumbering(node) {
  return Boolean(node.attrs?.paragraphProperties?.numberingProperties);
}

function paragraphByText(paragraphs, expectedText) {
  return paragraphs.find((node) => node.textContent.trim() === expectedText);
}

describe('markdown to DOCX integration', () => {
  it('retains blank lines between root blocks as empty paragraphs', () => {
    const markdown = `First paragraph.


Second paragraph.



Third paragraph.`;

    const doc = createDocFromMarkdown(markdown, editor);
    const paragraphs = collectTopLevelParagraphs(doc);
    const texts = paragraphs.map((node) => node.textContent);

    expect(texts).toEqual(['First paragraph.', '', '', 'Second paragraph.', '', '', '', 'Third paragraph.']);
  });

  it('converts complete markdown document with headings and lists', () => {
    const markdown = `# Main Title

Text before list.

- Bullet item
- Another item

## Section 2

More text here.

1. Numbered item
2. Second item`;

    const doc = createDocFromMarkdown(markdown, editor);

    expect(doc).toBeDefined();
    expect(doc.type.name).toBe('doc');

    const types = collectNodeTypes(doc);
    expect(types).toContain('paragraph');
    expect(types).toContain('run');
  });

  it('keeps a multi-paragraph bullet item as one logical list entry', () => {
    const markdown = `- first paragraph

  continuation paragraph
- second bullet`;

    const doc = createDocFromMarkdown(markdown, editor);
    const paragraphs = collectTopLevelParagraphs(doc);

    const first = paragraphByText(paragraphs, 'first paragraph');
    const continuation = paragraphByText(paragraphs, 'continuation paragraph');
    const second = paragraphByText(paragraphs, 'second bullet');

    expect(first).toBeTruthy();
    expect(continuation).toBeTruthy();
    expect(second).toBeTruthy();

    expect(hasNumbering(first)).toBe(true);
    expect(hasNumbering(continuation)).toBe(false);
    expect(hasNumbering(second)).toBe(true);

    const numberedParagraphs = paragraphs.filter(hasNumbering);
    expect(numberedParagraphs).toHaveLength(2);
  });

  it('keeps a multi-paragraph ordered item as one numbered entry', () => {
    const markdown = `1. first numbered paragraph

   continuation paragraph
2. second numbered item`;

    const doc = createDocFromMarkdown(markdown, editor);
    const paragraphs = collectTopLevelParagraphs(doc);

    const first = paragraphByText(paragraphs, 'first numbered paragraph');
    const continuation = paragraphByText(paragraphs, 'continuation paragraph');
    const second = paragraphByText(paragraphs, 'second numbered item');

    expect(first).toBeTruthy();
    expect(continuation).toBeTruthy();
    expect(second).toBeTruthy();

    expect(hasNumbering(first)).toBe(true);
    expect(hasNumbering(continuation)).toBe(false);
    expect(hasNumbering(second)).toBe(true);

    const numberedParagraphs = paragraphs.filter(hasNumbering);
    expect(numberedParagraphs).toHaveLength(2);
  });
});
