import { describe, it, expect } from 'vitest';
import { getTextContent, computeDiff, extractParagraphs, getLCSdiff } from './computeDiff';

import { Editor } from '@core/Editor.js';
import { getStarterExtensions } from '@extensions/index.js';
import { getTestDataAsBuffer } from '@tests/export/export-helpers/export-helpers.js';

export const getDocument = async (name) => {
  const buffer = await getTestDataAsBuffer(name);
  const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

  const editor = new Editor({
    isHeadless: true,
    extensions: getStarterExtensions(),
    documentId: 'test-doc',
    content: docx,
    mode: 'docx',
    media,
    mediaFiles,
    fonts,
    annotations: true,
  });

  return editor.state.doc;
};

describe('Diff', () => {
  it('Compares two documents and identifies added, deleted, and modified paragraphs', async () => {
    const docBefore = await getDocument('diff_before.docx');
    const docAfter = await getDocument('diff_after.docx');

    const diffs = computeDiff(docBefore, docAfter);
    console.log(JSON.stringify(diffs, null, 2));
  });
});

describe('extractParagraphs', () => {
  it('collects all paragraph nodes keyed by their paraId', () => {
    const firstParagraph = {
      type: { name: 'paragraph' },
      attrs: { paraId: 'para-1' },
      textContent: 'First paragraph',
    };
    const nonParagraph = {
      type: { name: 'heading' },
      attrs: { paraId: 'heading-1' },
    };
    const secondParagraph = {
      type: { name: 'paragraph' },
      attrs: { paraId: 'para-2' },
      textContent: 'Second paragraph',
    };
    const pmDoc = {
      descendants: (callback) => {
        callback(firstParagraph, 0);
        callback(nonParagraph, 5);
        callback(secondParagraph, 10);
      },
    };

    const paragraphs = extractParagraphs(pmDoc);

    expect(paragraphs.size).toBe(2);
    expect(paragraphs.get('para-1')).toEqual({ node: firstParagraph, pos: 0 });
    expect(paragraphs.get('para-2')).toEqual({ node: secondParagraph, pos: 10 });
  });

  it('generates unique IDs when paragraph nodes are missing paraId', () => {
    const firstParagraph = {
      type: { name: 'paragraph' },
      attrs: {},
      textContent: 'Anonymous first',
    };
    const secondParagraph = {
      type: { name: 'paragraph' },
      attrs: undefined,
      textContent: 'Anonymous second',
    };
    const pmDoc = {
      descendants: (callback) => {
        callback(firstParagraph, 2);
        callback(secondParagraph, 8);
      },
    };

    const paragraphs = extractParagraphs(pmDoc);
    const entries = [...paragraphs.entries()];
    const firstEntry = entries.find(([, value]) => value.node === firstParagraph);
    const secondEntry = entries.find(([, value]) => value.node === secondParagraph);

    expect(paragraphs.size).toBe(2);
    expect(firstEntry?.[0]).toBeTruthy();
    expect(secondEntry?.[0]).toBeTruthy();
    expect(firstEntry?.[0]).not.toBe(secondEntry?.[0]);
    expect(firstEntry?.[1].pos).toBe(2);
    expect(secondEntry?.[1].pos).toBe(8);
  });
});

describe('getTextContent', () => {
  it('Handles basic text nodes', () => {
    const mockParagraph = {
      content: {
        size: 5,
      },
      nodesBetween: (from, to, callback) => {
        callback({ isText: true, text: 'Hello' }, 0);
      },
    };

    const result = getTextContent(mockParagraph);
    expect(result.text).toBe('Hello');
    expect(result.resolvePosition(0)).toBe(1);
    expect(result.resolvePosition(4)).toBe(5);
  });

  it('Handles leaf nodes with leafText', () => {
    const mockParagraph = {
      content: {
        size: 4,
      },
      nodesBetween: (from, to, callback) => {
        callback({ isLeaf: true, type: { spec: { leafText: () => 'Leaf' } } }, 0);
      },
    };

    const result = getTextContent(mockParagraph);
    expect(result.text).toBe('Leaf');
    expect(result.resolvePosition(0)).toBe(1);
    expect(result.resolvePosition(3)).toBe(4);
  });

  it('Handles mixed content', () => {
    const mockParagraph = {
      content: {
        size: 9,
      },
      nodesBetween: (from, to, callback) => {
        callback({ isText: true, text: 'Hello' }, 0);
        callback({ isLeaf: true, type: { spec: { leafText: () => 'Leaf' } } }, 5);
      },
    };

    const result = getTextContent(mockParagraph);
    expect(result.text).toBe('HelloLeaf');
    expect(result.resolvePosition(0)).toBe(1);
    expect(result.resolvePosition(5)).toBe(6);
    expect(result.resolvePosition(9)).toBe(10);
  });

  it('Handles empty content', () => {
    const mockParagraph = {
      content: {
        size: 0,
      },
      nodesBetween: () => {},
    };

    const result = getTextContent(mockParagraph);
    expect(result.text).toBe('');
    expect(result.resolvePosition(0)).toBe(1);
  });

  it('Handles nested nodes', () => {
    const mockParagraph = {
      content: {
        size: 6,
      },
      nodesBetween: (from, to, callback) => {
        callback({ isText: true, text: 'Nested' }, 0);
      },
    };

    const result = getTextContent(mockParagraph);
    expect(result.text).toBe('Nested');
    expect(result.resolvePosition(0)).toBe(1);
    expect(result.resolvePosition(6)).toBe(7);
  });
});

describe('getLCSdiff', () => {
  it('returns an empty diff list when both strings are identical', () => {
    const resolver = () => 0;

    const diffs = getLCSdiff('unchanged', 'unchanged', resolver);

    expect(diffs).toEqual([]);
  });

  it('detects text insertions and maps them to resolver positions', () => {
    const resolver = (index) => index + 10;

    const diffs = getLCSdiff('abc', 'abXc', resolver);

    expect(diffs).toEqual([
      {
        type: 'addition',
        startIdx: 12,
        endIdx: 12,
        text: 'X',
      },
    ]);
  });

  it('detects deletions and additions in the same diff sequence', () => {
    const resolver = (index) => index + 5;

    const diffs = getLCSdiff('abcd', 'abXYd', resolver);

    expect(diffs).toEqual([
      {
        type: 'deletion',
        startIdx: 7,
        endIdx: 8,
        text: 'c',
      },
      {
        type: 'addition',
        startIdx: 7,
        endIdx: 7,
        text: 'XY',
      },
    ]);
  });
});
