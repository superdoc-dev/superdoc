import { initTestEditor } from '@tests/helpers/helpers.js';
import { expect } from 'vitest';

describe('list helpers in blank editor state', () => {
  it('provides base numbering definitions without imported docx', () => {
    const { editor } = initTestEditor();
    const numbering = editor.converter.numbering || {};
    expect(Object.keys(numbering.definitions || {})).not.toHaveLength(0);
    expect(Object.keys(numbering.abstracts || {})).not.toHaveLength(0);
    editor.destroy();
  });
});
