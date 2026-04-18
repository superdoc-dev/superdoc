import { describe, it, expect } from 'vitest';
import { readTranslatedLinkedStyles } from './styles-read.js';
import type { Editor } from '../../Editor.js';

function editorWithStyles(styles: unknown): Editor {
  return { converter: { translatedLinkedStyles: styles } } as unknown as Editor;
}

function editorWithoutConverter(): Editor {
  return {} as unknown as Editor;
}

describe('readTranslatedLinkedStyles', () => {
  it('returns the styles when present on the converter', () => {
    const styles = { styles: { heading1: {} } };
    expect(readTranslatedLinkedStyles(editorWithStyles(styles))).toBe(styles);
  });

  it('returns null when converter is missing', () => {
    expect(readTranslatedLinkedStyles(editorWithoutConverter())).toBeNull();
  });

  it('returns null when translatedLinkedStyles is undefined', () => {
    const editor = { converter: {} } as unknown as Editor;
    expect(readTranslatedLinkedStyles(editor)).toBeNull();
  });

  it('returns null when translatedLinkedStyles is explicitly null', () => {
    expect(readTranslatedLinkedStyles(editorWithStyles(null))).toBeNull();
  });
});
