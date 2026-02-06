import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockEditor, createBeforeEachSetup } from './testHelpers.js';

// Mock the modules first
vi.mock('../../../core/utilities/clipboardUtils.js');
vi.mock('../../cursor-helpers.js', async () => {
  const actual = await vi.importActual('../../cursor-helpers.js');
  return {
    ...actual,
    selectionHasNodeOrMark: vi.fn(),
  };
});
vi.mock('../constants.js', () => ({
  tableActionsOptions: [{ label: 'Add Row', command: 'addRow', icon: '<svg>add-row</svg>' }],
}));
vi.mock('prosemirror-history', () => ({
  undoDepth: vi.fn(() => 0),
  redoDepth: vi.fn(() => 0),
}));
vi.mock('y-prosemirror', () => ({
  yUndoPluginKey: {
    getState: vi.fn(() => ({ undoManager: { undoStack: [], redoStack: [] } })),
  },
}));

vi.mock('@extensions/track-changes/permission-helpers.js', () => ({
  collectTrackedChanges: vi.fn(() => []),
  collectTrackedChangesForContext: vi.fn(() => []),
  isTrackedChangeActionAllowed: vi.fn(() => true),
}));

vi.mock('@core/commands/list-helpers', () => ({
  isList: vi.fn(() => false),
}));

import {
  getEditorContext,
  getPropsByItemId,
  __getStructureFromResolvedPosForTest,
  __isCollaborationEnabledForTest,
} from '../utils.js';
import { isList } from '@core/commands/list-helpers';
import { readFromClipboard } from '../../../core/utilities/clipboardUtils.js';
import { selectionHasNodeOrMark } from '../../cursor-helpers.js';
import { undoDepth, redoDepth } from 'prosemirror-history';
import { yUndoPluginKey } from 'y-prosemirror';

// Get the mocked functions
const mockReadFromClipboard = vi.mocked(readFromClipboard);
const mockSelectionHasNodeOrMark = vi.mocked(selectionHasNodeOrMark);
const mockUndoDepth = vi.mocked(undoDepth);
const mockRedoDepth = vi.mocked(redoDepth);
const mockYUndoPluginKeyGetState = vi.mocked(yUndoPluginKey.getState);

describe('utils.js', () => {
  let mockEditor;

  beforeEach(
    createBeforeEachSetup(() => {
      // Clear mock call history but keep implementations
      mockReadFromClipboard.mockClear();
      mockSelectionHasNodeOrMark.mockClear();

      // Reset selection mock to default
      mockSelectionHasNodeOrMark.mockReturnValue(false);

      mockUndoDepth.mockReturnValue(1);
      mockRedoDepth.mockReturnValue(1);
      mockYUndoPluginKeyGetState.mockReturnValue({ undoManager: { undoStack: [1], redoStack: [1] } });

      // Create editor with default configuration
      mockEditor = createMockEditor({
        documentMode: 'editing',
        isEditable: true,
        view: {
          state: {
            selectedText: 'selected text',
            undoDepth: 2,
            redoDepth: 1,
          },
        },
      });
    }),
  );

  describe('getEditorContext', () => {
    it('should return comprehensive editor context', async () => {
      // Note: getEditorContext() no longer reads clipboard proactively.
      // Clipboard reading is deferred to paste action to avoid permission prompts.
      mockSelectionHasNodeOrMark.mockReturnValue(false);

      const context = await getEditorContext(mockEditor);

      expect(context).toEqual({
        // Selection info
        selectedText: 'selected text',
        hasSelection: true,
        selectionStart: 10,
        selectionEnd: 15,
        trigger: 'slash',

        // Document structure
        isInTable: false,
        isInList: false,
        isInSectionNode: false,
        currentNodeType: 'paragraph',
        activeMarks: [],

        // Document state
        isTrackedChange: false,
        trackedChangeId: null,
        trackedChanges: [],
        documentMode: 'editing',
        canUndo: true,
        canRedo: true,
        isEditable: true,

        // Clipboard - stubbed to avoid permission prompts
        clipboardContent: {
          html: null,
          text: null,
          hasContent: true, // Optimistic assumption
          raw: null,
        },

        // Position and trigger info
        cursorPosition: { x: 100, y: 200 },
        pos: 10,
        node: { type: { name: 'paragraph' } },
        event: undefined,

        // Editor reference
        editor: mockEditor,
      });

      // Verify clipboard is not read during context gathering
      expect(mockReadFromClipboard).not.toHaveBeenCalled();
    });

    it('should handle empty selection', async () => {
      // Reconfigure editor for empty selection
      mockEditor.view.state.selection.empty = true;
      mockEditor.view.state.selection.from = 10;
      mockEditor.view.state.selection.to = 10;
      mockEditor.view.state.doc.textBetween.mockReturnValue('');

      mockReadFromClipboard.mockResolvedValue({ html: null, text: null });
      mockSelectionHasNodeOrMark.mockReturnValue(false);

      const context = await getEditorContext(mockEditor);

      expect(context.selectedText).toBe('');
      expect(context.hasSelection).toBe(false);
      expect(context.selectionStart).toBe(10);
      expect(context.selectionEnd).toBe(10);
    });

    it('should detect active marks and tracked changes', async () => {
      const mockMark = { type: { name: 'trackInsert' } };
      mockEditor.view.state.storedMarks = [mockMark];
      mockEditor.view.state.selection.$head.marks.mockReturnValue([{ type: { name: 'bold' } }]);

      mockReadFromClipboard.mockResolvedValue({ html: null, text: null });
      mockSelectionHasNodeOrMark.mockReturnValue(false);

      const context = await getEditorContext(mockEditor);

      expect(context.activeMarks).toContain('trackInsert');
      expect(context.activeMarks).toContain('bold');
      expect(context.isTrackedChange).toBe(true);
      expect(Array.isArray(context.trackedChanges)).toBe(true);
    });

    it('should handle event-based context (right-click)', async () => {
      const mockEvent = { clientX: 300, clientY: 400 };

      mockReadFromClipboard.mockResolvedValue({ html: null, text: null });
      mockSelectionHasNodeOrMark.mockReturnValue(false);
      mockEditor.view.posAtCoords.mockReturnValue({ pos: 20 });
      mockEditor.view.state.doc.nodeAt.mockReturnValue({ type: { name: 'text' } });
      mockEditor.view.state.doc.content = { size: 100 }; // Add missing content.size mock
      mockEditor.view.state.doc.nodesBetween = vi.fn((from, to, callback) => {
        // Mock nodesBetween to call the callback with a node that has the expected mark
        const mockNode = {
          marks: [{ type: { name: 'trackDelete' }, attrs: { id: 'track-1' } }],
          nodeSize: 1,
        };
        callback(mockNode, 20); // Call callback with mock node at position 20
      });
      mockEditor.view.state.doc.resolve.mockReturnValue({
        depth: 5,
        node: (depth) => {
          const map = {
            0: { type: { name: 'doc' }, marks: [] },
            1: {
              type: { name: 'paragraph' },
              marks: [],
              attrs: {
                numberingProperties: { numId: 1, ilvl: 0 },
                listRendering: { numberingType: 'bullet' },
              },
            },
            2: { type: { name: 'orderedList' }, marks: [] },
            3: { type: { name: 'tableCell' }, marks: [] },
            4: { type: { name: 'tableRow' }, marks: [] },
            5: {
              type: { name: 'documentSection' },
              marks: [],
            },
          };
          return map[depth] || { type: { name: 'doc' }, marks: [] };
        },
        marks: vi.fn(() => []),
        // In ProseMirror, marks are on inline nodes, not block nodes
        nodeBefore: {
          type: { name: 'text' },
          marks: [{ type: { name: 'trackDelete' }, attrs: { id: 'track-1' } }],
        },
        nodeAfter: null,
      });

      isList.mockReturnValue(true);
      const context = await getEditorContext(mockEditor, mockEvent);

      expect(context.pos).toBe(20);
      expect(context.node).toEqual({ type: { name: 'text' } });
      expect(context.event).toBe(mockEvent);
      expect(context.trigger).toBe('click');
      expect(mockEditor.view.posAtCoords).toHaveBeenCalledWith({ left: 300, top: 400 });
      expect(context.isInTable).toBe(true);
      expect(context.isInList).toBe(true);
      expect(context.isInSectionNode).toBe(true);
      expect(context.trackedChangeId).toBe('track-1');
      expect(context.activeMarks).toContain('trackDelete');
      expect(context.isTrackedChange).toBe(true);
      expect(Array.isArray(context.trackedChanges)).toBe(true);
    });

    it('should detect tracked change marks directly at the resolved cursor position', async () => {
      const mockEvent = { clientX: 150, clientY: 250 };
      const trackFormatMark = { type: { name: 'trackFormat' }, attrs: { id: 'track-format-1' } };

      mockReadFromClipboard.mockResolvedValue({ html: null, text: null });
      mockSelectionHasNodeOrMark.mockReturnValue(false);
      mockEditor.view.posAtCoords.mockReturnValue({ pos: 42 });
      mockEditor.view.state.doc.nodeAt.mockReturnValue({ type: { name: 'text' } });
      mockEditor.view.state.doc.resolve.mockImplementation(() => ({
        depth: 1,
        node: (depth) => ({
          type: { name: depth === 1 ? 'paragraph' : 'doc' },
          marks: [],
        }),
        marks: () => [trackFormatMark],
        nodeBefore: null,
        nodeAfter: null,
      }));

      const context = await getEditorContext(mockEditor, mockEvent);

      expect(context.activeMarks).toContain('trackFormat');
      expect(context.trackedChangeId).toBe('track-format-1');
      expect(context.isTrackedChange).toBe(true);
      expect(Array.isArray(context.trackedChanges)).toBe(true);
    });

    it('should detect tracked change marks on the node after the resolved position', async () => {
      const mockEvent = { clientX: 180, clientY: 280 };
      const trackDeleteMark = { type: { name: 'trackDelete' }, attrs: { id: 'track-after-1' } };

      mockReadFromClipboard.mockResolvedValue({ html: null, text: null });
      mockSelectionHasNodeOrMark.mockReturnValue(false);
      mockEditor.view.posAtCoords.mockReturnValue({ pos: 58 });
      mockEditor.view.state.doc.nodeAt.mockReturnValue({ type: { name: 'text' } });
      mockEditor.view.state.doc.resolve.mockImplementation(() => ({
        depth: 1,
        node: (depth) => ({
          type: { name: depth === 1 ? 'paragraph' : 'doc' },
          marks: [],
        }),
        marks: () => [],
        nodeBefore: null,
        nodeAfter: {
          type: { name: 'text' },
          marks: [trackDeleteMark],
        },
      }));

      const context = await getEditorContext(mockEditor, mockEvent);

      expect(context.activeMarks).toContain('trackDelete');
      expect(context.trackedChangeId).toBe('track-after-1');
      expect(context.isTrackedChange).toBe(true);
      expect(Array.isArray(context.trackedChanges)).toBe(true);
    });

    it('should handle document mode variations', async () => {
      mockEditor.options.documentMode = 'viewing';
      mockEditor.isEditable = false;

      mockReadFromClipboard.mockResolvedValue({ html: null, text: null });
      mockSelectionHasNodeOrMark.mockReturnValue(false);

      const context = await getEditorContext(mockEditor);

      expect(context.documentMode).toBe('viewing');
      expect(context.isEditable).toBe(false);
    });

    it('should derive canUndo/canRedo from editor command availability', async () => {
      delete mockEditor.view.state.history;

      mockEditor.can = vi.fn(() => ({
        undo: () => true,
        redo: () => false,
      }));

      mockUndoDepth.mockReturnValue(0);
      mockRedoDepth.mockReturnValue(0);

      mockReadFromClipboard.mockResolvedValue({ html: null, text: null });
      mockSelectionHasNodeOrMark.mockReturnValue(false);

      const context = await getEditorContext(mockEditor);

      expect(mockEditor.can).toHaveBeenCalled();
      expect(context.canUndo).toBe(true);
      expect(context.canRedo).toBe(false);
    });

    it('should fall back to history depth when editor.can is unavailable', async () => {
      mockEditor.can = undefined;
      mockUndoDepth.mockReturnValueOnce(2);
      mockRedoDepth.mockReturnValueOnce(0);
      mockYUndoPluginKeyGetState.mockReturnValueOnce({ undoManager: { undoStack: [], redoStack: [] } });

      mockReadFromClipboard.mockResolvedValue({ html: null, text: null });
      mockSelectionHasNodeOrMark.mockReturnValue(false);

      const context = await getEditorContext(mockEditor);

      expect(mockUndoDepth).toHaveBeenCalledWith(mockEditor.view.state);
      expect(mockRedoDepth).toHaveBeenCalledWith(mockEditor.view.state);
      expect(context.canUndo).toBe(true);
      expect(context.canRedo).toBe(false);
    });

    it('should use y-prosemirror undo manager when collaboration is enabled', async () => {
      mockEditor.options.collaborationProvider = {};
      mockEditor.options.ydoc = {};
      mockEditor.can = undefined;
      mockYUndoPluginKeyGetState
        .mockReturnValueOnce({
          undoManager: {
            undoStack: [{ id: 1 }],
            redoStack: [],
          },
        })
        .mockReturnValueOnce({
          undoManager: {
            undoStack: [{ id: 1 }],
            redoStack: [],
          },
        });
      mockUndoDepth.mockReturnValueOnce(0);
      mockRedoDepth.mockReturnValueOnce(0);

      mockReadFromClipboard.mockResolvedValue({ html: null, text: null });
      mockSelectionHasNodeOrMark.mockReturnValue(false);

      const context = await getEditorContext(mockEditor);

      expect(mockYUndoPluginKeyGetState).toHaveBeenCalledWith(mockEditor.view.state);
      expect(context.canUndo).toBe(true);
      expect(context.canRedo).toBe(false);
    });

    it('should return stubbed clipboard content to avoid permission prompts', async () => {
      // getEditorContext() no longer reads clipboard proactively to avoid
      // triggering browser permission prompts when slash menu opens.
      // Clipboard is read lazily when user actually clicks the paste action.
      mockSelectionHasNodeOrMark.mockReturnValue(false);

      const context = await getEditorContext(mockEditor);

      expect(context.clipboardContent).toEqual({
        html: null,
        text: null,
        hasContent: true, // Optimistic assumption - clipboard might have content
        raw: null,
      });

      // Verify we don't trigger permission prompts by reading clipboard
      expect(mockReadFromClipboard).not.toHaveBeenCalled();
    });

    it('should provide consistent clipboard stub regardless of actual clipboard state', async () => {
      // Even if clipboard utility is mocked with data, getEditorContext() should
      // not call it during context gathering to maintain UX improvement
      mockReadFromClipboard.mockResolvedValue({
        html: '<p>rich content</p>',
        text: 'plain content',
      });
      mockSelectionHasNodeOrMark.mockReturnValue(false);

      const context = await getEditorContext(mockEditor);

      expect(context.clipboardContent).toEqual({
        html: null,
        text: null,
        hasContent: true,
        raw: null,
      });

      // Clipboard should not be read during context gathering
      expect(mockReadFromClipboard).not.toHaveBeenCalled();
    });

    it('should defer clipboard reading to paste action handler', async () => {
      // This test documents the architectural decision: clipboard reading
      // was moved from eager (context gathering) to lazy (paste action).
      // Actual paste functionality is tested in ContextMenu.test.js
      mockSelectionHasNodeOrMark.mockReturnValue(false);

      const context = await getEditorContext(mockEditor);

      // Context provides clipboard stub
      expect(context.clipboardContent.hasContent).toBe(true);

      // But actual clipboard data is null until paste is invoked
      expect(context.clipboardContent.html).toBeNull();
      expect(context.clipboardContent.text).toBeNull();
      expect(context.clipboardContent.raw).toBeNull();

      // No clipboard read during context gathering
      expect(mockReadFromClipboard).not.toHaveBeenCalled();
    });
  });

  describe('getPropsByItemId', () => {
    let mockProps;

    beforeEach(() => {
      isList.mockReset();
      isList.mockReturnValue(false);
      mockProps = {
        editor: mockEditor,
        closePopover: vi.fn(),
      };
    });

    it('should return AI writer props for insert-text item', () => {
      mockEditor.options = {
        aiApiKey: 'test-key',
        aiEndpoint: 'https://test-endpoint.com',
      };

      const props = getPropsByItemId('insert-text', mockProps);

      expect(props).toEqual({
        editor: expect.any(Object),
        selectedText: 'selected text',
        handleClose: mockProps.closePopover,
        apiKey: 'test-key',
        endpoint: 'https://test-endpoint.com',
      });
    });

    it('should return table grid props for insert-table item', () => {
      const props = getPropsByItemId('insert-table', mockProps);

      expect(props).toHaveProperty('editor');
      expect(props).toHaveProperty('onSelect');
      expect(typeof props.onSelect).toBe('function');
    });

    it('should handle table insertion through onSelect', () => {
      mockEditor.commands = {
        insertTable: vi.fn(),
      };

      const props = getPropsByItemId('insert-table', mockProps);
      props.onSelect({ rows: 3, cols: 4 });

      expect(mockEditor.commands.insertTable).toHaveBeenCalledWith({ rows: 3, cols: 4 });
      expect(mockProps.closePopover).toHaveBeenCalled();
    });

    it('should return table actions props for edit-table item', () => {
      const props = getPropsByItemId('edit-table', mockProps);

      expect(props).toHaveProperty('editor');
      expect(props).toHaveProperty('options');
      expect(props).toHaveProperty('onSelect');
      expect(Array.isArray(props.options)).toBe(true);
      expect(typeof props.onSelect).toBe('function');
    });

    it('should handle table action execution through onSelect', () => {
      mockEditor.commands = {
        addRow: vi.fn(),
      };

      const props = getPropsByItemId('edit-table', mockProps);
      props.onSelect({ command: 'addRow' });

      expect(mockEditor.commands.addRow).toHaveBeenCalled();
      expect(mockProps.closePopover).toHaveBeenCalled();
    });

    it('should handle missing command gracefully in table actions', () => {
      mockEditor.commands = {};

      const props = getPropsByItemId('edit-table', mockProps);

      // Should not throw
      expect(() => props.onSelect({ command: 'nonexistentCommand' })).not.toThrow();
      expect(mockProps.closePopover).toHaveBeenCalled();
    });
  });

  describe('internal helpers', () => {
    it('should detect structure from resolved position', () => {
      const state = {
        doc: {
          resolve: vi.fn(() => ({
            depth: 4,
            node: (depth) => {
              const map = {
                1: { type: { name: 'paragraph' } },
                2: { type: { name: 'tableCell' } },
                3: { type: { name: 'tableRow' } },
                4: { type: { name: 'table' } },
              };
              return map[depth] || { type: { name: 'doc' } };
            },
          })),
        },
      };

      const result = __getStructureFromResolvedPosForTest(state, 42);

      expect(state.doc.resolve).toHaveBeenCalledWith(42);
      expect(result).toEqual({ isInTable: true, isInList: false, isInSectionNode: false });
    });

    it('should return null when position resolution fails', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const state = {
        doc: {
          resolve: vi.fn(() => {
            throw new Error('boom');
          }),
        },
      };

      const result = __getStructureFromResolvedPosForTest(state, 0);

      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should reflect collaboration enablement', () => {
      expect(__isCollaborationEnabledForTest({ options: { collaborationProvider: {}, ydoc: {} } })).toBe(true);
      expect(__isCollaborationEnabledForTest({ options: { collaborationProvider: {} } })).toBe(false);
      expect(__isCollaborationEnabledForTest({ options: { ydoc: {} } })).toBe(false);
      expect(__isCollaborationEnabledForTest({ options: {} })).toBe(false);
    });
  });
});
