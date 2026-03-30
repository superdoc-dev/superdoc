import { describe, it, expect, beforeAll } from 'vitest';
import { loadTestDataForEditorTests, initTestEditor } from '../helpers/helpers.js';

describe('sdpr_titleonly font size import', () => {
  const filename = 'sdpr-titleonly.docx';
  let docx, media, mediaFiles, fonts, editor;

  beforeAll(async () => ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename)));

  it('imports w:sz=32 as 16pt on first text node', () => {
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

    const { doc } = editor.state;
    // Find the first paragraph text node
    let foundText = null;
    doc.descendants((node) => {
      if (!foundText && node.type.name === 'text' && node.text && node.text.includes('Press release')) {
        foundText = node;
        return false;
      }
      return true;
    });

    expect(foundText, 'expected to find text "Press release"').toBeTruthy();
    const textStyle = foundText.marks.find((m) => m.type.name === 'textStyle');
    expect(textStyle, 'expected a textStyle mark on text').toBeTruthy();
    expect(textStyle?.attrs?.fontSize).toBe('16pt');
  });
});
