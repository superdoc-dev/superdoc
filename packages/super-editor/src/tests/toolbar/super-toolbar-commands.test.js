import { describe, it, expect, mock, beforeEach } from 'bun:test';
const { SuperToolbar } = await import('../../components/toolbar/super-toolbar.js');

mock.module('prosemirror-history', () => ({
  undoDepth: () => 0,
  redoDepth: () => 0,
}));

mock.module('@core/helpers/getActiveFormatting.js', () => ({
  getActiveFormatting: mock(() => []),
}));

mock.module('@helpers/isInTable.js', () => ({
  isInTable: mock(() => false),
}));

mock.module('@extensions/linked-styles/index.js', () => ({
  getQuickFormatList: mock(() => []),
}));

mock.module('@extensions/track-changes/permission-helpers.js', () => ({
  collectTrackedChanges: mock(() => []),
  isTrackedChangeActionAllowed: mock(() => true),
}));

mock.module('../../components/toolbar/defaultItems.js', () => ({
  makeDefaultItems: () => ({ defaultItems: [], overflowItems: [] }),
}));

const ensureDomApis = () => {
  if (!globalThis.document) {
    globalThis.document = { documentElement: { clientWidth: 1024 } };
  } else if (!globalThis.document.documentElement) {
    globalThis.document.documentElement = { clientWidth: 1024 };
  } else if (typeof globalThis.document.documentElement.clientWidth !== 'number') {
    globalThis.document.documentElement.clientWidth = 1024;
  }

  if (!globalThis.window) {
    globalThis.window = {};
  }

  if (!globalThis.window.matchMedia) {
    globalThis.window.matchMedia = () => ({ matches: false });
  }
};

describe('SuperToolbar intercepted color commands', () => {
  let toolbar;
  let mockEditor;

  beforeEach(() => {
    ensureDomApis();

    const mockParagraphNode = { type: { name: 'paragraph' }, attrs: { paragraphProperties: {} } };
    const mockResolvedPos = {
      depth: 1,
      node: () => mockParagraphNode,
      before: () => 0,
      start: () => 0,
    };

    mockEditor = {
      focus: mock(),
      options: { isHeaderOrFooter: false, mode: 'docx' },
      state: {
        selection: { from: 1, to: 1, $from: mockResolvedPos },
        doc: {
          content: { size: 10 },
          resolve: mock(() => mockResolvedPos),
          nodeAt: mock(() => ({ marks: [] })),
          nodesBetween: mock(() => {}),
        },
      },
      commands: {
        setColor: mock(),
        setFieldAnnotationsTextColor: mock(),
        setHighlight: mock(),
        setFieldAnnotationsTextHighlight: mock(),
        setCellBackground: mock(),
      },
    };

    toolbar = new SuperToolbar({ editor: mockEditor, hideButtons: false });
    toolbar.updateToolbarState = mock();
  });

  const emitCommand = (command, argument) => {
    const item = { command };
    toolbar.emitCommand({ item, argument });
  };

  it('setColor applies inline color (#123456) and updates field annotations with the same color', () => {
    emitCommand('setColor', '#123456');

    expect(mockEditor.focus).toHaveBeenCalled();
    expect(mockEditor.commands.setColor).toHaveBeenCalledWith('#123456');
    expect(mockEditor.commands.setFieldAnnotationsTextColor).toHaveBeenCalledWith('#123456', true);
    expect(toolbar.updateToolbarState).toHaveBeenCalledTimes(1);
  });

  it('setColor treats "none" argument as "inherit" for inline color and null for annotations', () => {
    emitCommand('setColor', 'none');

    expect(mockEditor.commands.setColor).toHaveBeenCalledWith('inherit');
    expect(mockEditor.commands.setFieldAnnotationsTextColor).toHaveBeenCalledWith(null, true);
    expect(toolbar.updateToolbarState).toHaveBeenCalledTimes(1);
  });

  it('setColor skips work when argument is missing', () => {
    emitCommand('setColor');

    expect(mockEditor.commands.setColor).not.toHaveBeenCalled();
    expect(mockEditor.commands.setFieldAnnotationsTextColor).not.toHaveBeenCalled();
    expect(toolbar.updateToolbarState).not.toHaveBeenCalled();
  });

  it('setColor skips work when argument is undefined', () => {
    emitCommand('setColor', undefined);

    expect(mockEditor.commands.setColor).not.toHaveBeenCalled();
    expect(mockEditor.commands.setFieldAnnotationsTextColor).not.toHaveBeenCalled();
    expect(toolbar.updateToolbarState).not.toHaveBeenCalled();
  });

  it('setColor skips work when argument is empty string', () => {
    emitCommand('setColor', '');

    expect(mockEditor.commands.setColor).not.toHaveBeenCalled();
    expect(mockEditor.commands.setFieldAnnotationsTextColor).not.toHaveBeenCalled();
    expect(toolbar.updateToolbarState).not.toHaveBeenCalled();
  });

  it('setColor applies color value even with potentially invalid format (browser handles validation)', () => {
    emitCommand('setColor', 'invalid-color-format');

    expect(mockEditor.commands.setColor).toHaveBeenCalledWith('invalid-color-format');
    expect(mockEditor.commands.setFieldAnnotationsTextColor).toHaveBeenCalledWith('invalid-color-format', true);
    expect(toolbar.updateToolbarState).toHaveBeenCalledTimes(1);
  });

  it('setHighlight applies highlight color (#fedcba) to inline marks, field annotations, and table cell background', () => {
    emitCommand('setHighlight', '#fedcba');

    expect(mockEditor.commands.setHighlight).toHaveBeenCalledWith('#fedcba');
    expect(mockEditor.commands.setFieldAnnotationsTextHighlight).toHaveBeenCalledWith('#fedcba', true);
    expect(mockEditor.commands.setCellBackground).toHaveBeenCalledWith('#fedcba');
    expect(toolbar.updateToolbarState).toHaveBeenCalledTimes(1);
  });

  it('setHighlight with "none" argument sets transparent inline mark for cascade-aware negation while clearing annotations', () => {
    emitCommand('setHighlight', 'none');

    expect(mockEditor.commands.setHighlight).toHaveBeenCalledWith('transparent');
    expect(mockEditor.commands.setFieldAnnotationsTextHighlight).toHaveBeenCalledWith(null, true);
    expect(mockEditor.commands.setCellBackground).toHaveBeenCalledWith(null);
    expect(toolbar.updateToolbarState).toHaveBeenCalledTimes(1);
  });

  it('setHighlight skips work when argument is missing', () => {
    emitCommand('setHighlight');

    expect(mockEditor.commands.setHighlight).not.toHaveBeenCalled();
    expect(mockEditor.commands.setFieldAnnotationsTextHighlight).not.toHaveBeenCalled();
    expect(mockEditor.commands.setCellBackground).not.toHaveBeenCalled();
    expect(toolbar.updateToolbarState).not.toHaveBeenCalled();
  });

  it('setColor and setHighlight do not execute any commands when activeEditor is null', () => {
    toolbar.activeEditor = null;

    emitCommand('setColor', '#abcdef');
    emitCommand('setHighlight', '#abcdef');

    expect(mockEditor.commands.setColor).not.toHaveBeenCalled();
    expect(mockEditor.commands.setFieldAnnotationsTextColor).not.toHaveBeenCalled();
    expect(mockEditor.commands.setHighlight).not.toHaveBeenCalled();
    expect(mockEditor.commands.setFieldAnnotationsTextHighlight).not.toHaveBeenCalled();
    expect(mockEditor.commands.setCellBackground).not.toHaveBeenCalled();
    expect(toolbar.updateToolbarState).not.toHaveBeenCalled();
  });
});

describe('SuperToolbar sticky mark persistence', () => {
  let toolbar;
  let mockEditor;
  let mockTransaction;

  beforeEach(() => {
    ensureDomApis();

    mockTransaction = {
      setStoredMarks: mock(() => ({ storedMarksSet: true })),
    };

    mockEditor = {
      focus: mock(),
      view: {
        hasFocus: mock(() => false),
        dispatch: mock(),
      },
      options: { isHeaderOrFooter: false, mode: 'docx' },
      state: {
        selection: { empty: true },
        storedMarks: null,
        tr: mockTransaction,
      },
      commands: {
        toggleBold: mock(() => {
          mockEditor.state.storedMarks = [{ type: 'bold' }];
        }),
        toggleFieldAnnotationsFormat: mock(),
      },
    };

    toolbar = new SuperToolbar({ hideButtons: false });
    toolbar.activeEditor = mockEditor;
    toolbar.updateToolbarState = mock();
  });

  it('restores sticky stored marks when selection updates to empty position with no formatting after pending mark commands execute', () => {
    const item = { command: 'toggleBold', name: { value: 'bold' }, activate: mock() };

    toolbar.emitCommand({ item });

    expect(toolbar.pendingMarkCommands).toHaveLength(1);

    // Execute pending mark command when selection updates
    toolbar.onEditorSelectionUpdate();
    expect(mockEditor.commands.toggleBold).toHaveBeenCalled();
    expect(toolbar.pendingMarkCommands).toHaveLength(0);
    expect(toolbar.updateToolbarState).toHaveBeenCalledTimes(2);

    // Simulate moving the caret to an empty area that has no marks
    mockEditor.state.storedMarks = null;
    toolbar.onEditorSelectionUpdate();

    expect(mockTransaction.setStoredMarks).toHaveBeenCalledWith([{ type: 'bold' }]);
    expect(mockEditor.view.dispatch).toHaveBeenCalledWith({ storedMarksSet: true });
    expect(toolbar.updateToolbarState).toHaveBeenCalledTimes(3);
  });

  it('clears sticky stored marks and does not restore them when user toggles formatting off on empty selection', () => {
    mockEditor.view.hasFocus = mock(() => true);
    const item = { command: 'toggleBold', name: { value: 'bold' }, activate: mock() };

    // Toggle on and capture sticky marks
    toolbar.emitCommand({ item });
    expect(toolbar.stickyStoredMarks).toEqual([{ type: 'bold' }]);

    // Toggle off and ensure sticky marks are cleared
    mockEditor.commands.toggleBold.mockImplementation(() => {
      mockEditor.state.storedMarks = null;
    });
    toolbar.emitCommand({ item });
    expect(toolbar.stickyStoredMarks).toBeNull();

    toolbar.onEditorSelectionUpdate();
    expect(mockEditor.view.dispatch).not.toHaveBeenCalled();
    expect(toolbar.updateToolbarState).toHaveBeenCalledTimes(2);
  });

  it('uses intercepted command implementation (setFontSize) instead of direct editor command when replaying pending mark commands', () => {
    const throwingSetFontSize = mock(() => {
      throw new Error('should not be called directly');
    });

    mockEditor.commands.setFontSize = throwingSetFontSize;
    mockEditor.commands.setFieldAnnotationsFontSize = mock();
    mockEditor.view.hasFocus = mock(() => false);

    const item = { command: 'setFontSize', name: { value: 'fontSize' }, activate: mock() };

    toolbar.emitCommand({ item });

    expect(toolbar.pendingMarkCommands).toHaveLength(1);

    // Should use intercepted command, so the direct command never runs
    expect(() => toolbar.onEditorSelectionUpdate()).not.toThrow();
    expect(throwingSetFontSize).not.toHaveBeenCalled();
    expect(toolbar.pendingMarkCommands).toHaveLength(0);
  });
});

describe('SuperToolbar error handling for command failures', () => {
  let toolbar;
  let mockEditor;

  beforeEach(() => {
    ensureDomApis();

    const mockParagraphNode = { type: { name: 'paragraph' }, attrs: { paragraphProperties: {} } };
    const mockResolvedPos = {
      depth: 1,
      node: () => mockParagraphNode,
      before: () => 0,
      start: () => 0,
    };

    mockEditor = {
      focus: mock(),
      options: { isHeaderOrFooter: false, mode: 'docx' },
      state: {
        selection: { from: 1, to: 1, $from: mockResolvedPos },
        doc: {
          content: { size: 10 },
          resolve: mock(() => mockResolvedPos),
          nodeAt: mock(() => ({ marks: [] })),
          nodesBetween: mock(() => {}),
        },
      },
      commands: {
        someCommand: mock(),
      },
    };

    toolbar = new SuperToolbar({ editor: mockEditor, hideButtons: false });
    toolbar.updateToolbarState = mock();
  });

  it('emits exception event when command is not found in editor.commands or interceptedCommands', () => {
    const exceptionListener = mock();
    toolbar.on('exception', exceptionListener);

    const item = { command: 'nonExistentCommand' };
    expect(() => {
      toolbar.emitCommand({ item });
    }).toThrow('[super-toolbar 🎨] Command not found: nonExistentCommand');

    expect(exceptionListener).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(Error),
        editor: mockEditor,
      }),
    );
  });

  it('emits exception event when pending mark command execution fails', () => {
    const exceptionListener = mock();
    toolbar.on('exception', exceptionListener);

    // Setup: Make the command throw an error
    mockEditor.commands.toggleBold = mock(() => {
      throw new Error('Test error during command execution');
    });
    mockEditor.view = { hasFocus: () => false };

    // Queue a pending command (when editor not focused)
    const item = { command: 'toggleBold', name: { value: 'bold' }, activate: mock() };
    toolbar.emitCommand({ item });

    expect(toolbar.pendingMarkCommands).toHaveLength(1);

    // Execute pending command - should catch error and emit exception
    toolbar.onEditorSelectionUpdate();

    expect(exceptionListener).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(Error),
        editor: mockEditor,
        originalError: expect.any(Error),
      }),
    );
    expect(toolbar.pendingMarkCommands).toHaveLength(0);
  });
});
