import { describe, expect, it } from 'vitest';
import { buildFieldResultRuns } from './build-field-result-runs.js';

describe('buildFieldResultRuns', () => {
  it('builds a result run from resolvedText when cached content is absent', () => {
    expect(
      buildFieldResultRuns(
        {
          node: {
            attrs: { resolvedText: ' Result ' },
            content: [],
          },
        },
        [{ name: 'w:b' }],
      ),
    ).toEqual([
      {
        name: 'w:r',
        elements: [
          { name: 'w:rPr', elements: [{ name: 'w:b' }] },
          {
            name: 'w:t',
            attributes: { 'xml:space': 'preserve' },
            elements: [{ text: ' Result ', type: 'text' }],
          },
        ],
      },
    ]);
  });
});
