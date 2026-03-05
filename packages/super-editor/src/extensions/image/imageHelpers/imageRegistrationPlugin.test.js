import { describe, it, expect, vi } from 'vitest';

vi.mock('@extensions/image/imageHelpers/startImageUpload.js', () => ({
  addImageRelationship: vi.fn(() => null),
}));

import { handleNodePath, needsImageRegistration } from './imageRegistrationPlugin.js';

const createImageNode = (attrs = {}) => ({
  type: { name: 'image' },
  attrs,
});

const createStateStub = () => ({
  tr: {
    setNodeMarkup: vi.fn(),
  },
});

const createEditorStub = () => ({
  storage: {
    image: {
      media: {},
    },
  },
  options: {
    mode: 'docx',
  },
});

describe('needsImageRegistration', () => {
  it('skips images that already live in word/media', () => {
    const node = createImageNode({ src: 'word/media/image1.png' });
    expect(needsImageRegistration(node)).toBe(false);
  });

  it('skips processed data URI images that carry original metadata', () => {
    const node = createImageNode({
      src: 'data:image/svg+xml;base64,AAA',
      originalExtension: 'emf',
      originalSrc: 'word/media/image1.emf',
      rId: 'rId5',
    });
    expect(needsImageRegistration(node)).toBe(false);
  });

  it('requires registration for fresh data URI images without metadata', () => {
    const node = createImageNode({ src: 'data:image/png;base64,AAA' });
    expect(needsImageRegistration(node)).toBe(true);
  });
});

describe('handleNodePath', () => {
  it('registers unique media paths for duplicate base64 images', () => {
    const payload = 'duplicate-image';
    const base64 = `data:image/png;base64,${Buffer.from(payload).toString('base64')}`;

    const foundImages = [
      { node: { attrs: { src: base64 } }, pos: 0 },
      { node: { attrs: { src: base64 } }, pos: 5 },
    ];

    const state = createStateStub();
    const editor = createEditorStub();

    handleNodePath(foundImages, editor, state);

    const mediaEntries = Object.entries(editor.storage.image.media);

    expect(mediaEntries).toHaveLength(2);
    const [firstPath] = mediaEntries[0];
    const [secondPath] = mediaEntries[1];

    expect(firstPath).toMatch(/^word\/media\//);
    expect(secondPath).toMatch(/^word\/media\//);

    const firstName = firstPath.split('/').pop();
    const secondName = secondPath.split('/').pop();

    expect(firstName).not.toBe(secondName);

    const [base, ext = ''] = firstName.split(/\.(?=[^.]+$)/);
    if (ext) {
      expect(secondName).toBe(`${base}-1.${ext}`);
    } else {
      expect(secondName).toBe(`${base}-1`);
    }

    expect(mediaEntries[0][1]).toBe(base64);
    expect(mediaEntries[1][1]).toBe(base64);

    expect(state.tr.setNodeMarkup).toHaveBeenCalledTimes(2);
    expect(state.tr.setNodeMarkup).toHaveBeenNthCalledWith(
      1,
      foundImages[0].pos,
      undefined,
      expect.objectContaining({ src: firstPath }),
    );
    expect(state.tr.setNodeMarkup).toHaveBeenNthCalledWith(
      2,
      foundImages[1].pos,
      undefined,
      expect.objectContaining({ src: secondPath }),
    );
  });

  it('adds a default extension for URL sources without one in headless registration', () => {
    const sourceUrl = 'https://picsum.photos/id/237/200/300';
    const foundImages = [{ node: { attrs: { src: sourceUrl, size: {} } }, pos: 0 }];

    const state = createStateStub();
    const editor = createEditorStub();

    handleNodePath(foundImages, editor, state);

    const mediaEntries = Object.entries(editor.storage.image.media);
    expect(mediaEntries).toHaveLength(1);

    const [mediaPath, storedValue] = mediaEntries[0];
    expect(mediaPath).toBe('word/media/300.jpg');
    expect(storedValue).toBe(sourceUrl);

    expect(state.tr.setNodeMarkup).toHaveBeenCalledWith(
      0,
      undefined,
      expect.objectContaining({
        src: 'word/media/300.jpg',
        size: { width: 200, height: 300 },
      }),
    );
  });

  it('infers size from query params when present', () => {
    const sourceUrl = 'https://example.com/photo?width=640&height=480';
    const foundImages = [{ node: { attrs: { src: sourceUrl } }, pos: 0 }];

    const state = createStateStub();
    const editor = createEditorStub();

    handleNodePath(foundImages, editor, state);

    expect(state.tr.setNodeMarkup).toHaveBeenCalledWith(
      0,
      undefined,
      expect.objectContaining({
        size: { width: 640, height: 480 },
      }),
    );
  });

  it('does not override existing valid size with inferred size', () => {
    const sourceUrl = 'https://picsum.photos/id/237/200/300';
    const existingSize = { width: 500, height: 400 };
    const foundImages = [{ node: { attrs: { src: sourceUrl, size: existingSize } }, pos: 0 }];

    const state = createStateStub();
    const editor = createEditorStub();

    handleNodePath(foundImages, editor, state);

    expect(state.tr.setNodeMarkup).toHaveBeenCalledWith(0, undefined, expect.objectContaining({ size: existingSize }));
  });

  it('infers size from compact WxH path segment', () => {
    const sourceUrl = 'https://example.com/images/800x600';
    const foundImages = [{ node: { attrs: { src: sourceUrl } }, pos: 0 }];

    const state = createStateStub();
    const editor = createEditorStub();

    handleNodePath(foundImages, editor, state);

    expect(state.tr.setNodeMarkup).toHaveBeenCalledWith(
      0,
      undefined,
      expect.objectContaining({
        size: { width: 800, height: 600 },
      }),
    );
  });
});
