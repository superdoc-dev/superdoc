import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
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

describe('markdown import', () => {
  it('creates a ProseMirror doc from markdown headings', () => {
    const doc = createDocFromMarkdown('# Hello', editor);
    expect(doc).toBeDefined();
    expect(doc.type.name).toBe('doc');
    expect(doc.childCount).toBeGreaterThan(0);
  });

  it('surfaces unsupported content through the callback', () => {
    const onUnsupportedContent = vi.fn();
    createDocFromMarkdown('<video src="test.mp4"></video>', editor, {
      onUnsupportedContent,
    });

    expect(onUnsupportedContent).toHaveBeenCalled();
    expect(onUnsupportedContent.mock.calls[0][0]).toEqual(
      expect.arrayContaining([expect.objectContaining({ tagName: 'VIDEO' })]),
    );
  });
});
