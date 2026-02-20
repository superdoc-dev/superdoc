import { describe, expect, it, vi } from 'vitest';
import { Editor } from './Editor.js';

function makeCoords(left: number, top: number) {
  return {
    left,
    top,
    right: left + 10,
    bottom: top + 10,
    width: 10,
    height: 10,
  };
}

describe('Editor.coordsAtPos', () => {
  it('prefers PresentationEditor coordinates when available', () => {
    const presentationCoords = makeCoords(100, 200);
    const pmCoords = makeCoords(1, 2);

    const presentationEditor = {
      coordsAtPos: vi.fn(() => presentationCoords),
    };
    const view = {
      coordsAtPos: vi.fn(() => pmCoords),
    };

    const editor = { presentationEditor, view } as unknown as Editor;
    const result = Editor.prototype.coordsAtPos.call(editor, 7);

    expect(result).toEqual(presentationCoords);
    expect(presentationEditor.coordsAtPos).toHaveBeenCalledWith(7);
    expect(view.coordsAtPos).not.toHaveBeenCalled();
  });

  it('falls back to ProseMirror view coordinates when presentation editor is absent', () => {
    const pmCoords = makeCoords(3, 4);
    const view = {
      coordsAtPos: vi.fn(() => pmCoords),
    };

    const editor = { presentationEditor: null, view } as unknown as Editor;
    const result = Editor.prototype.coordsAtPos.call(editor, 5);

    expect(result).toEqual(pmCoords);
    expect(view.coordsAtPos).toHaveBeenCalledWith(5);
  });
});
