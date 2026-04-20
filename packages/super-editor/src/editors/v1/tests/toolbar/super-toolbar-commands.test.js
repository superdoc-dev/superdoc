import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SuperToolbar } from '../../components/toolbar/super-toolbar.js';

vi.mock('prosemirror-history', () => ({
  undoDepth: () => 0,
  redoDepth: () => 0,
}));

vi.mock('@core/helpers/getActiveFormatting.js', () => ({
  getActiveFormatting: vi.fn(() => []),
}));

vi.mock('@helpers/isInTable.js', () => ({
  isInTable: vi.fn(() => false),
}));

vi.mock('@extensions/linked-styles/index.js', () => ({
  getQuickFormatList: vi.fn(() => []),
}));

vi.mock('@extensions/track-changes/permission-helpers.js', () => ({
  collectTrackedChanges: vi.fn(() => []),
  isTrackedChangeActionAllowed: vi.fn(() => true),
}));

vi.mock('../../components/toolbar/defaultItems.js', () => ({
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

describe('SuperToolbar headless execute routing', () => {
  let toolbar;
  let mockEditor;
  let mockController;

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
      focus: vi.fn(),
      view: {
        hasFocus: vi.fn(() => true),
      },
      options: { isHeaderOrFooter: false, mode: 'docx' },
      state: {
        selection: { from: 1, to: 1, $from: mockResolvedPos },
        doc: {
          content: { size: 10 },
          resolve: vi.fn(() => mockResolvedPos),
          nodeAt: vi.fn(() => ({ marks: [] })),
          nodesBetween: vi.fn(() => {}),
        },
      },
      commands: {
        setColor: vi.fn(),
        setFieldAnnotationsTextColor: vi.fn(),
        setHighlight: vi.fn(),
        setFieldAnnotationsTextHighlight: vi.fn(),
        setCellBackground: vi.fn(),
        someLegacyCommand: vi.fn(),
      },
    };

    toolbar = new SuperToolbar({ editor: mockEditor, hideButtons: false });
    toolbar.updateToolbarState = vi.fn();
    mockController = {
      execute: vi.fn(),
    };
    toolbar.controller = mockController;
  });

  const emitCommand = (item, argument) => {
    toolbar.emitCommand({ item, argument });
  };

  it('routes color through headless controller with text-color id', () => {
    const item = { command: 'setColor', name: { value: 'color' } };
    emitCommand(item, '#123456');

    expect(mockEditor.focus).toHaveBeenCalled();
    expect(mockController.execute).toHaveBeenCalledWith('text-color', '#123456');
    expect(mockEditor.commands.setColor).not.toHaveBeenCalled();
    expect(toolbar.updateToolbarState).toHaveBeenCalledTimes(1);
  });

  it('routes highlight through headless controller with highlight-color id', () => {
    const item = { command: 'setHighlight', name: { value: 'highlight' } };
    emitCommand(item, '#fedcba');

    expect(mockController.execute).toHaveBeenCalledWith('highlight-color', '#fedcba');
    expect(mockEditor.commands.setHighlight).not.toHaveBeenCalled();
    expect(toolbar.updateToolbarState).toHaveBeenCalledTimes(1);
  });

  it('falls back to editor.commands for non-headless items', () => {
    const item = { command: 'someLegacyCommand', name: { value: 'customButton' } };
    emitCommand(item, 'payload');

    expect(mockController.execute).not.toHaveBeenCalled();
    expect(mockEditor.commands.someLegacyCommand).toHaveBeenCalledWith('payload');
    expect(toolbar.updateToolbarState).toHaveBeenCalledTimes(1);
  });

  it('does not route headless commands when controller is unavailable', () => {
    toolbar.controller = null;
    const item = { command: 'setColor', name: { value: 'color' } };

    expect(() => emitCommand(item, '#abcdef')).not.toThrow();
    expect(mockEditor.commands.setColor).toHaveBeenCalledWith('#abcdef');
    expect(toolbar.updateToolbarState).toHaveBeenCalledTimes(1);
  });
});

describe('SuperToolbar sticky mark persistence', () => {
  let toolbar;
  let mockEditor;
  let mockTransaction;

  beforeEach(() => {
    ensureDomApis();

    mockTransaction = {
      setStoredMarks: vi.fn(() => ({ storedMarksSet: true })),
    };

    mockEditor = {
      focus: vi.fn(),
      view: {
        hasFocus: vi.fn(() => false),
        dispatch: vi.fn(),
      },
      options: { isHeaderOrFooter: false, mode: 'docx' },
      state: {
        selection: { empty: true },
        storedMarks: null,
        tr: mockTransaction,
      },
      commands: {
        toggleBold: vi.fn(() => {
          mockEditor.state.storedMarks = [{ type: 'bold' }];
        }),
        toggleFieldAnnotationsFormat: vi.fn(),
      },
    };

    toolbar = new SuperToolbar({ hideButtons: false });
    toolbar.activeEditor = mockEditor;
    toolbar.updateToolbarState = vi.fn();
  });

  it('restores sticky stored marks when selection updates to empty position with no formatting after pending mark commands execute', () => {
    const item = { command: 'toggleBold', name: { value: 'bold' }, activate: vi.fn() };

    toolbar.emitCommand({ item });

    expect(toolbar.pendingMarkCommands).toHaveLength(1);

    // Execute pending mark command when selection updates
    toolbar.onEditorSelectionUpdate();
    expect(mockEditor.commands.toggleBold).toHaveBeenCalled();
    expect(toolbar.pendingMarkCommands).toHaveLength(0);
    expect(toolbar.updateToolbarState).toHaveBeenCalled();

    // Simulate moving the caret to an empty area that has no marks
    mockEditor.state.storedMarks = null;
    toolbar.onEditorSelectionUpdate();

    expect(mockTransaction.setStoredMarks).toHaveBeenCalledWith([{ type: 'bold' }]);
    expect(mockEditor.view.dispatch).toHaveBeenCalledWith({ storedMarksSet: true });
    expect(toolbar.updateToolbarState).toHaveBeenCalled();
  });

  it('clears sticky stored marks and does not restore them when user toggles formatting off on empty selection', () => {
    mockEditor.view.hasFocus = vi.fn(() => true);
    const item = { command: 'toggleBold', name: { value: 'bold' }, activate: vi.fn() };

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

  it('replays pending fontSize commands through the current command path and clears the queue', () => {
    const setFontSize = vi.fn();
    mockEditor.commands.setFontSize = setFontSize;
    mockEditor.view.hasFocus = vi.fn(() => false);

    const item = { command: 'setFontSize', name: { value: 'fontSize' }, activate: vi.fn() };

    toolbar.emitCommand({ item, argument: '24pt' });

    expect(toolbar.pendingMarkCommands).toHaveLength(1);

    expect(() => toolbar.onEditorSelectionUpdate()).not.toThrow();
    expect(setFontSize).toHaveBeenCalledWith('24pt');
    expect(toolbar.pendingMarkCommands).toHaveLength(0);
  });

  it('passes activation attrs to activate() for setFontSize when editor is unfocused', () => {
    mockEditor.view.hasFocus = vi.fn(() => false);
    const item = {
      command: 'setFontSize',
      name: { value: 'fontSize' },
      labelAttr: { value: 'fontSize' },
      activate: vi.fn(),
    };

    toolbar.emitCommand({ item, argument: '24pt' });

    expect(item.activate).toHaveBeenCalledWith({ fontSize: '24pt' });
  });

  it('passes activation attrs to activate() for setFontFamily when editor is unfocused', () => {
    mockEditor.view.hasFocus = vi.fn(() => false);
    const item = {
      command: 'setFontFamily',
      name: { value: 'fontFamily' },
      labelAttr: { value: 'fontFamily' },
      activate: vi.fn(),
    };

    toolbar.emitCommand({ item, argument: 'Arial, sans-serif' });

    expect(item.activate).toHaveBeenCalledWith({ fontFamily: 'Arial, sans-serif' });
  });

  it('calls activate() without attrs for non-font mark toggles when editor is unfocused', () => {
    mockEditor.view.hasFocus = vi.fn(() => false);
    const item = { command: 'toggleBold', name: { value: 'bold' }, activate: vi.fn() };

    toolbar.emitCommand({ item });

    expect(item.activate).toHaveBeenCalledWith();
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
      focus: vi.fn(),
      options: { isHeaderOrFooter: false, mode: 'docx' },
      state: {
        selection: { from: 1, to: 1, $from: mockResolvedPos },
        doc: {
          content: { size: 10 },
          resolve: vi.fn(() => mockResolvedPos),
          nodeAt: vi.fn(() => ({ marks: [] })),
          nodesBetween: vi.fn(() => {}),
        },
      },
      commands: {
        someCommand: vi.fn(),
      },
    };

    toolbar = new SuperToolbar({ editor: mockEditor, hideButtons: false });
    toolbar.updateToolbarState = vi.fn();
  });

  it('emits exception event when command is not found in editor.commands or interceptedCommands', () => {
    const exceptionListener = vi.fn();
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
    const exceptionListener = vi.fn();
    toolbar.on('exception', exceptionListener);

    // Setup: Make the command throw an error
    mockEditor.commands.toggleBold = vi.fn(() => {
      throw new Error('Test error during command execution');
    });
    mockEditor.view = { hasFocus: () => false };

    // Queue a pending command (when editor not focused)
    const item = { command: 'toggleBold', name: { value: 'bold' }, activate: vi.fn() };
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
