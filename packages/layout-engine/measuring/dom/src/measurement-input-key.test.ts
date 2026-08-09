import { describe, expect, it } from 'vitest';
import { serializeMeasurementInput } from './measurement-input-key.js';

describe('serializeMeasurementInput', () => {
  it('omits structural object ids but preserves output-bearing inline-box ids', () => {
    const input = (blockId: string, inlineBoxId: string) => ({
      block: {
        kind: 'paragraph',
        id: blockId,
        runs: [{ text: 'Citation' }],
        inlineBoxes: [
          {
            id: inlineBoxId,
            from: 0,
            to: 8,
            layout: { paddingInlineStart: 4 },
            appearance: { backgroundColor: '#eef2ff' },
          },
        ],
      },
    });

    expect(serializeMeasurementInput(input('paragraph-a', 'citation'), { omitObjectIds: true })).toBe(
      serializeMeasurementInput(input('paragraph-b', 'citation'), { omitObjectIds: true }),
    );
    expect(serializeMeasurementInput(input('paragraph-a', 'citation-a'), { omitObjectIds: true })).not.toBe(
      serializeMeasurementInput(input('paragraph-a', 'citation-b'), { omitObjectIds: true }),
    );
  });
});
