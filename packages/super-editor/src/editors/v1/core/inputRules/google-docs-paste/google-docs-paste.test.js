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
    expect(parsedNode.dataset.superdocImport).toBe('true');
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
});
