import { describe, expect, it } from 'vitest';
import { generateUniqueDocPrId } from '@extensions/image/imageHelpers/startImageUpload.js';
import { initTestEditor } from '@tests/helpers/helpers.js';

describe('image export docPr id bounds', () => {
  it('generates docPr ids within the signed 32-bit range', () => {
    const { editor } = initTestEditor();

    for (let i = 0; i < 100; i++) {
      const id = Number(generateUniqueDocPrId(editor));
      expect(id).toBeGreaterThanOrEqual(0);
      expect(id).toBeLessThanOrEqual(0x7fffffff);
    }
  });
});
