import { describe, it, expect } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import { enumerateRevisionCapableStories } from './enumerate-stories.js';

function makeEditor(converter?: Record<string, unknown>): Editor {
  return { converter } as unknown as Editor;
}

describe('enumerateRevisionCapableStories', () => {
  it('returns only the body when the editor has no converter', () => {
    expect(enumerateRevisionCapableStories(makeEditor())).toEqual([{ kind: 'story', storyType: 'body' }]);
  });

  it('includes headers and footers as part refs in converter-order', () => {
    const editor = makeEditor({
      headers: { rId1: {}, rId2: {} },
      footers: { rId5: {} },
    });

    expect(enumerateRevisionCapableStories(editor)).toEqual([
      { kind: 'story', storyType: 'body' },
      { kind: 'story', storyType: 'headerFooterPart', refId: 'rId1' },
      { kind: 'story', storyType: 'headerFooterPart', refId: 'rId2' },
      { kind: 'story', storyType: 'headerFooterPart', refId: 'rId5' },
    ]);
  });

  it('includes revision-capable footnotes and endnotes', () => {
    const editor = makeEditor({
      footnotes: [{ id: 1 }, { id: '7' }],
      endnotes: [{ id: 2 }],
    });

    expect(enumerateRevisionCapableStories(editor)).toEqual([
      { kind: 'story', storyType: 'body' },
      { kind: 'story', storyType: 'footnote', noteId: '1' },
      { kind: 'story', storyType: 'footnote', noteId: '7' },
      { kind: 'story', storyType: 'endnote', noteId: '2' },
    ]);
  });

  it('skips notes with negative ids (separator / continuationSeparator)', () => {
    const editor = makeEditor({
      footnotes: [{ id: -1 }, { id: 0 }, { id: 3 }],
      endnotes: [{ id: '-2' }, { id: '4' }],
    });

    expect(enumerateRevisionCapableStories(editor)).toEqual([
      { kind: 'story', storyType: 'body' },
      { kind: 'story', storyType: 'footnote', noteId: '0' },
      { kind: 'story', storyType: 'footnote', noteId: '3' },
      { kind: 'story', storyType: 'endnote', noteId: '4' },
    ]);
  });

  it('skips notes missing an id rather than emitting "undefined" locators', () => {
    const editor = makeEditor({
      footnotes: [{ id: undefined } as unknown as { id: string }, { id: 1 }],
      endnotes: [null as unknown as { id: string }, { id: 2 }],
    });

    expect(enumerateRevisionCapableStories(editor)).toEqual([
      { kind: 'story', storyType: 'body' },
      { kind: 'story', storyType: 'footnote', noteId: '1' },
      { kind: 'story', storyType: 'endnote', noteId: '2' },
    ]);
  });
});
