import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let parseResult;
let parseSpy;

const domParserMock = vi.hoisted(() => ({
  fromSchema: vi.fn(),
}));

vi.mock('prosemirror-model', () => ({
  DOMParser: domParserMock,
  Fragment: {
    fromArray: (content) => ({ content }),
  },
}));

const convertEmToPtMock = vi.hoisted(() => vi.fn((html) => html));
const cleanHtmlMock = vi.hoisted(() => vi.fn((html) => html));
const handleHtmlPasteMock = vi.hoisted(() => vi.fn(() => false));

vi.mock('../../InputRule.js', () => ({
  convertEmToPt: convertEmToPtMock,
  cleanHtmlUnnecessaryTags: cleanHtmlMock,
  handleHtmlPaste: handleHtmlPasteMock,
}));

const normalizeLvlTextCharMock = vi.hoisted(() => vi.fn((value) => value || '%1.'));

vi.mock('@superdoc/common/list-numbering', () => ({
  normalizeLvlTextChar: normalizeLvlTextCharMock,
}));

const getNewListIdMock = vi.hoisted(() => vi.fn());
const generateNewListDefinitionMock = vi.hoisted(() => vi.fn());

vi.mock('@helpers/list-numbering-helpers.js', () => ({
  ListHelpers: {
    getNewListId: getNewListIdMock,
    generateNewListDefinition: generateNewListDefinitionMock,
  },
}));

const decodeRPrFromMarksMock = vi.hoisted(() => vi.fn(() => ({ rPr: 'from-marks' })));

vi.mock('@converter/styles.js', () => ({
  decodeRPrFromMarks: decodeRPrFromMarksMock,
}));

import { DOMParser } from 'prosemirror-model';
import { handleDocxPaste, wrapTextsInRuns } from './docx-paste.js';

describe('handleDocxPaste', () => {
  beforeEach(() => {
    parseResult = { type: 'doc' };
    vi.clearAllMocks();
    parseSpy = vi.fn(() => parseResult);
    domParserMock.fromSchema.mockReturnValue({ parse: parseSpy });
    getNewListIdMock.mockImplementation(() => 200);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to handleHtmlPaste when converter is missing', () => {
    const editor = { converter: null };
    const view = {};
    const html = '<p>plain</p>';

    handleDocxPaste(html, editor, view);

    expect(handleHtmlPasteMock).toHaveBeenCalledWith(html, editor);
  });

  it('parses DOCX-specific markup and dispatches paragraph-based list content', () => {
    const html = `
      <html>
        <head>
          <style>
            .MsoNormal {
              margin-left: 20pt;
              margin-top: 4pt;
              margin-bottom: 8pt;
              font-size: 12pt;
              font-family: "Calibri";
            }
            .MsoListParagraph {
              margin-left: 36pt;
              text-indent: -18pt;
              font-size: 13pt;
              font-family: "Calibri";
            }
            @list l0:level1 lfo1 {
              mso-level-number-format: decimal;
              mso-level-text: "%1.";
              margin-left: 36pt;
            }
          </style>
        </head>
        <body>
          <ol type="1" start="1">
            <li class="MsoListParagraph" style="mso-list:l0 level1 lfo1;font-size:13pt;font-family:Calibri">
              <span style="font-size:13pt;font-family:Calibri">First item</span>
            </li>
          </ol>
          <p class="MsoListParagraph" data-sd-block-id="copied-block-id" style="mso-list:l0 level1 lfo1;font-size:13pt;font-family:Calibri">
            <!--[if !supportLists]--><span style="font-family:Arial;font-size:12pt">2.</span><!--[endif]-->
            Second item
          </p>
        </body>
      </html>
    `;

    const dispatch = vi.fn();
    const replaceSelectionWith = vi.fn(() => 'next-tr');
    const editor = {
      schema: {},
      converter: { convertedXml: '<xml />' },
      view: { dispatch },
    };
    const view = { state: { tr: { replaceSelectionWith } } };

    const result = handleDocxPaste(html, editor, view);

    expect(result).toBe(true);
    expect(convertEmToPtMock).toHaveBeenCalledWith(html);
    expect(cleanHtmlMock).toHaveBeenCalled();

    expect(getNewListIdMock).toHaveBeenCalledTimes(1);
    expect(generateNewListDefinitionMock).toHaveBeenCalledTimes(2);

    expect(parseSpy).toHaveBeenCalledTimes(1);
    const parsedNode = parseSpy.mock.calls[0][0];
    const generatedParagraphs = Array.from(parsedNode.querySelectorAll('p[data-list-level]'));
    expect(generatedParagraphs).toHaveLength(2);
    expect(parsedNode.querySelector('[data-sd-block-id]')).toBeNull();
    expect(generatedParagraphs[0].getAttribute('data-num-id')).toBe('200');
    expect(generatedParagraphs[0].getAttribute('data-list-level')).toBe('[1]');
    expect(generatedParagraphs[1].getAttribute('data-list-level')).toBe('[2]');
    expect(generatedParagraphs[0].getAttribute('data-indent')).toBe('{"left":720,"hanging":360}');
    expect(generatedParagraphs[0].getAttribute('data-spacing')).toBe('{"after":160,"before":80}');
    expect(generatedParagraphs[0].style.fontSize).toBe('13pt');
    expect(generatedParagraphs[0].style.fontFamily).toContain('Calibri');

    expect(DOMParser.fromSchema).toHaveBeenCalledWith(editor.schema);
    expect(replaceSelectionWith).toHaveBeenCalledWith(parseResult, true);
    expect(dispatch).toHaveBeenCalledWith('next-tr');
  });
});

describe('wrapTextsInRuns', () => {
  const makeNode = ({ name, children = [], type }) => {
    const nodeType = type || { name };
    return {
      isText: false,
      type: nodeType,
      childCount: children.length,
      children,
      forEach: (fn) => children.forEach(fn),
      copy: (fragment) => makeNode({ name, children: fragment.content || fragment, type: nodeType }),
    };
  };

  const makeText = (text, marks = []) => ({
    isText: true,
    text,
    marks,
  });

  it('returns the original doc when run type is missing', () => {
    const doc = makeNode({ name: 'doc' });

    const result = wrapTextsInRuns(doc);

    expect(result).toBe(doc);
    expect(decodeRPrFromMarksMock).not.toHaveBeenCalled();
  });

  it('wraps non-run text nodes into run nodes and leaves existing runs untouched', () => {
    const runType = {
      name: 'run',
      create: vi.fn((attrs, content) => makeNode({ name: 'run', children: content, type: { name: 'run' }, attrs })),
    };
    const docType = { name: 'doc', schema: { nodes: { run: runType } } };
    const textOutsideRun = makeText('Hello', [{ type: 'bold' }]);
    const textInsideRun = makeText('Inside', []);
    const existingRun = makeNode({ name: 'run', children: [textInsideRun], type: { name: 'run' } });
    const paragraph = makeNode({ name: 'paragraph', children: [textOutsideRun, existingRun] });
    const doc = makeNode({ name: 'doc', children: [paragraph], type: docType });

    const wrappedDoc = wrapTextsInRuns(doc);

    expect(wrappedDoc).not.toBe(doc);
    expect(runType.create).toHaveBeenCalledTimes(1);
    expect(runType.create).toHaveBeenCalledWith({ runProperties: { rPr: 'from-marks' } }, [textOutsideRun]);
    expect(decodeRPrFromMarksMock).toHaveBeenCalledWith(textOutsideRun.marks);

    const wrappedParagraph = wrappedDoc.children[0];
    expect(wrappedParagraph.children[0].type.name).toBe('run');
    expect(wrappedParagraph.children[1]).toBe(existingRun);
  });
});
