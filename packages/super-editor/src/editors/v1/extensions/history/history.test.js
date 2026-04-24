import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockOriginalUndo, mockOriginalRedo, mockYUndo, mockYRedo, mockYUndoPlugin } = vi.hoisted(() => ({
  mockOriginalUndo: vi.fn(),
  mockOriginalRedo: vi.fn(),
  mockYUndo: vi.fn(),
  mockYRedo: vi.fn(),
  mockYUndoPlugin: vi.fn(() => ({ key: 'mock-y-undo-plugin' })),
}));

vi.mock('prosemirror-history', () => ({
  history: vi.fn(() => ({ key: 'mock-history-plugin' })),
  undo: mockOriginalUndo,
  redo: mockOriginalRedo,
}));

vi.mock('y-prosemirror', () => ({
  undo: mockYUndo,
  redo: mockYRedo,
  yUndoPlugin: mockYUndoPlugin,
}));

import { History, runEditorRedo, runEditorUndo } from './history.js';

function createEditor(overrides = {}) {
  const tr = {
    setMeta: vi.fn().mockReturnThis(),
    selection: { empty: true },
    setSelection: vi.fn().mockReturnThis(),
  };
  const dispatch = vi.fn();
  const editor = {
    options: {},
    state: { tr },
    view: { dispatch },
    dispatch,
    setOptions: vi.fn(),
    ...overrides,
  };

  return { editor, tr, dispatch };
}

describe('History extension', () => {
  beforeEach(() => {
    mockOriginalUndo.mockReset();
    mockOriginalRedo.mockReset();
    mockYUndo.mockReset();
    mockYRedo.mockReset();
    mockYUndoPlugin.mockClear();
  });

  it.each([
    ['undo', runEditorUndo, mockOriginalUndo, 'historyUndo'],
    ['redo', runEditorRedo, mockOriginalRedo, 'historyRedo'],
  ])('runs local %s history against the target editor directly', (_label, runner, originalCommand, inputType) => {
    const { editor, tr, dispatch } = createEditor();
    const historyTr = {
      setMeta: vi.fn().mockReturnThis(),
      selection: { empty: true },
    };

    originalCommand.mockImplementation((_state, wrappedDispatch) => {
      wrappedDispatch(historyTr);
      return true;
    });

    const result = runner(editor);

    expect(result).toBe(true);
    expect(historyTr.setMeta).toHaveBeenCalledWith('inputType', inputType);
    expect(tr.setMeta).not.toHaveBeenCalledWith('inputType', inputType);
    expect(editor.setOptions).toHaveBeenCalledWith({
      preservedSelection: null,
      lastSelection: null,
    });
    expect(dispatch).toHaveBeenCalledWith(historyTr);
  });

  it.each([
    ['undo', runEditorUndo, mockOriginalUndo],
    ['redo', runEditorRedo, mockOriginalRedo],
  ])('keeps local %s side-effect free when dispatch is disallowed', (_label, runner, originalCommand) => {
    const { editor, tr, dispatch } = createEditor();

    originalCommand.mockReturnValue(true);

    const result = runner(editor, { allowDispatch: false });

    expect(result).toBe(true);
    expect(originalCommand).toHaveBeenCalledWith(editor.state, undefined);
    expect(tr.setMeta).not.toHaveBeenCalledWith('inputType', expect.anything());
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each([
    ['undo', 'undo', mockOriginalUndo],
    ['redo', 'redo', mockOriginalRedo],
  ])('keeps local %s side-effect free inside can()', (_label, commandName, originalCommand) => {
    const { editor, tr, dispatch } = createEditor();

    originalCommand.mockReturnValue(true);

    const commands = History.config.addCommands.call({
      editor,
      options: { depth: 100, newGroupDelay: 500 },
    });

    const result = commands[commandName]()({ tr, dispatch: undefined });

    expect(result).toBe(true);
    expect(tr.setMeta).toHaveBeenCalledWith('preventDispatch', true);
    expect(originalCommand).toHaveBeenCalledWith(editor.state, undefined);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each([
    ['undo', runEditorUndo, mockYUndo],
    ['redo', runEditorRedo, mockYRedo],
  ])('keeps collaborative %s side-effect free when dispatch is disallowed', (_label, runner, collabCommand) => {
    const { editor, dispatch } = createEditor({
      options: { collaborationProvider: { id: 'provider' }, ydoc: { guid: 'ydoc' } },
    });

    collabCommand.mockReturnValue(true);

    const result = runner(editor, { allowDispatch: false });

    expect(result).toBe(true);
    expect(collabCommand).toHaveBeenCalledWith(editor.state, undefined);
    expect(dispatch).not.toHaveBeenCalled();
    expect(editor.setOptions).not.toHaveBeenCalled();
  });

  it.each([
    ['undo', 'undo'],
    ['redo', 'redo'],
  ])('routes %s through PresentationEditor when the body editor is active', (_label, commandName) => {
    const presentationEditor = {
      getActiveEditor: vi.fn(),
      undo: vi.fn(() => true),
      redo: vi.fn(() => true),
      canUndo: vi.fn(() => true),
      canRedo: vi.fn(() => true),
    };
    const { editor, tr } = createEditor({ presentationEditor });
    presentationEditor.getActiveEditor.mockReturnValue(editor);

    const commands = History.config.addCommands.call({
      editor,
      options: { depth: 100, newGroupDelay: 500 },
    });

    const result = commands[commandName]()({ tr, dispatch: () => undefined });

    expect(result).toBe(true);
    expect(tr.setMeta).toHaveBeenCalledWith('preventDispatch', true);
    expect(presentationEditor[commandName]).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['undo', 'undo', 'canUndo'],
    ['redo', 'redo', 'canRedo'],
  ])('keeps presentation-routed %s side-effect free inside can()', (_label, commandName, canMethodName) => {
    const presentationEditor = {
      getActiveEditor: vi.fn(),
      undo: vi.fn(() => true),
      redo: vi.fn(() => true),
      canUndo: vi.fn(() => true),
      canRedo: vi.fn(() => true),
    };
    const { editor, tr, dispatch } = createEditor({ presentationEditor });
    presentationEditor.getActiveEditor.mockReturnValue(editor);

    const commands = History.config.addCommands.call({
      editor,
      options: { depth: 100, newGroupDelay: 500 },
    });

    const result = commands[commandName]()({ tr, dispatch: undefined });

    expect(result).toBe(true);
    expect(tr.setMeta).toHaveBeenCalledWith('preventDispatch', true);
    expect(presentationEditor[canMethodName]).toHaveBeenCalledTimes(1);
    expect(presentationEditor[commandName]).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('keeps body-local undo local when a different presentation surface is active', () => {
    const presentationEditor = {
      getActiveEditor: vi.fn(() => ({ id: 'footer-editor' })),
      undo: vi.fn(() => true),
    };
    const { editor, tr } = createEditor({ presentationEditor });

    mockOriginalUndo.mockReturnValue(true);

    const commands = History.config.addCommands.call({
      editor,
      options: { depth: 100, newGroupDelay: 500 },
    });

    const result = commands.undo()({ tr, dispatch: () => undefined });

    expect(result).toBe(true);
    expect(presentationEditor.undo).not.toHaveBeenCalled();
    expect(mockOriginalUndo).toHaveBeenCalledWith(editor.state, expect.any(Function));
  });
});
