import { describe, expect, it } from 'vitest';
import type { Editor } from '../core/Editor.js';
import { getTextAdapter } from './get-text-adapter.js';

function makeEditor(textContent: string): Editor {
  return {
    state: {
      doc: { textContent },
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
});
