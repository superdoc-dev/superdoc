import { describe, it, expect, vi, beforeEach } from 'vitest';

// Controllable mock implementations — configure per test
let mockFindPlaceholder = vi.fn(() => 0);
let mockRemoveImagePlaceholder = vi.fn((_state, tr) => tr);
let mockFindOrCreateRelationship = vi.fn(() => 'rId100');
let mockDefaultUpload = vi.fn();
let mockGenerateDocxRandomId = vi.fn();

vi.mock('./imageRegistrationPlugin.js', () => ({
  findPlaceholder: (...args) => mockFindPlaceholder(...args),
  removeImagePlaceholder: (...args) => mockRemoveImagePlaceholder(...args),
  addImagePlaceholder: vi.fn(),
}));

vi.mock('@core/parts/adapters/relationships-mutation.js', () => ({
  findOrCreateRelationship: (...args) => mockFindOrCreateRelationship(...args),
}));

vi.mock('./handleImageUpload.js', () => ({
  handleImageUpload: (...args) => mockDefaultUpload(...args),
}));

vi.mock('@core/helpers/index.js', () => ({
  generateDocxRandomId: (...args) => mockGenerateDocxRandomId(...args),
}));

// Import after vi.mock (hoisted)
const { uploadAndInsertImage } = await import('./startImageUpload.js');

describe('uploadAndInsertImage collaboration branch (isolated)', () => {
  beforeEach(() => {
    mockFindPlaceholder = vi.fn(() => 0);
    mockRemoveImagePlaceholder = vi.fn((_state, tr) => tr);
    mockFindOrCreateRelationship = vi.fn(() => 'rId100');
    mockDefaultUpload = vi.fn();
    mockGenerateDocxRandomId = vi.fn();
  });

  it('calls addImageToCollaboration when ydoc is provided', async () => {
    const collabSpy = vi.fn();

    const editor = {
      options: {
        handleImageUpload: vi.fn().mockResolvedValue('http://example.com/image.png'),
        mode: 'docx',
        ydoc: {},
      },
      commands: {
        addImageToCollaboration: collabSpy,
      },
      storage: {
        image: { media: {} },
      },
    };

    const tr = {
      replaceWith: vi.fn(() => tr),
    };

    const view = {
      state: {
        tr,
        schema: {
          nodes: {
            image: {
              create: vi.fn(() => ({ attrs: {} })),
            },
          },
        },
      },
      dispatch: vi.fn(),
    };

    const file = new File([new Uint8Array([1])], 'collab.png', { type: 'image/png' });

    await uploadAndInsertImage({
      editor,
      view,
      file,
      size: { width: 10, height: 10 },
      id: {},
    });

    expect(collabSpy).toHaveBeenCalledWith({
      mediaPath: 'word/media/collab.png',
      fileData: 'http://example.com/image.png',
    });
  });

  it('falls back when media is unset and file lacks lastModified', async () => {
    mockFindOrCreateRelationship = vi.fn(() => 'rId200');

    const OriginalFile = globalThis.File;
    const fileCtorSpy = vi.fn();

    class MockFile {
      constructor(parts, name, options = {}) {
        fileCtorSpy({ parts, name, options });
        this.name = name;
        this.type = options.type;
      }
    }

    globalThis.File = MockFile;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(123456);

    const editor = {
      options: {
        handleImageUpload: vi.fn().mockResolvedValue('data:image/png;base64,CCC'),
        mode: 'docx',
      },
      commands: {
        addImageToCollaboration: vi.fn(),
      },
      storage: {
        image: {},
      },
      state: {
        doc: {
          descendants: () => {},
        },
      },
    };

    const backingMedia = {};
    let firstAccess = true;
    Object.defineProperty(editor.storage.image, 'media', {
      configurable: true,
      get() {
        if (firstAccess) {
          firstAccess = false;
          return undefined;
        }
        return backingMedia;
      },
      set(value) {
        Object.assign(backingMedia, value);
      },
    });

    const tr = {
      replaceWith: vi.fn(() => tr),
    };

    const view = {
      state: {
        tr,
        schema: {
          nodes: {
            image: {
              create: vi.fn(() => ({ attrs: {} })),
            },
          },
        },
      },
      dispatch: vi.fn(),
    };

    const sourceFile = { name: 'Screenshot 2025.png', type: 'image/png', size: 10 };

    try {
      await uploadAndInsertImage({
        editor,
        view,
        file: sourceFile,
        size: { width: 10, height: 10 },
        id: {},
      });
    } finally {
      globalThis.File = OriginalFile;
      nowSpy.mockRestore();
      delete editor.storage.image.media;
      editor.storage.image.media = backingMedia;
    }

    expect(fileCtorSpy).toHaveBeenCalledTimes(1);
    const [[callArgs]] = fileCtorSpy.mock.calls;
    expect(callArgs.name).toBe('Screenshot_2025.png');
    expect(callArgs.options.lastModified).toBe(123456);

    expect(editor.options.handleImageUpload).toHaveBeenCalledWith(expect.any(MockFile));
    expect(backingMedia).toHaveProperty('word/media/Screenshot_2025.png');
    expect(mockFindPlaceholder).toHaveBeenCalled();
    expect(mockRemoveImagePlaceholder).toHaveBeenCalled();
  });

  it('uses default upload handler and skips duplicate docPr ids', async () => {
    mockDefaultUpload.mockResolvedValue('data:image/png;base64,DDD');
    const relationshipSpy = vi.fn(() => 'rId500');
    mockFindOrCreateRelationship = relationshipSpy;
    mockGenerateDocxRandomId.mockReturnValueOnce('0000007b').mockReturnValueOnce('0000007c');

    const imageCreateSpy = vi.fn(() => ({ attrs: {} }));

    const editor = {
      options: {
        mode: 'docx',
      },
      commands: {
        addImageToCollaboration: vi.fn(),
      },
      storage: {
        image: { media: {} },
      },
      state: {
        doc: {
          descendants: (callback) => {
            callback({
              type: { name: 'image' },
              attrs: { id: '123' },
            });
          },
        },
      },
    };

    const tr = {
      replaceWith: vi.fn(() => tr),
    };

    const view = {
      state: {
        tr,
        schema: {
          nodes: {
            image: {
              create: imageCreateSpy,
            },
          },
        },
      },
      dispatch: vi.fn(),
    };

    const basicFile = new File([new Uint8Array([1])], 'image.png', { type: 'image/png' });

    await uploadAndInsertImage({
      editor,
      view,
      file: basicFile,
      size: { width: 20, height: 20 },
      id: {},
    });

    expect(mockDefaultUpload).toHaveBeenCalledTimes(1);
    expect(relationshipSpy).toHaveBeenCalledWith(editor, 'startImageUpload:addImageRelationship', {
      target: 'media/image.png',
      type: 'image',
    });
    const createdNodeAttrs = imageCreateSpy.mock.calls[0][0];
    expect(createdNodeAttrs.id).toBe('124');

    expect(mockGenerateDocxRandomId).toHaveBeenCalledTimes(2);
  });
});
