import { DocumentApiAdapterError, isDocumentApiAdapterError } from './errors.js';

describe('DocumentApiAdapterError', () => {
  it('extends Error with name, code, and message', () => {
    const error = new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Node not found.');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DocumentApiAdapterError);
    expect(error.name).toBe('DocumentApiAdapterError');
    expect(error.code).toBe('TARGET_NOT_FOUND');
    expect(error.message).toBe('Node not found.');
    expect(error.details).toBeUndefined();
  });

  it('stores optional details payload', () => {
    const details = { nodeId: 'p1', nodeType: 'paragraph' };
    const error = new DocumentApiAdapterError('INVALID_TARGET', 'Bad target.', details);

    expect(error.details).toEqual(details);
  });

  it('supports all error codes', () => {
    const codes = ['TARGET_NOT_FOUND', 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'] as const;

    for (const code of codes) {
      const error = new DocumentApiAdapterError(code, `Error: ${code}`);
      expect(error.code).toBe(code);
    }
  });

  it('is caught by instanceof checks after setPrototypeOf', () => {
    const error = new DocumentApiAdapterError('CAPABILITY_UNAVAILABLE', 'test');

    try {
      throw error;
    } catch (caught) {
      expect(caught instanceof DocumentApiAdapterError).toBe(true);
    }
  });
});

describe('isDocumentApiAdapterError', () => {
  it('returns true for DocumentApiAdapterError instances', () => {
    const error = new DocumentApiAdapterError('TARGET_NOT_FOUND', 'test');
    expect(isDocumentApiAdapterError(error)).toBe(true);
  });

  it('returns false for plain Error', () => {
    expect(isDocumentApiAdapterError(new Error('test'))).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isDocumentApiAdapterError(null)).toBe(false);
    expect(isDocumentApiAdapterError(undefined)).toBe(false);
    expect(isDocumentApiAdapterError('string')).toBe(false);
    expect(isDocumentApiAdapterError(42)).toBe(false);
    expect(isDocumentApiAdapterError({ code: 'TARGET_NOT_FOUND', message: 'fake' })).toBe(false);
  });
});
