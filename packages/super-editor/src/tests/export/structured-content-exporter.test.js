import { describe, it, expect } from 'vitest';
import { convertSdtContentToRuns } from '@converter/v3/handlers/w/sdt/helpers/convert-sdt-content-to-runs.js';

describe('convertSdtContentToRuns', () => {
  it('returns existing runs unchanged', () => {
    const runs = [
      {
        name: 'w:r',
        type: 'element',
        elements: [{ name: 'w:t', text: 'Hello' }],
      },
    ];

    const result = convertSdtContentToRuns(runs);

    expect(result).toEqual(runs);
  });

  it('wraps non-run elements in runs', () => {
    const elements = [
      {
        name: 'w:t',
        text: 'World',
      },
    ];

    const result = convertSdtContentToRuns(elements);

    expect(result).toEqual([
      {
        name: 'w:r',
        type: 'element',
        elements: [
          {
            name: 'w:t',
            text: 'World',
          },
        ],
      },
    ]);
  });

  it('flattens nested SDT content with properties into runs', () => {
    const elements = [
      {
        name: 'w:sdt',
        elements: [
          { name: 'w:sdtPr', elements: [{ name: 'w:alias' }] },
          {
            name: 'w:sdtContent',
            elements: [
              {
                name: 'w:r',
                type: 'element',
                elements: [{ name: 'w:t', text: 'Nested' }],
              },
              {
                name: 'w:t',
                text: 'Content',
              },
            ],
          },
        ],
      },
    ];

    const result = convertSdtContentToRuns(elements);

    expect(result).toEqual([
      {
        name: 'w:r',
        type: 'element',
        elements: [{ name: 'w:t', text: 'Nested' }],
      },
      {
        name: 'w:r',
        type: 'element',
        elements: [
          {
            name: 'w:t',
            text: 'Content',
          },
        ],
      },
    ]);
  });

  it('preserves run-level wrappers when flattening structured content', () => {
    const elements = [
      {
        name: 'w:hyperlink',
        type: 'element',
        attributes: { 'r:id': 'rId1' },
        elements: [
          {
            name: 'w:r',
            type: 'element',
            elements: [{ name: 'w:t', text: 'Link' }],
          },
          {
            name: 'w:sdt',
            elements: [
              { name: 'w:sdtPr', elements: [{ name: 'w:alias' }] },
              {
                name: 'w:sdtContent',
                elements: [
                  {
                    name: 'w:r',
                    type: 'element',
                    elements: [{ name: 'w:t', text: 'Nested' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    const result = convertSdtContentToRuns(elements);

    expect(result).toEqual([
      {
        name: 'w:hyperlink',
        type: 'element',
        attributes: { 'r:id': 'rId1' },
        elements: [
          {
            name: 'w:r',
            type: 'element',
            elements: [{ name: 'w:t', text: 'Link' }],
          },
          {
            name: 'w:r',
            type: 'element',
            elements: [{ name: 'w:t', text: 'Nested' }],
          },
        ],
      },
    ]);
  });
});
