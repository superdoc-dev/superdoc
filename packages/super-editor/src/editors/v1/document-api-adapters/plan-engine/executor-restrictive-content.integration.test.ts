import { afterEach, describe, expect, it } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { executeTextInsert } from './executor.ts';

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

describe('executeTextInsert: restrictive parent content (SD-2567 follow-up)', () => {
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
