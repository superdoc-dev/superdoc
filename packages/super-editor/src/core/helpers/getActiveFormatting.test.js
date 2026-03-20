import { describe, it, expect, mock, afterEach } from 'bun:test';
const getMarksFromSelectionMock = mock(() => [
  { type: { name: 'bold' }, attrs: {} },
  { type: { name: 'textStyle' }, attrs: { textColor: '#f00' } },
]);

const findMarkMock = mock(() => ({ from: 0, to: 10, attrs: { href: 'https://example.com' } }));

mock.module('./getMarksFromSelection.js', () => ({
  getMarksFromSelection: getMarksFromSelectionMock,
}));

mock.module('./findMark.js', () => ({
  findMark: findMarkMock,
}));

const { getActiveFormatting } = await import('./getActiveFormatting.js');

describe('getActiveFormatting', () => {
  afterEach(() => {});

  it('aggregates marks, mark attributes, link information, and stored formatting', () => {
    const selection = {
      from: 5,
      to: 5,
      empty: true,
      $head: {
        marks: () => [],
        parent: {
          attrs: {
            marksAttrs: [
              { type: 'italic', attrs: {} },
              { type: 'textStyle', attrs: { textHighlight: '#0f0' } },
            ],
          },
        },
      },
    };

    const state = {
      selection,
      storedMarks: [],
      schema: {
        marks: {
          link: { name: 'link' },
        },
      },
      doc: {
        nodesBetween: (_from, _to, callback) => {
          callback({ attrs: { headingLevel: 2, paragraphSpacing: 10 } });
        },
      },
    };

    const editor = {
      state,
      storage: {
        formatCommands: { storedStyle: { bold: true } },
      },
      converter: {},
    };

    const result = getActiveFormatting(editor);

    expect(getMarksFromSelectionMock).not.toHaveBeenCalled();
    expect(findMarkMock).toHaveBeenCalled();

    expect(result).toEqual(
      expect.arrayContaining([
        { name: 'italic', attrs: {} },
        { name: 'textHighlight', attrs: { textHighlight: '#0f0' } },
        { name: 'highlight', attrs: { color: '#0f0' } },
        { name: 'link', attrs: { href: 'https://example.com' } },
        { name: 'headingLevel', attrs: { headingLevel: 2 } },
        { name: 'copyFormat', attrs: true },
      ]),
    );
  });
});
