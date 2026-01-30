import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Editor as EditorType } from '@core/Editor.js';
import { HeaderFooterEditorManager, HeaderFooterLayoutAdapter } from './HeaderFooterRegistry.js';

type MockEditorEmitter = {
  on: (event: string, handler: (payload?: unknown) => void) => void;
  off: (event: string, handler: (payload?: unknown) => void) => void;
  once: (event: string, handler: (payload?: unknown) => void) => void;
  emit: (event: string, payload?: unknown) => void;
};

type MockSectionEditor = MockEditorEmitter & {
  destroy: ReturnType<typeof vi.fn>;
  view: {
    dom: HTMLDivElement;
    focus: ReturnType<typeof vi.fn>;
  };
  options: Record<string, unknown>;
  getJSON?: () => unknown;
};

const {
  mockCreateHeaderFooterEditor,
  mockOnHeaderFooterDataUpdate,
  mockUpdateYdocDocxData,
  mockToFlowBlocks,
  createdEditors,
} = vi.hoisted(() => {
  const editors: Array<{ editor: MockSectionEditor; emit: (event: string, payload?: unknown) => void }> = [];

  const createEmitter = (): MockEditorEmitter => {
    const listeners = new Map<string, Set<(payload?: unknown) => void>>();

    const on = (event: string, handler: (payload?: unknown) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    };

    const off = (event: string, handler: (payload?: unknown) => void) => {
      listeners.get(event)?.delete(handler);
    };

    const once = (event: string, handler: (payload?: unknown) => void) => {
      const wrapper = (payload?: unknown) => {
        off(event, wrapper);
        handler(payload);
      };
      on(event, wrapper);
    };

    const emit = (event: string, payload?: unknown) => {
      listeners.get(event)?.forEach((handler) => handler(payload));
    };

    return { on, off, once, emit };
  };

  const createSectionEditor = (): MockSectionEditor => {
    const emitter = createEmitter();
    const editorStub: MockSectionEditor = {
      on: emitter.on,
      off: emitter.off,
      once: emitter.once,
      emit: emitter.emit,
      destroy: vi.fn(),
      view: {
        dom: document.createElement('div'),
        focus: vi.fn(),
      },
      options: {},
    };
    return editorStub;
  };

  const mockCreateHeaderFooterEditor = vi.fn(() => {
    const editor = createSectionEditor();
    editors.push({ editor, emit: editor.emit });
    queueMicrotask(() => {
      editor.emit('create');
    });
    return editor;
  });

  return {
    mockCreateHeaderFooterEditor,
    mockOnHeaderFooterDataUpdate: vi.fn(),
    mockUpdateYdocDocxData: vi.fn(() => Promise.resolve()),
    mockToFlowBlocks: vi.fn(() => ({ blocks: [{ id: 'hf-block', kind: 'paragraph' }], bookmarks: new Map() })),
    createdEditors: editors,
  };
});

vi.mock('@extensions/pagination/pagination-helpers.js', () => ({
  createHeaderFooterEditor: mockCreateHeaderFooterEditor,
  onHeaderFooterDataUpdate: mockOnHeaderFooterDataUpdate,
}));

vi.mock('@extensions/collaboration/collaboration-helpers.js', () => ({
  updateYdocDocxData: mockUpdateYdocDocxData,
}));

vi.mock('@superdoc/pm-adapter', () => ({
  toFlowBlocks: mockToFlowBlocks,
}));

const createConverter = () => ({
  headers: {
    'rId-header-default': { type: 'doc', content: [{ type: 'paragraph' }] },
    'rId-header-odd': { type: 'doc', content: [{ type: 'paragraph' }] },
  },
  footers: {
    'rId-footer-default': { type: 'doc', content: [{ type: 'paragraph' }] },
  },
  headerIds: {
    default: 'rId-header-default',
    first: null,
    even: null,
    odd: 'rId-header-odd',
    ids: ['rId-header-default', 'rId-header-odd'],
  },
  footerIds: {
    default: 'rId-footer-default',
    first: null,
    even: null,
    odd: null,
    ids: ['rId-footer-default'],
  },
});

const createMockEditor = (converterOverrides?: {
  headers?: Record<string, unknown>;
  footers?: Record<string, unknown>;
  headerIds?: ReturnType<typeof createConverter>['headerIds'];
  footerIds?: ReturnType<typeof createConverter>['footerIds'];
}): EditorType => {
  const baseConverter = createConverter();
  const converter = {
    headers:
      converterOverrides?.headers !== undefined
        ? { ...baseConverter.headers, ...converterOverrides.headers }
        : baseConverter.headers,
    footers:
      converterOverrides?.footers !== undefined
        ? { ...baseConverter.footers, ...converterOverrides.footers }
        : baseConverter.footers,
    headerIds: converterOverrides?.headerIds ?? baseConverter.headerIds,
    footerIds: converterOverrides?.footerIds ?? baseConverter.footerIds,
  };
  return {
    converter,
    options: {
      element: document.createElement('div'),
    },
  } as unknown as EditorType;
};

describe('HeaderFooterEditorManager', () => {
  beforeEach(() => {
    mockCreateHeaderFooterEditor.mockClear();
    mockOnHeaderFooterDataUpdate.mockClear();
    mockUpdateYdocDocxData.mockClear();
    createdEditors.length = 0;
  });

  it('collects descriptors for each unique header/footer variant', () => {
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);

    const headers = manager.getDescriptors('header');
    const footers = manager.getDescriptors('footer');

    expect(headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'rId-header-default', kind: 'header', variant: 'default' }),
        expect.objectContaining({ id: 'rId-header-odd', kind: 'header', variant: 'odd' }),
      ]),
    );
    expect(footers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'rId-footer-default', kind: 'footer', variant: 'default' }),
      ]),
    );
  });

  it('ensureEditor lazily creates editors and reuses cached instances', async () => {
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);
    const descriptor = { id: 'rId-header-default', kind: 'header' } as const;

    const first = await manager.ensureEditor(descriptor);
    const second = await manager.ensureEditor(descriptor);

    expect(first).toBeDefined();
    expect(second).toBe(first);
    expect(mockCreateHeaderFooterEditor).toHaveBeenCalledTimes(1);
    expect(editor.converter.headerEditors).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'rId-header-default', editor: first })]),
    );
  });

  it('emits contentChanged and syncs converter/Yjs data when section editor updates', async () => {
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);
    const descriptor = { id: 'rId-header-default', kind: 'header' } as const;
    const handler = vi.fn();
    manager.on('contentChanged', handler);

    await manager.ensureEditor(descriptor);
    const sectionEditor = createdEditors.at(-1)?.editor;
    expect(sectionEditor).toBeDefined();

    sectionEditor?.emit('update', { transaction: { docChanged: true } });

    expect(handler).toHaveBeenCalledWith({ descriptor });
    expect(mockOnHeaderFooterDataUpdate).toHaveBeenCalledWith(
      { editor: sectionEditor, transaction: { docChanged: true } },
      editor,
      'rId-header-default',
      'header',
    );
    // Note: updateYdocDocxData is NOT called directly from header/footer updates.
    // The full DOCX sync is handled by the debounced main document listener,
    // which picks up header/footer changes via Y.Doc afterTransaction events.
    expect(mockUpdateYdocDocxData).not.toHaveBeenCalled();
  });

  it('tears down editors on destroy without throwing', async () => {
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);
    await manager.ensureEditor({ id: 'rId-header-default', kind: 'header' });
    expect(createdEditors).toHaveLength(1);

    expect(() => manager.destroy()).not.toThrow();
    expect(createdEditors[0].editor.destroy).toHaveBeenCalled();
  });

  it('handles editor creation failures gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      // Intentionally empty - suppressing console errors in test
    });
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);
    mockCreateHeaderFooterEditor.mockImplementationOnce(() => {
      throw new Error('Creation failed');
    });
    const descriptor = { id: 'rId-header-default', kind: 'header' } as const;
    const errorHandler = vi.fn();
    manager.on('error', errorHandler);

    const result = await manager.ensureEditor(descriptor);

    expect(result).toBeNull();
    // Error should not be emitted if creation fails before editor is created
    expect(errorHandler).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('handles concurrent ensureEditor calls for the same descriptor', async () => {
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);
    const descriptor = { id: 'rId-header-default', kind: 'header' } as const;

    const [first, second] = await Promise.all([manager.ensureEditor(descriptor), manager.ensureEditor(descriptor)]);

    expect(first).toBe(second);
    expect(mockCreateHeaderFooterEditor).toHaveBeenCalledTimes(1);
  });

  it('returns empty descriptors when converter data is missing', () => {
    const editorWithoutConverter = {
      options: {
        element: document.createElement('div'),
      },
      converter: null,
    } as unknown as EditorType;
    const manager = new HeaderFooterEditorManager(editorWithoutConverter);

    expect(manager.getDescriptors()).toEqual([]);
    expect(manager.getVariantId('header', 'default')).toBeNull();
  });

  it('evicts least recently used editors when cache limit is exceeded', async () => {
    const editor = createMockEditor({
      headers: {
        'rId-header-default': { type: 'doc', content: [{ type: 'paragraph' }] },
        'rId-header-odd': { type: 'doc', content: [{ type: 'paragraph' }] },
        rId1: { type: 'doc', content: [{ type: 'paragraph' }] },
        rId2: { type: 'doc', content: [{ type: 'paragraph' }] },
        rId3: { type: 'doc', content: [{ type: 'paragraph' }] },
      },
      headerIds: {
        default: 'rId1',
        first: 'rId2',
        even: 'rId3',
        odd: null,
        ids: ['rId1', 'rId2', 'rId3'],
      },
    });
    const manager = new HeaderFooterEditorManager(editor);
    manager.setMaxCachedEditors(2);

    const desc1 = { id: 'rId1', kind: 'header' } as const;
    const desc2 = { id: 'rId2', kind: 'header' } as const;
    const desc3 = { id: 'rId3', kind: 'header' } as const;

    const editor1 = await manager.ensureEditor(desc1);
    const editor2 = await manager.ensureEditor(desc2);
    const editor3 = await manager.ensureEditor(desc3); // Should evict editor1

    expect(editor1).toBeTruthy();
    expect(editor2).toBeTruthy();
    expect(editor3).toBeTruthy();

    // Verify editor1 was evicted by creating it again
    const editor1Again = await manager.ensureEditor(desc1);
    expect(mockCreateHeaderFooterEditor).toHaveBeenCalledTimes(4); // 3 + 1 recreation
    expect(editor1Again).toBeTruthy();
    expect(editor1Again).not.toBe(editor1); // New instance created
  });

  it('enforces cache limit immediately when setMaxCachedEditors is called', async () => {
    const editor = createMockEditor({
      headers: {
        'rId-header-default': { type: 'doc', content: [{ type: 'paragraph' }] },
        'rId-header-odd': { type: 'doc', content: [{ type: 'paragraph' }] },
        rId1: { type: 'doc', content: [{ type: 'paragraph' }] },
        rId2: { type: 'doc', content: [{ type: 'paragraph' }] },
        rId3: { type: 'doc', content: [{ type: 'paragraph' }] },
      },
      headerIds: {
        default: 'rId1',
        first: 'rId2',
        even: 'rId3',
        odd: null,
        ids: ['rId1', 'rId2', 'rId3'],
      },
    });
    const manager = new HeaderFooterEditorManager(editor);

    const desc1 = { id: 'rId1', kind: 'header' } as const;
    const desc2 = { id: 'rId2', kind: 'header' } as const;
    const desc3 = { id: 'rId3', kind: 'header' } as const;

    await manager.ensureEditor(desc1);
    await manager.ensureEditor(desc2);
    await manager.ensureEditor(desc3);

    expect(createdEditors).toHaveLength(3);

    // Reduce cache limit to 1, should evict the 2 least recently used
    manager.setMaxCachedEditors(1);

    // Only editor3 should remain (most recently used)
    const _editor3Again = await manager.ensureEditor(desc3);
    expect(mockCreateHeaderFooterEditor).toHaveBeenCalledTimes(3); // No new creation

    // editor1 and editor2 should have been evicted and need recreation
    const _editor1Again = await manager.ensureEditor(desc1);
    expect(mockCreateHeaderFooterEditor).toHaveBeenCalledTimes(4); // Recreated
  });

  it('throws error when setMaxCachedEditors receives invalid value', () => {
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);

    expect(() => manager.setMaxCachedEditors(0)).toThrow('Max cached editors must be at least 1');
    expect(() => manager.setMaxCachedEditors(-1)).toThrow('Max cached editors must be at least 1');
  });

  it('updates access order when existing editor is accessed', async () => {
    const editor = createMockEditor({
      headers: {
        'rId-header-default': { type: 'doc', content: [{ type: 'paragraph' }] },
        'rId-header-odd': { type: 'doc', content: [{ type: 'paragraph' }] },
        rId1: { type: 'doc', content: [{ type: 'paragraph' }] },
        rId2: { type: 'doc', content: [{ type: 'paragraph' }] },
        rId3: { type: 'doc', content: [{ type: 'paragraph' }] },
      },
      headerIds: {
        default: 'rId1',
        first: 'rId2',
        even: 'rId3',
        odd: null,
        ids: ['rId1', 'rId2', 'rId3'],
      },
    });
    const manager = new HeaderFooterEditorManager(editor);
    manager.setMaxCachedEditors(2);

    const desc1 = { id: 'rId1', kind: 'header' } as const;
    const desc2 = { id: 'rId2', kind: 'header' } as const;
    const desc3 = { id: 'rId3', kind: 'header' } as const;

    // Create editors 1 and 2 (cache is now full: [1, 2])
    const editor1 = await manager.ensureEditor(desc1);
    const editor2 = await manager.ensureEditor(desc2);

    // Access editor1 again to make it most recently used (cache order: [2, 1])
    const editor1Again = await manager.ensureEditor(desc1);
    expect(editor1Again).toBe(editor1); // Same instance

    // Now add editor3, which should evict editor2 (least recently used)
    // Cache order after eviction and addition: [1, 3]
    const _editor3 = await manager.ensureEditor(desc3);

    // editor2 should have been evicted, need recreation
    // After recreation, cache should be: [3, 2] (evicts 1)
    const editor2Again = await manager.ensureEditor(desc2);
    expect(mockCreateHeaderFooterEditor).toHaveBeenCalledTimes(4); // 3 + 1 recreation
    expect(editor2Again).toBeTruthy();
    expect(editor2Again).not.toBe(editor2); // New instance

    // editor1 should have been evicted when editor2 was added
    // Accessing it will require recreation
    const editor1Final = await manager.ensureEditor(desc1);
    expect(mockCreateHeaderFooterEditor).toHaveBeenCalledTimes(5); // 4 + 1 more recreation
    expect(editor1Final).not.toBe(editor1); // New instance created
  });

  it('handles sync errors and emits syncError event', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      // Intentionally empty - suppressing console errors in test
    });
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);
    const descriptor = { id: 'rId-header-default', kind: 'header' } as const;
    const syncErrorHandler = vi.fn();
    manager.on('syncError', syncErrorHandler);

    // Mock onHeaderFooterDataUpdate to throw an error
    mockOnHeaderFooterDataUpdate.mockImplementationOnce(() => {
      throw new Error('Sync failed');
    });

    await manager.ensureEditor(descriptor);
    const sectionEditor = createdEditors.at(-1)?.editor;
    expect(sectionEditor).toBeDefined();

    // Trigger update which should fail during sync
    sectionEditor?.emit('update', { transaction: { docChanged: true } });

    expect(syncErrorHandler).toHaveBeenCalledWith({
      descriptor,
      error: expect.objectContaining({ message: 'Sync failed' }),
    });
    consoleErrorSpy.mockRestore();
  });
});

describe('HeaderFooterLayoutAdapter', () => {
  beforeEach(() => {
    mockToFlowBlocks.mockClear();
    mockToFlowBlocks.mockReturnValue({ blocks: [{ id: 'hf-block', kind: 'paragraph' }], bookmarks: new Map() });
  });

  it('builds FlowBlock batches per variant and caches results', () => {
    const descriptors = [
      { id: 'rId-header-default', kind: 'header', variant: 'default' },
      { id: 'rId-header-odd', kind: 'header', variant: 'odd' },
    ];

    // Create doc refs that will remain stable for caching
    const doc1 = { type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'rId-header-default' } }] };
    const doc2 = { type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'rId-header-odd' } }] };

    const manager = {
      rootEditor: {
        converter: {
          convertedXml: {},
          numbering: {},
          linkedStyles: {},
        },
      },
      getDescriptors: (kind: string) => (kind === 'header' ? descriptors : []),
      getDocumentJson: vi.fn((descriptor) => {
        if (descriptor.id === 'rId-header-default') return doc1;
        if (descriptor.id === 'rId-header-odd') return doc2;
        return null;
      }),
    } as unknown as HeaderFooterEditorManager;

    const adapter = new HeaderFooterLayoutAdapter(manager, { img1: 'blob:url' });

    // Reset mock call count right before the test logic to avoid contamination
    mockToFlowBlocks.mockClear();

    const firstBatch = adapter.getBatch('header');
    expect(firstBatch).toEqual(
      expect.objectContaining({
        default: expect.any(Array),
        odd: expect.any(Array),
      }),
    );
    const callsAfterFirst = mockToFlowBlocks.mock.calls.length;
    expect(callsAfterFirst).toBe(2); // Called once per descriptor

    // Second call should use cache - same doc references
    const secondBatch = adapter.getBatch('header');
    expect(secondBatch).toEqual(firstBatch);
    expect(mockToFlowBlocks.mock.calls.length).toBe(callsAfterFirst); // No additional calls

    // After invalidation, should call toFlowBlocks again for that descriptor
    adapter.invalidate('rId-header-default');
    adapter.getBatch('header');
    expect(mockToFlowBlocks.mock.calls.length).toBe(callsAfterFirst + 1); // One more call
  });

  it('falls back to converter media when mediaFiles are not provided', () => {
    const descriptor = { id: 'rId-header-default', kind: 'header', variant: 'default' };
    const doc = { type: 'doc', content: [{ type: 'paragraph' }] };

    const manager = {
      rootEditor: {
        converter: {
          convertedXml: {},
          numbering: {},
          linkedStyles: {},
          media: { 'word/media/image1.png': 'base64data' },
        },
      },
      getDescriptors: (kind: string) => (kind === 'header' ? [descriptor] : []),
      getDocumentJson: vi.fn(() => doc),
    } as unknown as HeaderFooterEditorManager;

    const adapter = new HeaderFooterLayoutAdapter(manager);

    mockToFlowBlocks.mockClear();
    adapter.getBatch('header');

    const [, options] = mockToFlowBlocks.mock.calls[0] || [];
    expect(options?.mediaFiles).toEqual(manager.rootEditor.converter.media);
  });

  it('returns undefined when no descriptors have FlowBlocks', () => {
    const manager = {
      getDescriptors: () => [{ id: 'missing', kind: 'header', variant: 'default' }],
      getDocumentJson: () => null,
    } as unknown as HeaderFooterEditorManager;

    const adapter = new HeaderFooterLayoutAdapter(manager);
    expect(adapter.getBatch('header')).toBeUndefined();
  });
});

describe('HeaderFooterEditorManager error scenarios', () => {
  beforeEach(() => {
    mockCreateHeaderFooterEditor.mockClear();
    mockOnHeaderFooterDataUpdate.mockClear();
    mockUpdateYdocDocxData.mockClear();
    createdEditors.length = 0;
  });

  it('handles getJSON() throwing during getDocumentJson', async () => {
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);
    const descriptor = { id: 'rId-header-default', kind: 'header' } as const;

    // First create an editor normally
    await manager.ensureEditor(descriptor);

    // Replace getJSON to throw
    const createdEditor = createdEditors[createdEditors.length - 1]?.editor;
    if (createdEditor) {
      createdEditor.getJSON = vi.fn(() => {
        throw new Error('getJSON failed');
      });
    }

    // Should fall back to converter snapshot
    const result = manager.getDocumentJson(descriptor);
    expect(result).toBeTruthy(); // Should return converter data
    expect(result).toEqual(editor.converter.headers?.['rId-header-default']);
  });

  it('returns null for getVariantId when variant not in collections', () => {
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);

    const result = manager.getVariantId('header', 'nonexistent' as never);
    expect(result).toBeNull();
  });

  it('handles multiple refresh() calls in quick succession', () => {
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);

    const contentChangedHandler = vi.fn();
    manager.on('contentChanged', contentChangedHandler);

    manager.refresh();
    manager.refresh();
    manager.refresh();

    // Should not throw and should complete successfully
    expect(manager.getDescriptors()).toHaveLength(3); // 2 headers + 1 footer
  });

  it('cleans up pending creations on destroy', async () => {
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);
    const descriptor = { id: 'rId-header-default', kind: 'header' } as const;

    // Start creation but don't await
    const promise = manager.ensureEditor(descriptor);

    // Destroy before creation completes
    manager.destroy();

    const result = await promise;
    // After destruction, the manager should still complete the promise
    // but the editor should be cleaned up
    expect(result).toBeDefined();
  });

  it('handles editor initialization errors gracefully', async () => {
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);
    const descriptor = { id: 'rId-header-default', kind: 'header' } as const;

    // Mock the editor to emit create event immediately but with error tracking
    mockCreateHeaderFooterEditor.mockImplementationOnce(() => {
      const editorStub = {
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn((event: string, handler: () => void) => {
          if (event === 'create') {
            // Still call the handler to resolve the ready promise
            // but simulate that something went wrong during initialization
            queueMicrotask(() => handler());
          }
        }),
        emit: vi.fn(),
        destroy: vi.fn(),
        view: {
          dom: document.createElement('div'),
          focus: vi.fn(),
        },
        options: {},
        getJSON: vi.fn(() => {
          // Simulate initialization issue by having getJSON throw initially
          throw new Error('Editor not ready');
        }),
      };
      createdEditors.push({ editor: editorStub, emit: editorStub.emit });
      return editorStub;
    });

    const errorHandler = vi.fn();
    manager.on('error', errorHandler);

    const result = await manager.ensureEditor(descriptor);

    // Should still return the editor even if it has issues
    expect(result).toBeDefined();
  });

  it('handles missing document JSON gracefully', () => {
    const editorWithoutData = createMockEditor({
      headers: {},
      footers: {},
      headerIds: { default: 'missing-id', first: null, even: null, odd: null, ids: ['missing-id'] },
      footerIds: { default: null, first: null, even: null, odd: null, ids: [] },
    });
    const manager = new HeaderFooterEditorManager(editorWithoutData);
    const descriptor = { id: 'missing-id', kind: 'header' } as const;

    const result = manager.getDocumentJson(descriptor);
    expect(result).toBeNull();
  });

  it('handles descriptor without id in ensureEditor', async () => {
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);
    const invalidDescriptor = { kind: 'header' } as never;

    const result = await manager.ensureEditor(invalidDescriptor);
    expect(result).toBeNull();
  });

  it('handles descriptor without id in getEditor', () => {
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);
    const invalidDescriptor = { kind: 'header' } as never;

    const result = manager.getEditor(invalidDescriptor);
    expect(result).toBeNull();
  });

  it('handles descriptor without id in getDocumentJson', () => {
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);
    const invalidDescriptor = { kind: 'header' } as never;

    const result = manager.getDocumentJson(invalidDescriptor);
    expect(result).toBeNull();
  });

  it('handles variant lookup with null collections', () => {
    const editorWithoutConverter = {
      options: {
        element: document.createElement('div'),
      },
      converter: null,
    } as unknown as ReturnType<typeof createMockEditor>;

    const manager = new HeaderFooterEditorManager(editorWithoutConverter);

    const result = manager.getVariantId('header', 'default');
    expect(result).toBeNull();
  });

  it('continues cleanup even if disposer throws', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      // Intentionally empty - suppressing console warnings in test
    });
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);
    const descriptor = { id: 'rId-header-default', kind: 'header' } as const;

    // Mock editor with failing destroy
    mockCreateHeaderFooterEditor.mockImplementationOnce(() => {
      const editorStub = {
        on: vi.fn(),
        off: vi.fn(() => {
          throw new Error('off failed');
        }),
        once: vi.fn((event: string, handler: () => void) => {
          if (event === 'create') {
            queueMicrotask(() => handler());
          }
        }),
        emit: vi.fn(),
        destroy: vi.fn(() => {
          throw new Error('destroy failed');
        }),
        view: {
          dom: document.createElement('div'),
          focus: vi.fn(),
        },
        options: {},
      };
      createdEditors.push({ editor: editorStub, emit: editorStub.emit });
      return editorStub;
    });

    await manager.ensureEditor(descriptor);

    // Destroy should not throw even if disposer fails
    expect(() => manager.destroy()).not.toThrow();
    consoleWarnSpy.mockRestore();
  });
});

describe('HeaderFooterEditorManager cache statistics', () => {
  it('tracks cache hits and misses correctly', async () => {
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);
    const desc1 = { id: 'rId-header-default', kind: 'header' } as const;
    const desc2 = { id: 'rId-header-odd', kind: 'header' } as const;

    // Initial stats should be zero
    let stats = manager.getCacheStats();
    expect(stats.cacheHits).toBe(0);
    expect(stats.cacheMisses).toBe(0);
    expect(stats.hitRate).toBe(0);

    // First access - cache miss
    await manager.ensureEditor(desc1);
    stats = manager.getCacheStats();
    expect(stats.cacheMisses).toBe(1);
    expect(stats.cacheHits).toBe(0);
    expect(stats.hitRate).toBe(0);

    // Second access to same descriptor - cache hit
    await manager.ensureEditor(desc1);
    stats = manager.getCacheStats();
    expect(stats.cacheHits).toBe(1);
    expect(stats.cacheMisses).toBe(1);
    expect(stats.hitRate).toBe(0.5); // 1 hit out of 2 accesses

    // Access different descriptor - cache miss
    await manager.ensureEditor(desc2);
    stats = manager.getCacheStats();
    expect(stats.cacheHits).toBe(1);
    expect(stats.cacheMisses).toBe(2);
    expect(stats.hitRate).toBeCloseTo(1 / 3); // 1 hit out of 3 accesses

    // Access first descriptor again - cache hit
    await manager.ensureEditor(desc1);
    stats = manager.getCacheStats();
    expect(stats.cacheHits).toBe(2);
    expect(stats.cacheMisses).toBe(2);
    expect(stats.hitRate).toBe(0.5); // 2 hits out of 4 accesses
  });

  it('tracks evictions when cache limit is exceeded', async () => {
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);
    manager.setMaxCachedEditors(2);

    const desc1 = { id: 'rId-header-default', kind: 'header' } as const;
    const desc2 = { id: 'rId-header-odd', kind: 'header' } as const;
    const desc3 = { id: 'rId-footer-default', kind: 'footer' } as const;

    await manager.ensureEditor(desc1);
    await manager.ensureEditor(desc2);

    let stats = manager.getCacheStats();
    expect(stats.evictions).toBe(0);
    expect(stats.cachedEditors).toBe(2);

    // Adding third editor should evict the first one
    await manager.ensureEditor(desc3);
    stats = manager.getCacheStats();
    expect(stats.evictions).toBe(1);
    expect(stats.cachedEditors).toBe(2);
  });

  it('tracks evictions when setMaxCachedEditors reduces limit', () => {
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);

    let stats = manager.getCacheStats();
    expect(stats.maxCachedEditors).toBe(10); // Default

    manager.setMaxCachedEditors(5);
    stats = manager.getCacheStats();
    expect(stats.maxCachedEditors).toBe(5);
  });

  it('resetCacheStats clears statistics without affecting cached editors', async () => {
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);
    const desc1 = { id: 'rId-header-default', kind: 'header' } as const;

    await manager.ensureEditor(desc1);
    await manager.ensureEditor(desc1);

    let stats = manager.getCacheStats();
    expect(stats.cacheHits).toBe(1);
    expect(stats.cacheMisses).toBe(1);
    expect(stats.cachedEditors).toBe(1);

    manager.resetCacheStats();

    stats = manager.getCacheStats();
    expect(stats.cacheHits).toBe(0);
    expect(stats.cacheMisses).toBe(0);
    expect(stats.evictions).toBe(0);
    expect(stats.cachedEditors).toBe(1); // Editors still cached
  });

  it('returns correct cache size and max in stats', async () => {
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);
    manager.setMaxCachedEditors(3);

    const desc1 = { id: 'rId-header-default', kind: 'header' } as const;
    const desc2 = { id: 'rId-header-odd', kind: 'header' } as const;

    let stats = manager.getCacheStats();
    expect(stats.cachedEditors).toBe(0);
    expect(stats.maxCachedEditors).toBe(3);

    await manager.ensureEditor(desc1);
    stats = manager.getCacheStats();
    expect(stats.cachedEditors).toBe(1);

    await manager.ensureEditor(desc2);
    stats = manager.getCacheStats();
    expect(stats.cachedEditors).toBe(2);
  });

  it('calculates hit rate as 1.0 when all accesses are hits', async () => {
    const editor = createMockEditor();
    const manager = new HeaderFooterEditorManager(editor);
    const desc1 = { id: 'rId-header-default', kind: 'header' } as const;

    // First access is a miss
    await manager.ensureEditor(desc1);

    // Reset stats to start fresh
    manager.resetCacheStats();

    // All subsequent accesses are hits
    await manager.ensureEditor(desc1);
    await manager.ensureEditor(desc1);
    await manager.ensureEditor(desc1);

    const stats = manager.getCacheStats();
    expect(stats.hitRate).toBe(1.0); // 3 hits, 0 misses = 100%
  });
});
