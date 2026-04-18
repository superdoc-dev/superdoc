import { describe, it, expect } from 'vitest';
import { isRef } from 'vue';
import useDocument from './use-document';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const makeDoc = (overrides = {}) => {
  const file = new File([new Blob(['x'], { type: DOCX })], 'test.docx', { type: DOCX });
  return useDocument(
    { id: 'doc-1', type: DOCX, data: file, ...overrides },
    { modules: { comments: false }, rulers: false },
  );
};

describe('useDocument', () => {
  it('preserves password on document entries for downstream editor options', () => {
    const doc = makeDoc({ password: 'secret' });
    expect(doc.password).toBe('secret');
  });

  it('exposes editorMountNonce as a ref starting at 0', () => {
    const doc = makeDoc();
    expect(isRef(doc.editorMountNonce)).toBe(true);
    expect(doc.editorMountNonce.value).toBe(0);
  });
});
