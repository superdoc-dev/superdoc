import { describe, expect, it, vi } from 'vitest';
import {
  collectReferencedImageMediaForClipboard,
  mergeSuperdocClipboardMediaIntoEditor,
  SUPERDOC_MEDIA_MIME,
} from './superdocClipboardSlice.js';

describe('superdocClipboardSlice image media', () => {
  it('collectReferencedImageMediaForClipboard gathers paths from slice JSON', () => {
    const editor = {
      storage: {
        image: {
          media: {
            'word/media/a.png': 'data:image/png;base64,AAA',
            'word/media/b.png': 'data:image/png;base64,BBB',
          },
        },
      },
    };

    const sliceJson = JSON.stringify({
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hi' },
            {
              type: 'image',
              attrs: { src: 'word/media/a.png' },
            },
          ],
        },
      ],
      openStart: 0,
      openEnd: 0,
    });

    const out = collectReferencedImageMediaForClipboard(sliceJson, editor);
    expect(JSON.parse(out)).toEqual({ 'word/media/a.png': 'data:image/png;base64,AAA' });
  });

  it('mergeSuperdocClipboardMediaIntoEditor merges into storage and ydoc media map', () => {
    const ySet = vi.fn();
    const editor = {
      storage: {
        image: {
          media: { 'word/media/existing.png': 'data:old' },
        },
      },
      options: {
        ydoc: {
          getMap: () => ({ set: ySet }),
        },
      },
    };

    const clipboardData = {
      getData: (mime) =>
        mime === SUPERDOC_MEDIA_MIME ? JSON.stringify({ 'word/media/new.png': 'data:image/png;base64,XX' }) : '',
    };

    mergeSuperdocClipboardMediaIntoEditor(editor, clipboardData);

    expect(editor.storage.image.media['word/media/new.png']).toBe('data:image/png;base64,XX');
    expect(editor.storage.image.media['word/media/existing.png']).toBe('data:old');
    expect(ySet).toHaveBeenCalledWith('word/media/new.png', 'data:image/png;base64,XX');
  });
});
