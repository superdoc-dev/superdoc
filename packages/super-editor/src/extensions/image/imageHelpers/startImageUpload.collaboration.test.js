import { describe, it, expect, mock, spyOn, beforeEach } from 'bun:test';
// Controllable mock implementations — configure per test
let mockFindPlaceholder = mock(() => 0);
let mockRemoveImagePlaceholder = mock((_state, tr) => tr);
let mockFindOrCreateRelationship = mock(() => 'rId100');
let mockDefaultUpload = mock();
let mockGenerateDocxRandomId = mock();

mock.module('./imageRegistrationPlugin.js', () => ({
  findPlaceholder: (...args) => mockFindPlaceholder(...args),
  removeImagePlaceholder: (...args) => mockRemoveImagePlaceholder(...args),
  addImagePlaceholder: mock(),
}));

mock.module('@core/parts/adapters/relationships-mutation.js', () => ({
  findOrCreateRelationship: (...args) => mockFindOrCreateRelationship(...args),
}));

mock.module('./handleImageUpload.js', () => ({
  handleImageUpload: (...args) => mockDefaultUpload(...args),
}));

mock.module('@core/helpers/index.js', () => ({
  generateDocxRandomId: (...args) => mockGenerateDocxRandomId(...args),
}));

// Import after vi.mock (hoisted)
const { uploadAndInsertImage } = await import('./startImageUpload.js');

describe('uploadAndInsertImage collaboration branch (isolated)', () => {
  beforeEach(() => {
    mockFindPlaceholder = mock(() => 0);
    mockRemoveImagePlaceholder = mock((_state, tr) => tr);
    mockFindOrCreateRelationship = mock(() => 'rId100');
    mockDefaultUpload = mock();
    mockGenerateDocxRandomId = mock();
  });

  it('calls addImageToCollaboration when ydoc is provided', async () => {
    const collabSpy = mock();

    const editor = {
      options: {
        handleImageUpload: mock().mockResolvedValue('http://example.com/image.png'),
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
      replaceWith: mock(() => tr),
    };

    const view = {
      state: {
        tr,
        schema: {
          nodes: {
            image: {
              create: mock(() => ({ attrs: {} })),
            },
          },
        },
      },
      dispatch: mock(),
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
    mockFindOrCreateRelationship = mock(() => 'rId200');

    const OriginalFile = globalThis.File;
    const fileCtorSpy = mock();

    class MockFile {
      constructor(parts, name, options = {}) {
        fileCtorSpy({ parts, name, options });
        this.name = name;
        this.type = options.type;
      }
    }

    globalThis.File = MockFile;
    const nowSpy = spyOn(Date, 'now').mockReturnValue(123456);

    const editor = {
      options: {
        handleImageUpload: mock().mockResolvedValue('data:image/png;base64,CCC'),
        mode: 'docx',
      },
      commands: {
        addImageToCollaboration: mock(),
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
      replaceWith: mock(() => tr),
    };

    const view = {
      state: {
        tr,
        schema: {
          nodes: {
            image: {
              create: mock(() => ({ attrs: {} })),
            },
          },
        },
      },
      dispatch: mock(),
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
    const relationshipSpy = mock(() => 'rId500');
    mockFindOrCreateRelationship = relationshipSpy;
    mockGenerateDocxRandomId.mockReturnValueOnce('0000007b').mockReturnValueOnce('0000007c');

    const imageCreateSpy = mock(() => ({ attrs: {} }));

    const editor = {
      options: {
        mode: 'docx',
      },
      commands: {
        addImageToCollaboration: mock(),
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
      replaceWith: mock(() => tr),
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
      dispatch: mock(),
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
