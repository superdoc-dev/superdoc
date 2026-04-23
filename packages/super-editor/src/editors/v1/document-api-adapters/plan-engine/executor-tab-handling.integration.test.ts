import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { executeTextInsert } from './executor.ts';
import { writeWrapper } from './plan-wrappers.ts';
import { registerBuiltInExecutors } from './register-executors.js';
import { readTextAtResolvedRange } from '../helpers/text-mutation-resolution.js';

function makeEditorWithTotalPageCount() {
  return initTestEditor({
    loadFromSchema: true,
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {},
          content: [
            {
              type: 'run',
              attrs: {},
              content: [
                {
                  type: 'total-page-number',
                  attrs: {},
                  content: [{ type: 'text', text: '7' }],
                },
              ],
            },
          ],
        },
      ],
    },
    user: { name: 'Integration User', email: 'integration@example.com' },
  }).editor;
}

function findTotalPageNumberPos(editor: any): number {
  let pos: number | undefined;
  editor.state.doc.descendants((node: any, nodePos: number) => {
    if (pos !== undefined) return false;
    if (node.type.name === 'total-page-number') {
      pos = nodePos;
      return false;
    }
    return true;
  });
  if (pos === undefined) throw new Error('total-page-number node not found');
  return pos;
}

function findTabNodes(editor: any): any[] {
  const hits: any[] = [];
  editor.state.doc.descendants((node: any) => {
    if (node.type.name === 'tab') hits.push(node);
  });
  return hits;
}

describe('executeTextInsert: restrictive parent content', () => {
  let editor: any | undefined;

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  it('asserts the real total-page-number schema rejects tab nodes', () => {
    editor = makeEditorWithTotalPageCount();
    const totalPageNumberType = editor.state.schema.nodes['total-page-number'];
    const tabType = editor.state.schema.nodes.tab;
    expect(totalPageNumberType).toBeDefined();
    expect(tabType).toBeDefined();
    expect(totalPageNumberType.contentMatch.matchType(tabType)).toBeNull();
  });

  it('inserts raw \\t text into total-page-number without throwing and without creating a tab node', () => {
    editor = makeEditorWithTotalPageCount();

    const nodePos = findTotalPageNumberPos(editor);
    // Position inside the total-page-number, just before its existing '7' text.
    const innerPos = nodePos + 1;

    const tr = editor.state.tr;
    const target = {
      kind: 'range',
      stepId: 'step-1',
      op: 'text.insert',
      blockId: 'total-page-number-1',
      from: 0,
      to: 0,
      absFrom: innerPos,
      absTo: innerPos,
      text: '',
      marks: [],
    } as any;

    const step = {
      id: 'insert-tab-into-total-page-number',
      op: 'text.insert',
      where: { by: 'ref', ref: 'ignored' },
      args: { position: 'before', content: { text: 'a\tb' } },
    } as any;

    const mapping = { map: (pos: number) => pos } as any;

    expect(() => executeTextInsert(editor, tr, target, step, mapping)).not.toThrow();
    editor.dispatch(tr);

    const totalPageNumber = editor.state.doc.nodeAt(nodePos);
    expect(totalPageNumber?.type.name).toBe('total-page-number');
    expect(totalPageNumber?.textContent).toBe('a\tb7');
    expect(findTabNodes(editor)).toHaveLength(0);
  });
});

function makeEditorWithParagraph(text: string) {
  return initTestEditor({
    loadFromSchema: true,
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {},
          content: [
            {
              type: 'run',
              attrs: {},
              content: [{ type: 'text', text }],
            },
          ],
        },
      ],
    },
    user: { name: 'Integration User', email: 'integration@example.com' },
  }).editor;
}

describe('tab-aware insert + read round-trip', () => {
  let editor: any | undefined;

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  it('promotes \\t to a tab node when inserted inside a paragraph and reads it back as \\t', () => {
    editor = makeEditorWithParagraph('hello');

    // Resolve the position right after "hello" but before the paragraph close.
    const textNodePos = (() => {
      let found: number | undefined;
      editor.state.doc.descendants((node: any, pos: number) => {
        if (found !== undefined) return false;
        if (node.isText) {
          found = pos + node.nodeSize;
          return false;
        }
        return true;
      });
      if (found === undefined) throw new Error('text node not found');
      return found;
    })();

    const tr = editor.state.tr;
    const target = {
      kind: 'range',
      stepId: 'step-1',
      op: 'text.insert',
      blockId: 'p1',
      from: 0,
      to: 0,
      absFrom: textNodePos,
      absTo: textNodePos,
      text: '',
      marks: [],
    } as any;
    const step = {
      id: 'insert-tab-in-paragraph',
      op: 'text.insert',
      where: { by: 'ref', ref: 'ignored' },
      args: { position: 'before', content: { text: '\tworld' } },
    } as any;

    executeTextInsert(editor, tr, target, step, { map: (pos: number) => pos } as any);
    editor.dispatch(tr);

    // One real tab node now exists in the doc.
    const tabs = findTabNodes(editor);
    expect(tabs).toHaveLength(1);

    // Reading the paragraph back via the write-adapter's reader surfaces \t, not \ufffc.
    const paragraph = editor.state.doc.firstChild;
    const range = { from: 1, to: paragraph.nodeSize - 1 };
    const text = readTextAtResolvedRange(editor, range as any);
    expect(text).toBe('hello\tworld');
  });

  it('carries surrounding run marks onto the tab node so the exporter wraps <w:tab/> in matching <w:rPr>', () => {
    editor = makeEditorWithParagraph('plain');

    // Pick a position inside the run's text, then run executeTextInsert with a bold mark
    // active so buildTextWithTabs sees it and must hand it to the tab node too.
    const boldMark = editor.state.schema.marks.bold?.create();
    expect(boldMark).toBeDefined();

    const insertPos = (() => {
      let found: number | undefined;
      editor.state.doc.descendants((node: any, pos: number) => {
        if (found !== undefined) return false;
        if (node.isText) {
          found = pos + node.nodeSize;
          return false;
        }
        return true;
      });
      if (found === undefined) throw new Error('text node not found');
      return found;
    })();

    const tr = editor.state.tr;
    const target = {
      kind: 'range',
      stepId: 'step-1',
      op: 'text.insert',
      blockId: 'p1',
      from: 0,
      to: 0,
      absFrom: insertPos,
      absTo: insertPos,
      text: '',
      marks: [],
    } as any;
    const step = {
      id: 'insert-bold-tab',
      op: 'text.insert',
      where: { by: 'ref', ref: 'ignored' },
      args: {
        position: 'before',
        content: { text: 'left\tright' },
        style: { inline: { mode: 'set', setMarks: { bold: 'on' } } },
      },
    } as any;

    executeTextInsert(editor, tr, target, step, { map: (pos: number) => pos } as any);
    editor.dispatch(tr);

    const tabs = findTabNodes(editor);
    expect(tabs).toHaveLength(1);
    const tabNode = tabs[0];
    // The tab node carries the bold mark so tab-translator.js emits matching run properties.
    expect(tabNode.marks.some((m: any) => m.type.name === 'bold')).toBe(true);
  });
});

describe('writeWrapper: untargeted doc.insert (end-to-end doc-api path) (SD-2567)', () => {
  let editor: any | undefined;

  beforeAll(() => {
    registerBuiltInExecutors();
  });

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  it('untargeted insert with \\t produces real tab nodes via writeWrapper → executeTextInsert', () => {
    editor = makeEditorWithParagraph('seed');

    // This mirrors exactly what ed.doc.insert({ value: 'left\tright' }) does for
    // an untargeted text insert: document-api → writeAdapter.write → writeWrapper.
    const receipt = writeWrapper(editor, { kind: 'insert', text: 'left\tright' } as any);

    expect(receipt.success).toBe(true);
    const tabs = findTabNodes(editor);
    expect(tabs.length).toBeGreaterThanOrEqual(1);
  });

  it('inherits paragraph-level runProperties.bold onto the inserted tab (and surrounding text)', () => {
    // Paragraph has a bold default at pPr > rPr level — just like the DOCX
    // fixture in the user's manual-QA repro. super-editor encodes this on the
    // paragraph node rather than as PM text marks.
    editor = initTestEditor({
      loadFromSchema: true,
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: { runProperties: { bold: true } },
            },
            content: [],
          },
        ],
      },
      user: { name: 'Integration User', email: 'integration@example.com' },
    }).editor;

    writeWrapper(editor, { kind: 'insert', text: 'left\tright' } as any);

    const tabs = findTabNodes(editor);
    expect(tabs.length).toBeGreaterThanOrEqual(1);
    const tabNode = tabs[0];
    // The tab carries bold, so tab-translator.js emits <w:r><w:rPr><w:b/></w:rPr><w:tab/></w:r>.
    expect(tabNode.marks.some((m: any) => m.type.name === 'bold')).toBe(true);

    // Both text halves should also be bold when wrapped by the run plugin.
    let boldTextCount = 0;
    let plainTextCount = 0;
    editor.state.doc.descendants((node: any) => {
      if (!node.isText) return;
      if (node.marks.some((m: any) => m.type.name === 'bold')) boldTextCount++;
      else plainTextCount++;
    });
    expect(boldTextCount).toBeGreaterThanOrEqual(2);
    expect(plainTextCount).toBe(0);
  });
});
