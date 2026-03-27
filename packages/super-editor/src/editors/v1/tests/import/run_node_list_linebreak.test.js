import { describe, it, expect, beforeAll } from 'vitest';
import { loadTestDataForEditorTests, initTestEditor } from '../helpers/helpers.js';

const FILENAME = 'multiple-nodes-in-list.docx';

describe('[multiple-nodes-in-list.docx] run node importer regression', () => {
  let docx;
  let media;
  let mediaFiles;
  let fonts;

  beforeAll(async () => ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(FILENAME)));

  it('preserves line breaks and surrounding text when a run contains multiple child nodes', () => {
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });
    const { doc } = editor.state;

    let paragraph = null;
    doc.descendants((node) => {
      if (node.type.name === 'paragraph' && !paragraph) {
        paragraph = node;
      }
      return !paragraph;
    });

    expect(paragraph, 'expected to find the first paragraph node').toBeTruthy();

    const runChildren = [];
    paragraph.forEach((child) => {
      runChildren.push(child);
    });

    expect(runChildren.every((child) => child.type.name === 'run')).toBe(true);

    const inlineChildren = [];
    runChildren.forEach((runChild) => {
      runChild.forEach((inlineChild) => {
        inlineChildren.push(inlineChild);
      });
    });

    const sequence = inlineChildren.map((child) => child.type.name ?? child.type).join('|');
    expect(sequence).toBe('text|lineBreak|text|lineBreak|lineBreak|text');

    const lineBreakNodes = inlineChildren.filter((child) => child.type.name === 'lineBreak');
    expect(lineBreakNodes.length).toBeGreaterThanOrEqual(3);

    const textNodes = inlineChildren.filter((child) => child.type.name === 'text');
    expect(textNodes[0].text).toBe('One');
    expect(textNodes.at(-1).text).toBe('after space');

    const textContent = doc.textBetween(0, doc.content.size, '\n', '\n');
    expect(textContent).toContain('One\ntest');
    expect(textContent).toContain('test\n\nafter space');
  });
});
