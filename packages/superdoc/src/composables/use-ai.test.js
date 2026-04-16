import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { useAi } from './use-ai.js';

const makeEditor = (overrides = {}) => {
  const view = {
    state: { selection: { empty: true, $head: { pos: 10 } } },
    coordsAtPos: vi.fn(() => ({ top: 100, left: 200 })),
    dom: {
      getBoundingClientRect: () => ({ top: 0, left: 0, width: 500, height: 600 }),
    },
    ...overrides.view,
  };
  return {
    isDestroyed: false,
    view,
    commands: { insertAiMark: vi.fn() },
    ...overrides,
  };
};

describe('useAi', () => {
  let errSpy;

  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errSpy.mockRestore();
  });

  it('initializes state with sensible defaults', () => {
    const ai = useAi({ activeEditorRef: ref(null) });
    expect(ai.showAiLayer.value).toBe(false);
    expect(ai.showAiWriter.value).toBe(false);
    expect(ai.aiLayer.value).toBeNull();
    expect(ai.aiWriterPosition).toEqual({ top: 0, left: 0 });
  });

  describe('initAiLayer', () => {
    it('defaults to enabling the AI layer', () => {
      const ai = useAi({ activeEditorRef: ref(null) });
      ai.initAiLayer();
      expect(ai.showAiLayer.value).toBe(true);
    });

    it('can disable the AI layer', () => {
      const ai = useAi({ activeEditorRef: ref(null) });
      ai.initAiLayer(false);
      expect(ai.showAiLayer.value).toBe(false);
    });
  });

  describe('handleAiWriterClose', () => {
    it('hides the AI writer', () => {
      const ai = useAi({ activeEditorRef: ref(null) });
      ai.showAiWriter.value = true;
      ai.handleAiWriterClose();
      expect(ai.showAiWriter.value).toBe(false);
    });
  });

  describe('showAiWriterAtCursor', () => {
    it('logs an error and returns early when there is no editor', () => {
      const ai = useAi({ activeEditorRef: ref(null) });
      ai.showAiWriterAtCursor();
      expect(ai.showAiWriter.value).toBe(false);
      expect(errSpy).toHaveBeenCalledWith('[useAi] Editor not available');
    });

    it('logs an error and returns early when the editor is destroyed', () => {
      const ai = useAi({ activeEditorRef: ref(makeEditor({ isDestroyed: true })) });
      ai.showAiWriterAtCursor();
      expect(ai.showAiWriter.value).toBe(false);
      expect(errSpy).toHaveBeenCalled();
    });

    it('positions the writer under the cursor coords and shows it', () => {
      const editor = makeEditor();
      const ai = useAi({ activeEditorRef: ref(editor) });
      ai.showAiWriterAtCursor();
      expect(ai.aiWriterPosition.top).toBe('130px');
      expect(ai.aiWriterPosition.left).toBe('200px');
      expect(ai.showAiWriter.value).toBe(true);
    });

    it('inserts an AI mark when there is non-empty selection', () => {
      const editor = makeEditor({
        view: {
          state: { selection: { empty: false, $head: { pos: 10 } } },
          coordsAtPos: vi.fn(() => ({ top: 0, left: 0 })),
          dom: { getBoundingClientRect: () => ({ top: 0, left: 0 }) },
        },
      });
      const ai = useAi({ activeEditorRef: ref(editor) });
      ai.showAiWriterAtCursor();
      expect(editor.commands.insertAiMark).toHaveBeenCalled();
    });

    it('falls back to DOM selection when coordsAtPos throws', () => {
      const editor = makeEditor();
      editor.view.coordsAtPos = vi.fn(() => {
        throw new Error('bad pos');
      });
      // Mock window.getSelection to return a range with bounding rect
      const originalGetSelection = window.getSelection;
      window.getSelection = vi.fn(() => ({
        rangeCount: 1,
        getRangeAt: () => ({ getBoundingClientRect: () => ({ top: 50, left: 75 }) }),
      }));
      const ai = useAi({ activeEditorRef: ref(editor) });
      ai.showAiWriterAtCursor();
      expect(ai.aiWriterPosition.top).toBe('80px');
      expect(ai.aiWriterPosition.left).toBe('75px');
      expect(ai.showAiWriter.value).toBe(true);
      window.getSelection = originalGetSelection;
    });

    it('falls back to editor bounds when coordsAtPos throws and no DOM selection', () => {
      const editor = makeEditor();
      editor.view.coordsAtPos = vi.fn(() => {
        throw new Error('bad pos');
      });
      editor.view.dom.getBoundingClientRect = () => ({ top: 200, left: 300 });
      const originalGetSelection = window.getSelection;
      window.getSelection = vi.fn(() => ({ rangeCount: 0, getRangeAt: () => null }));
      const ai = useAi({ activeEditorRef: ref(editor) });
      ai.showAiWriterAtCursor();
      // coords.top = 200 + 50 = 250, then +30 offset = 280
      expect(ai.aiWriterPosition.top).toBe('280px');
      expect(ai.aiWriterPosition.left).toBe('350px');
      window.getSelection = originalGetSelection;
    });
  });

  describe('handleAiToolClick', () => {
    it('logs an error when there is no editor', () => {
      const ai = useAi({ activeEditorRef: ref(null) });
      ai.handleAiToolClick();
      expect(errSpy).toHaveBeenCalledWith('[useAi] Editor not available');
    });

    it('inserts the AI mark and shows the writer at the cursor', () => {
      const editor = makeEditor();
      const ai = useAi({ activeEditorRef: ref(editor) });
      ai.handleAiToolClick();
      expect(editor.commands.insertAiMark).toHaveBeenCalled();
      expect(ai.showAiWriter.value).toBe(true);
    });
  });
});
