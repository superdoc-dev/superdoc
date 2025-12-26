import { describe, it, expect } from 'vitest';
import { diffParagraphs } from './paragraph-diffing.js';

const buildTextRuns = (text, runAttrs = {}) =>
  text.split('').map((char) => ({ char, runAttrs: JSON.stringify(runAttrs) }));

const createParagraph = (text, attrs = {}, options = {}) => {
  const { pos = 0, textAttrs = {} } = options;
  const textRuns = buildTextRuns(text, textAttrs);

  return {
    node: { attrs },
    pos,
    text: textRuns,
    resolvePosition: (index) => pos + 1 + index,
    get fullText() {
      return textRuns.map((c) => c.char).join('');
    },
  };
};

describe('diffParagraphs', () => {
  it('treats similar paragraphs without IDs as modifications', () => {
    const oldParagraphs = [createParagraph('Hello world from ProseMirror.')];
    const newParagraphs = [createParagraph('Hello brave new world from ProseMirror.')];

    const diffs = diffParagraphs(oldParagraphs, newParagraphs);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].action).toBe('modified');
    expect(diffs[0].contentDiff.length).toBeGreaterThan(0);
  });

  it('keeps unrelated paragraphs as deletion + addition', () => {
    const oldParagraphs = [createParagraph('Alpha paragraph with some text.')];
    const newParagraphs = [createParagraph('Zephyr quickly jinxed the new passage.')];

    const diffs = diffParagraphs(oldParagraphs, newParagraphs);

    expect(diffs).toHaveLength(2);
    expect(diffs[0].action).toBe('deleted');
    expect(diffs[1].action).toBe('added');
  });

  it('detects modifications even when Myers emits grouped deletes and inserts', () => {
    const oldParagraphs = [
      createParagraph('Original introduction paragraph that needs tweaks.'),
      createParagraph('Paragraph that will be removed.'),
    ];
    const newParagraphs = [
      createParagraph('Original introduction paragraph that now has tweaks.'),
      createParagraph('Completely different replacement paragraph.'),
    ];

    const diffs = diffParagraphs(oldParagraphs, newParagraphs);

    expect(diffs).toHaveLength(3);
    expect(diffs[0].action).toBe('modified');
    expect(diffs[0].contentDiff.length).toBeGreaterThan(0);
    expect(diffs[1].action).toBe('deleted');
    expect(diffs[2].action).toBe('added');
  });
});
