// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
  collectReferencedImageMediaForClipboard,
  applySuperdocClipboardMedia,
  embedSliceInHtml,
  extractSliceFromHtml,
  stripSliceFromHtml,
  extractBodySectPrFromHtml,
  bodySectPrShouldEmbed,
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

describe('HTML slice embed/extract round-trip', () => {
  const sampleSlice = JSON.stringify({ content: [{ type: 'paragraph' }], openStart: 0, openEnd: 0 });
  const sampleHtml = '<p>Hello world</p>';

  it('extractSliceFromHtml recovers what embedSliceInHtml embedded', () => {
    const embedded = embedSliceInHtml(sampleHtml, sampleSlice);
    const extracted = extractSliceFromHtml(embedded);
    expect(extracted).toBe(sampleSlice);
  });

  it('stripSliceFromHtml removes embedded divs and preserves the original HTML', () => {
    const embedded = embedSliceInHtml(sampleHtml, sampleSlice);
    expect(embedded).toContain('data-superdoc-slice');
    const stripped = stripSliceFromHtml(embedded);
    expect(stripped).toBe(sampleHtml);
    expect(stripped).not.toContain('data-superdoc-slice');
  });

  it('round-trips Unicode content (CJK, emoji)', () => {
    const unicodeSlice = JSON.stringify({ text: '你好世界 🎉' });
    const embedded = embedSliceInHtml(sampleHtml, unicodeSlice);
    const extracted = extractSliceFromHtml(embedded);
    expect(extracted).toBe(unicodeSlice);
  });

  it('embedSliceInHtml with bodySectPr embeds both and extractBodySectPrFromHtml recovers it', () => {
    const sectPr = JSON.stringify({ cols: { num: 2, space: 720, equalWidth: true } });
    const embedded = embedSliceInHtml(sampleHtml, sampleSlice, sectPr);
    expect(embedded).toContain('data-sd-body-sect-pr');
    expect(embedded).toContain('data-superdoc-slice');

    const extractedSectPr = extractBodySectPrFromHtml(embedded);
    expect(extractedSectPr).toEqual(JSON.parse(sectPr));

    const extractedSlice = extractSliceFromHtml(embedded);
    expect(extractedSlice).toBe(sampleSlice);
  });

  it('stripSliceFromHtml removes both slice and bodySectPr divs', () => {
    const sectPr = JSON.stringify({ cols: { num: 2 } });
    const embedded = embedSliceInHtml(sampleHtml, sampleSlice, sectPr);
    const stripped = stripSliceFromHtml(embedded);
    expect(stripped).toBe(sampleHtml);
  });

  it('extractSliceFromHtml returns null for plain HTML without embedded data', () => {
    expect(extractSliceFromHtml(sampleHtml)).toBeNull();
    expect(extractSliceFromHtml('')).toBeNull();
    expect(extractSliceFromHtml(null)).toBeNull();
  });

  it('embedSliceInHtml without sliceJson returns the HTML unchanged', () => {
    expect(embedSliceInHtml(sampleHtml, null)).toBe(sampleHtml);
    expect(embedSliceInHtml(sampleHtml, '')).toBe(sampleHtml);
  });
});

describe('bodySectPrShouldEmbed', () => {
  const makeColsSectPr = (num) => ({
    name: 'w:sectPr',
    elements: [{ name: 'w:cols', attributes: { 'w:num': String(num) } }],
  });

  it('returns true for multi-column sectPr', () => {
    expect(bodySectPrShouldEmbed(makeColsSectPr(2))).toBe(true);
  });

  it('returns false for single-column sectPr', () => {
    expect(bodySectPrShouldEmbed(makeColsSectPr(1))).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(bodySectPrShouldEmbed(null)).toBe(false);
    expect(bodySectPrShouldEmbed(undefined)).toBe(false);
  });
});
