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

describe('markdown to DOCX integration', () => {
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
});
