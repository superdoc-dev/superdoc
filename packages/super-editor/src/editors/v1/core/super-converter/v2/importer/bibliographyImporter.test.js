import { describe, expect, it } from 'vitest';
import { defaultNodeListHandler } from './docxImporter.js';

describe('bibliography importer', () => {
  it('imports sd:bibliography blocks produced by fld preprocessing', () => {
    const handler = defaultNodeListHandler();

    const result = handler.handler({
      nodes: [
        {
          name: 'sd:bibliography',
          attributes: {
            instruction: 'BIBLIOGRAPHY',
          },
          elements: [
            {
              name: 'w:p',
              elements: [],
            },
          ],
        },
      ],
      docx: {},
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('bibliography');
    expect(result[0]?.attrs?.instruction).toBe('BIBLIOGRAPHY');
    expect(result[0]?.content).toHaveLength(1);
    expect(result[0]?.content?.[0]?.type).toBe('paragraph');
  });
});
