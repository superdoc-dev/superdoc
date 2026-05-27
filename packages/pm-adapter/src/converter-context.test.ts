import { describe, expect, it } from 'vitest';
import { hasTableStyleContext } from './converter-context.js';
import type { ConverterContext } from './converter-context.js';

describe('hasTableStyleContext', () => {
  it('should return false when context is undefined', () => {
    const result = hasTableStyleContext(undefined);
    expect(result).toBe(false);
  });

  it('should return true when context.docx is present', () => {
    const context: ConverterContext = {
      docx: { styles: {} },
    };
    const result = hasTableStyleContext(context);
    expect(result).toBe(true);
  });

  it('should return false when context.docx is missing', () => {
    const context: ConverterContext = {
      numbering: { definitions: {}, abstracts: {} },
    };
    const result = hasTableStyleContext(context);
    expect(result).toBe(false);
  });
});
