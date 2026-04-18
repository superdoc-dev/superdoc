import { describe, expect, it, vi } from 'vitest';
import type { Editor } from '../core/Editor.js';
import { getTextAdapter } from './get-text-adapter.js';

function makeEditor(textContent: string): Editor {
  return {
    state: {
      doc: {
        textContent,
        content: { size: textContent.length },
        textBetween: () => textContent,
      },
    },
  } as unknown as Editor;
}

describe('getTextAdapter', () => {
  it('returns the document text content', () => {
    const editor = makeEditor('Hello world');
    expect(getTextAdapter(editor, {})).toBe('Hello world');
  });

  it('returns an empty string for an empty document', () => {
    const editor = makeEditor('');
    expect(getTextAdapter(editor, {})).toBe('');
  });

  it('preserves block separators when reading full document text', () => {
    const textBetween = vi.fn(() => 'Hello\nworld');
    const editor = {
      state: {
        doc: {
          textContent: 'Helloworld',
          content: { size: 10 },
          textBetween,
        },
      },
    } as unknown as Editor;

    expect(getTextAdapter(editor, {})).toBe('Hello\nworld');
    expect(textBetween).toHaveBeenCalledWith(0, 10, '\n', '\n');
  });
});
