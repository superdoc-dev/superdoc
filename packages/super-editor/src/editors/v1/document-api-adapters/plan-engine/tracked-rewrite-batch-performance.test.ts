import { afterEach, describe, expect, it, vi } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { TrackDeleteMarkName, TrackInsertMarkName } from '../../extensions/track-changes/constants.js';
import { getWordChanges } from './word-diff.js';

vi.mock('./word-diff.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./word-diff.js')>();
  return {
    ...actual,
    getWordChanges: vi.fn(actual.getWordChanges),
  };
});

function makeEditor(paragraphs: string[]) {
  return initTestEditor({
    loadFromSchema: true,
    content: {
      type: 'doc',
      content: paragraphs.map((text) => ({
        type: 'paragraph',
        attrs: {},
        content: [
          {
            type: 'run',
            attrs: {},
            content: [{ type: 'text', text }],
          },
        ],
      })),
    },
    user: { name: 'Integration User', email: 'integration@example.com' },
  }).editor;
}

function markedTextByAuthor(editor: any, markName: string, authorEmail: string): string {
  const parts: string[] = [];
  editor.state.doc.descendants((node: any) => {
    if (!node.isText || !node.text) return;
    if (node.marks.some((mark: any) => mark.type.name === markName && mark.attrs.authorEmail === authorEmail)) {
      parts.push(node.text);
    }
  });
  return parts.join('');
}

describe('tracked rewrite batch performance', () => {
  let editor: any | undefined;

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
    vi.clearAllMocks();
  });

  it('skips word diff for later tracked batch rewrite targets', () => {
    editor = makeEditor(['foo bar baz', 'foo bar baz']);
    const mockedGetWordChanges = vi.mocked(getWordChanges);

    const receipt = editor.doc.mutations.apply({
      atomic: true,
      changeMode: 'tracked',
      steps: [
        {
          id: 'rewrite-all',
          op: 'text.rewrite',
          where: { by: 'select', select: { type: 'text', pattern: 'foo bar baz' }, require: 'all' },
          args: { replacement: { text: 'foo qux baz zap' } },
        },
      ],
    });

    expect(receipt.success).toBe(true);
    expect(mockedGetWordChanges).toHaveBeenCalledTimes(1);
    expect(markedTextByAuthor(editor, TrackDeleteMarkName, 'integration@example.com')).toBe('barfoo bar baz');
    expect(markedTextByAuthor(editor, TrackInsertMarkName, 'integration@example.com')).toBe('qux zapfoo qux baz zap');
  });
});
