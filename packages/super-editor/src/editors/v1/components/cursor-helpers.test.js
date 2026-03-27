import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema, doc, p, blockquote } from 'prosemirror-test-builder';
import {
  selectionHasNodeOrMark,
  moveCursorToMouseEvent,
  onMarginClickCursorChange,
  checkNodeSpecificClicks,
} from './cursor-helpers.js';
import LinkInput from './toolbar/LinkInput.vue';

vi.mock('../core/helpers/editorSurface.js', () => ({
  getEditorSurfaceElement: vi.fn(),
}));

const createStateWithSelection = (docNode, selection) => {
  const baseState = EditorState.create({ schema, doc: docNode });
  const tr = baseState.tr.setSelection(selection);
  return baseState.apply(tr);
};

describe('cursor-helpers', () => {
  describe('selectionHasNodeOrMark', () => {
    it('detects mark at cursor when requireEnds is true', () => {
      const linkMark = schema.marks.link.create({ href: 'https://example.com' });
      const para = schema.node('paragraph', null, [schema.text('Link', [linkMark])]);
      const docNode = schema.node('doc', null, [para]);
      const state = createStateWithSelection(docNode, TextSelection.create(docNode, 2));

      const result = selectionHasNodeOrMark(state, 'link', { requireEnds: true });

      expect(result).toBe(true);
    });

    it('detects mark inside selection when requireEnds is false', () => {
      const linkMark = schema.marks.link.create({ href: '#' });
      const nodes = [schema.text('A'), schema.text('B', [linkMark]), schema.text('C')];
      const para = schema.node('paragraph', null, nodes);
      const docNode = schema.node('doc', null, [para]);
      const state = createStateWithSelection(docNode, TextSelection.create(docNode, 1, 4));

      expect(selectionHasNodeOrMark(state, 'link')).toBe(true);
      expect(selectionHasNodeOrMark(state, 'link', { requireEnds: true })).toBe(false);
    });

    it('detects ancestor node when requireEnds is true', () => {
      const docNode = doc(blockquote(p('Quote me')));
      const state = createStateWithSelection(docNode, TextSelection.create(docNode, 2));

      const result = selectionHasNodeOrMark(state, 'blockquote', { requireEnds: true });

      expect(result).toBe(true);
    });
  });

  describe('moveCursorToMouseEvent', () => {
    let editor;

    beforeEach(() => {
      const docNode = doc(p('Hello world'));
      const state = EditorState.create({ schema, doc: docNode });
      const dispatch = vi.fn((tr) => {
        editor.state = editor.state.apply(tr);
      });
      editor = {
        state,
        dispatch,
        focus: vi.fn(),
        posAtCoords: vi.fn(() => ({ pos: 3 })),
      };
    });

    it('moves cursor to coordinates resolved position', () => {
      const event = { clientX: 10, clientY: 20 };

      moveCursorToMouseEvent(event, editor);

      expect(editor.posAtCoords).toHaveBeenCalledWith({ left: 10, top: 20 });
      expect(editor.dispatch).toHaveBeenCalledTimes(1);
      const dispatchedTr = editor.dispatch.mock.calls[0][0];
      expect(dispatchedTr.selection.from).toBe(3);
      expect(editor.focus).toHaveBeenCalled();
    });
  });

  describe('onMarginClickCursorChange', () => {
    it('adjusts cursor when clicking in the right margin next to text', () => {
      const docNode = doc(p('Hello'));
      const state = EditorState.create({ schema, doc: docNode });
      const view = {
        state,
        dispatch: vi.fn(),
        focus: vi.fn(),
        posAtCoords: vi.fn(() => ({ pos: 5 })),
        dom: {
          getBoundingClientRect: () => ({ left: 0, right: 100, width: 100 }),
        },
      };
      const editor = { view };
      const event = { clientX: 150, clientY: 25 };

      onMarginClickCursorChange(event, editor);

      expect(view.posAtCoords).toHaveBeenCalled();
      expect(view.dispatch).toHaveBeenCalledTimes(1);
      const dispatchedTr = view.dispatch.mock.calls[0][0];
      expect(dispatchedTr.selection.from).toBe(4);
      expect(view.focus).toHaveBeenCalled();
    });
  });

  describe('checkNodeSpecificClicks', () => {
    let mockSurface;
    let getEditorSurfaceElement;

    beforeEach(async () => {
      const module = await import('../core/helpers/editorSurface.js');
      getEditorSurfaceElement = module.getEditorSurfaceElement;

      mockSurface = {
        getBoundingClientRect: vi.fn(() => ({
          left: 100,
          top: 200,
          right: 500,
          bottom: 600,
        })),
      };
      getEditorSurfaceElement.mockReturnValue(mockSurface);
    });

    it('opens link popover when clicking on a link', () => {
      const linkMark = schema.marks.link.create({ href: 'https://example.com' });
      const para = schema.node('paragraph', null, [schema.text('Link', [linkMark])]);
      const docNode = schema.node('doc', null, [para]);
      const state = createStateWithSelection(docNode, TextSelection.create(docNode, 2));

      const editor = { state };
      const event = { clientX: 350, clientY: 450 };
      const popoverControls = {
        component: null,
        position: null,
        props: null,
        visible: false,
      };

      checkNodeSpecificClicks(editor, event, popoverControls);

      expect(popoverControls.component).toBe(LinkInput);
      expect(popoverControls.position).toEqual({
        left: '250px', // 350 - 100
        top: '265px', // 450 - 200 + 15
      });
      expect(popoverControls.props).toEqual({ showInput: true });
      expect(popoverControls.visible).toBe(true);
    });

    it('does nothing when clicking on non-link text', () => {
      const docNode = doc(p('Regular text'));
      const state = createStateWithSelection(docNode, TextSelection.create(docNode, 2));

      const editor = { state };
      const event = { clientX: 350, clientY: 450 };
      const popoverControls = {
        component: null,
        position: null,
        props: null,
        visible: false,
      };

      checkNodeSpecificClicks(editor, event, popoverControls);

      expect(popoverControls.component).toBeNull();
      expect(popoverControls.position).toBeNull();
      expect(popoverControls.props).toBeNull();
      expect(popoverControls.visible).toBe(false);
    });

    it('does nothing when surface is null', () => {
      getEditorSurfaceElement.mockReturnValue(null);

      const linkMark = schema.marks.link.create({ href: 'https://example.com' });
      const para = schema.node('paragraph', null, [schema.text('Link', [linkMark])]);
      const docNode = schema.node('doc', null, [para]);
      const state = createStateWithSelection(docNode, TextSelection.create(docNode, 2));

      const editor = { state };
      const event = { clientX: 350, clientY: 450 };
      const popoverControls = {
        component: null,
        visible: false,
      };

      checkNodeSpecificClicks(editor, event, popoverControls);

      expect(popoverControls.component).toBeNull();
      expect(popoverControls.visible).toBe(false);
    });

    it('does nothing when editor is null', () => {
      const event = { clientX: 350, clientY: 450 };
      const popoverControls = {
        component: null,
        visible: false,
      };

      checkNodeSpecificClicks(null, event, popoverControls);

      expect(popoverControls.component).toBeNull();
      expect(popoverControls.visible).toBe(false);
    });

    it('does nothing when editor.state is null', () => {
      const editor = { state: null };
      const event = { clientX: 350, clientY: 450 };
      const popoverControls = {
        component: null,
        visible: false,
      };

      checkNodeSpecificClicks(editor, event, popoverControls);

      expect(popoverControls.component).toBeNull();
      expect(popoverControls.visible).toBe(false);
    });

    it('calculates correct position with different surface bounds', () => {
      mockSurface.getBoundingClientRect.mockReturnValue({
        left: 50,
        top: 75,
        right: 450,
        bottom: 475,
      });

      const linkMark = schema.marks.link.create({ href: 'https://example.com' });
      const para = schema.node('paragraph', null, [schema.text('Link', [linkMark])]);
      const docNode = schema.node('doc', null, [para]);
      const state = createStateWithSelection(docNode, TextSelection.create(docNode, 2));

      const editor = { state };
      const event = { clientX: 200, clientY: 300 };
      const popoverControls = {
        component: null,
        position: null,
        visible: false,
      };

      checkNodeSpecificClicks(editor, event, popoverControls);

      expect(popoverControls.position).toEqual({
        left: '150px', // 200 - 50
        top: '240px', // 300 - 75 + 15
      });
    });
  });
});
