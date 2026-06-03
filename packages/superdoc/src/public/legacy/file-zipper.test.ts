import { describe, it, expect } from 'vitest';
import { createZip } from './file-zipper.js';

describe('public facade (legacy/file-zipper)', () => {
  it('re-exports createZip as a function', () => {
    expect(typeof createZip).toBe('function');
  });
});
