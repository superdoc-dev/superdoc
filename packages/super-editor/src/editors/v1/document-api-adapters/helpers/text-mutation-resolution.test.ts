import type { TextAddress } from '@superdoc/document-api';
import { buildTextMutationResolution, readTextAtResolvedRange } from './text-mutation-resolution.js';
import type { Editor } from '../../core/Editor.js';

function makeEditor(text: string): Editor {
  return {
    state: {
      doc: {
        textBetween: vi.fn((_from: number, _to: number, _blockSep: string, _leafChar: string) => text),
      },
    },
  } as unknown as Editor;
}

describe('readTextAtResolvedRange', () => {
  it('delegates to textBetween with canonical separators', () => {
    const editor = makeEditor('Hello');
    const result = readTextAtResolvedRange(editor, { from: 1, to: 6 });

    expect(result).toBe('Hello');
    expect(editor.state.doc.textBetween).toHaveBeenCalledWith(1, 6, '\n', '\ufffc');
  });

  it('returns empty string for collapsed ranges', () => {
    const editor = makeEditor('');
    const result = readTextAtResolvedRange(editor, { from: 1, to: 1 });

    expect(result).toBe('');
    expect(editor.state.doc.textBetween).toHaveBeenCalledWith(1, 1, '\n', '\ufffc');
  });
});

describe('buildTextMutationResolution', () => {
  const target: TextAddress = { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } };

  it('builds resolution with all fields', () => {
    const requestedTarget: TextAddress = { kind: 'text', blockId: 'p1', range: { start: 0, end: 10 } };
    const result = buildTextMutationResolution({
      requestedTarget,
      target,
      range: { from: 1, to: 6 },
      text: 'Hello',
    });

    expect(result).toEqual({
      requestedTarget,
      target,
      range: { from: 1, to: 6 },
      text: 'Hello',
    });
  });

  it('omits requestedTarget when not provided', () => {
    const result = buildTextMutationResolution({
      target,
      range: { from: 1, to: 6 },
      text: 'Hello',
    });

    expect(result).toEqual({
      target,
      range: { from: 1, to: 6 },
      text: 'Hello',
    });
    expect('requestedTarget' in result).toBe(false);
  });

  it('handles collapsed ranges with empty text', () => {
    const collapsedTarget: TextAddress = { kind: 'text', blockId: 'p1', range: { start: 0, end: 0 } };
    const result = buildTextMutationResolution({
      target: collapsedTarget,
      range: { from: 1, to: 1 },
      text: '',
    });

    expect(result).toEqual({
      target: collapsedTarget,
      range: { from: 1, to: 1 },
      text: '',
    });
  });
});
