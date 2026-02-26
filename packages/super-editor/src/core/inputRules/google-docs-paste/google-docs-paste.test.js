import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let parseResult;
let parseSpy;

const domParserMock = vi.hoisted(() => ({
  fromSchema: vi.fn(),
}));

vi.mock('prosemirror-model', () => ({
  DOMParser: domParserMock,
}));

const convertEmToPtMock = vi.hoisted(() => vi.fn((html) => html));
const sanitizeHtmlMock = vi.hoisted(() => vi.fn((html) => ({ innerHTML: html })));

vi.mock('../../InputRule.js', () => ({
  convertEmToPt: convertEmToPtMock,
  sanitizeHtml: sanitizeHtmlMock,
}));

const getNewListIdMock = vi.hoisted(() => vi.fn());
const generateNewListDefinitionMock = vi.hoisted(() => vi.fn());

vi.mock('@helpers/list-numbering-helpers.js', () => ({
  ListHelpers: {
    getNewListId: getNewListIdMock,
    generateNewListDefinition: generateNewListDefinitionMock,
  },
}));

const getLvlTextMock = vi.hoisted(() => vi.fn(() => '%1.'));

vi.mock('../../helpers/pasteListHelpers.js', () => ({
  getLvlTextForGoogleList: getLvlTextMock,
  googleNumDefMap: new Map([['decimal', 'decimal']]),
}));

import { DOMParser } from 'prosemirror-model';
import { handleGoogleDocsHtml } from './google-docs-paste.js';

describe('handleGoogleDocsHtml', () => {
  beforeEach(() => {
    parseResult = { type: 'doc' };
    vi.clearAllMocks();
    parseSpy = vi.fn(() => parseResult);
    domParserMock.fromSchema.mockReturnValue({ parse: parseSpy });
    getNewListIdMock.mockImplementation(() => 410);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('merges, flattens, and annotates Google Docs lists before dispatching', () => {
    const html = `
      <div>
        <ol start="1">
          <li aria-level="1" style="list-style-type: decimal">Item 1</li>
        </ol>
        <ol start="2">
          <li aria-level="1" style="list-style-type: decimal">Item 2</li>
        </ol>
      </div>
    `;

    const dispatch = vi.fn();
    const replaceSelectionWith = vi.fn(() => 'next');
    const editor = {
      schema: {},
      view: { dispatch },
      options: {},
    };
    const view = { state: { tr: { replaceSelectionWith } } };

    const result = handleGoogleDocsHtml(html, editor, view);

    expect(result).toBe(true);
    expect(convertEmToPtMock).toHaveBeenCalledWith(html);
    expect(sanitizeHtmlMock).toHaveBeenCalled();
    expect(getNewListIdMock).toHaveBeenCalledTimes(1);
    expect(generateNewListDefinitionMock).toHaveBeenCalledTimes(2);

    const parsedNode = parseSpy.mock.calls[0][0];
    const paragraphs = Array.from(parsedNode.querySelectorAll('p[data-num-id]'));
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].getAttribute('data-num-id')).toBe('410');
    expect(paragraphs[0].getAttribute('data-list-level')).toBe('[1]');
    expect(paragraphs[1].getAttribute('data-list-level')).toBe('[2]');
    expect(paragraphs[0].getAttribute('data-num-fmt')).toBe('decimal');
    expect(paragraphs[0].getAttribute('data-list-numbering-type')).toBe('decimal');
    expect(paragraphs[0].textContent?.trim()).toBe('Item 1');

    expect(DOMParser.fromSchema).toHaveBeenCalledWith(editor.schema);
    expect(replaceSelectionWith).toHaveBeenCalledWith(parseResult, true);
    expect(dispatch).toHaveBeenCalledWith('next');
  });

  describe('convertStyledHeadings', () => {
    function makeEditor(dispatch, replaceSelectionWith) {
      return {
        editor: { schema: {}, view: { dispatch }, options: {} },
        view: { state: { tr: { replaceSelectionWith } } },
      };
    }

    function parseHeadings(html) {
      const dispatch = vi.fn();
      const replaceSelectionWith = vi.fn(() => 'next');
      const { editor, view } = makeEditor(dispatch, replaceSelectionWith);
      handleGoogleDocsHtml(html, editor, view);
      return parseSpy.mock.calls[0][0];
    }

    it('converts bold <p> with large font-size to heading tags', () => {
      const html = `
        <p style="font-size:20pt;font-weight:700">Heading 1</p>
        <p style="font-size:16pt;font-weight:bold">Heading 2</p>
        <p style="font-size:14pt;font-weight:700">Heading 3</p>
        <p style="font-size:12pt;font-weight:700">Heading 4</p>
        <p style="font-size:11pt;font-weight:700">Heading 5</p>
      `;
      const dom = parseHeadings(html);
      expect(dom.querySelector('h1')?.textContent?.trim()).toBe('Heading 1');
      expect(dom.querySelector('h2')?.textContent?.trim()).toBe('Heading 2');
      expect(dom.querySelector('h3')?.textContent?.trim()).toBe('Heading 3');
      expect(dom.querySelector('h4')?.textContent?.trim()).toBe('Heading 4');
      expect(dom.querySelector('h5')?.textContent?.trim()).toBe('Heading 5');
    });

    it('converts when style is on a child <span> instead of the <p>', () => {
      const html = `
        <p><span style="font-size:20pt;font-weight:700">Heading from span</span></p>
      `;
      const dom = parseHeadings(html);
      expect(dom.querySelector('h1')?.textContent?.trim()).toBe('Heading from span');
      expect(dom.querySelector('p')).toBeNull();
    });

    it('does not convert non-bold paragraphs', () => {
      const html = `<p style="font-size:20pt">Not a heading</p>`;
      const dom = parseHeadings(html);
      expect(dom.querySelector('h1')).toBeNull();
      expect(dom.querySelector('p')?.textContent?.trim()).toBe('Not a heading');
    });

    it('does not convert bold paragraphs with small font-size', () => {
      const html = `<p style="font-size:9pt;font-weight:700">Small bold</p>`;
      const dom = parseHeadings(html);
      expect(dom.querySelector('h1,h2,h3,h4,h5')).toBeNull();
    });

    it('handles large font-sizes from alternate Google Docs themes (e.g. 24pt → h1)', () => {
      const html = `<p style="font-size:24pt;font-weight:700">Big Heading</p>`;
      const dom = parseHeadings(html);
      expect(dom.querySelector('h1')?.textContent?.trim()).toBe('Big Heading');
    });

    it('does not convert a paragraph where only the first of multiple spans is bold', () => {
      // Body paragraph with a bold opening word — must not become a heading.
      const html = `
        <p>
          <span style="font-size:11pt;font-weight:700">Bold word</span>
          <span style="font-size:11pt;">rest of text</span>
        </p>
      `;
      const dom = parseHeadings(html);
      expect(dom.querySelector('h1,h2,h3,h4,h5')).toBeNull();
    });

    it('does not convert <p> elements inside <li> to avoid corrupting list structure', () => {
      const html = `
        <ul>
          <li><p style="font-size:20pt;font-weight:700">List item</p></li>
        </ul>
      `;
      const dom = parseHeadings(html);
      expect(dom.querySelector('h1')).toBeNull();
      expect(dom.querySelector('p[data-num-id]')).not.toBeNull();
    });

    it('converts when font-size is on <p> but font-weight is only on the child <span>', () => {
      const html = `
        <p style="font-size:20pt"><span style="font-weight:700">Split style heading</span></p>
      `;
      const dom = parseHeadings(html);
      expect(dom.querySelector('h1')?.textContent?.trim()).toBe('Split style heading');
    });

    it('preserves attributes from the original <p> on the new heading element', () => {
      const html = `<p style="font-size:20pt;font-weight:700" data-custom="yes">With attr</p>`;
      const dom = parseHeadings(html);
      expect(dom.querySelector('h1')?.getAttribute('data-custom')).toBe('yes');
    });
  });
});
