import { describe, expect, it, vi } from 'vitest';
import {
  collectReferencedImageMediaForClipboard,
  applySuperdocClipboardMedia,
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

  it('applySuperdocClipboardMedia merges into storage and ydoc media map', () => {
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

    applySuperdocClipboardMedia(editor, clipboardData, null);

    expect(editor.storage.image.media['word/media/new.png']).toBe('data:image/png;base64,XX');
    expect(editor.storage.image.media['word/media/existing.png']).toBe('data:old');
    expect(ySet).toHaveBeenCalledWith('word/media/new.png', 'data:image/png;base64,XX');
  });

  it('applySuperdocClipboardMedia avoids overwriting a different image at the same path', () => {
    const editor = {
      storage: {
        image: {
          media: {
            'word/media/image1.png': 'data:image/png;base64,OLD',
          },
        },
      },
    };

    const clipboardData = {
      getData: () => JSON.stringify({ 'word/media/image1.png': 'data:image/png;base64,NEW' }),
    };

    const sliceJson = JSON.stringify({
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'image', attrs: { src: 'word/media/image1.png' } }],
        },
      ],
      openStart: 0,
      openEnd: 0,
    });

    const outSlice = applySuperdocClipboardMedia(editor, clipboardData, sliceJson);

    const slice = JSON.parse(outSlice);
    const img = slice.content[0].content[0];
    expect(img.attrs.src).not.toBe('word/media/image1.png');
    expect(img.attrs.src).toMatch(/^word\/media\/sd-paste-.*\.png$/);

    expect(editor.storage.image.media['word/media/image1.png']).toBe('data:image/png;base64,OLD');
    expect(editor.storage.image.media[img.attrs.src]).toBe('data:image/png;base64,NEW');
  });

  it('applySuperdocClipboardMedia keeps the path when clipboard bytes match storage', () => {
    const same = 'data:image/png;base64,SAME';
    const editor = {
      storage: {
        image: {
          media: { 'word/media/image1.png': same },
        },
      },
    };
    const sliceJson = JSON.stringify({
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'image', attrs: { src: 'word/media/image1.png' } }],
        },
      ],
      openStart: 0,
      openEnd: 0,
    });

    const outSlice = applySuperdocClipboardMedia(
      editor,
      { getData: () => JSON.stringify({ 'word/media/image1.png': same }) },
      sliceJson,
    );

    expect(JSON.parse(outSlice).content[0].content[0].attrs.src).toBe('word/media/image1.png');
  });

  it('applySuperdocClipboardMedia rewrites shapeGroup nested image src on collision', () => {
    const editor = {
      storage: {
        image: {
          media: { 'word/media/pic.png': 'data:image/png;base64,OLD' },
        },
      },
    };
    const sliceJson = JSON.stringify({
      content: [
        {
          type: 'shapeGroup',
          attrs: {
            shapes: [{ attrs: { src: 'word/media/pic.png', kind: 'image', x: 0, y: 0, width: 10, height: 10 } }],
          },
        },
      ],
      openStart: 0,
      openEnd: 0,
    });

    const outSlice = applySuperdocClipboardMedia(
      editor,
      { getData: () => JSON.stringify({ 'word/media/pic.png': 'data:image/png;base64,NEW' }) },
      sliceJson,
    );

    const shape = JSON.parse(outSlice).content[0];
    const newSrc = shape.attrs.shapes[0].attrs.src;
    expect(newSrc).not.toBe('word/media/pic.png');
    expect(editor.storage.image.media['word/media/pic.png']).toBe('data:image/png;base64,OLD');
    expect(editor.storage.image.media[newSrc]).toBe('data:image/png;base64,NEW');
  });
});
