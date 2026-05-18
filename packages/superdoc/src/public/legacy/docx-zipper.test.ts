import { describe, it, expect } from 'vitest';
import DocxZipper from './docx-zipper.js';

/**
 * Smoke test for the legacy public facade docx-zipper entry (SD-3180).
 * This one specifically validates the default-import contract:
 * `import DocxZipper from 'superdoc/docx-zipper'` is the existing
 * public contract and must keep working through the facade.
 */
describe('public facade (legacy/docx-zipper)', () => {
  it('re-exports DocxZipper as the default export (constructor)', () => {
    expect(typeof DocxZipper).toBe('function');
    expect(DocxZipper.name).toBe('DocxZipper');
  });
});
