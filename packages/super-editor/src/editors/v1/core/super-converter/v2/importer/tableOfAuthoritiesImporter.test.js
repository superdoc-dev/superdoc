import { describe, expect, it } from 'vitest';
import { defaultNodeListHandler } from './docxImporter.js';

describe('table of authorities importer', () => {
  it('imports sd:tableOfAuthorities blocks produced by fld preprocessing', () => {
    const handler = defaultNodeListHandler();

    const result = handler.handler({
      nodes: [
        {
          name: 'sd:tableOfAuthorities',
          attributes: {
            instruction: 'TOA \\h \\c "4" \\p',
          },
          elements: [
            {
              name: 'w:p',
              elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Cases' }] }] }],
            },
          ],
        },
      ],
      docx: {},
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('tableOfAuthorities');
    expect(result[0]?.attrs?.instruction).toBe('TOA \\h \\c "4" \\p');
    expect(result[0]?.content?.[0]?.type).toBe('paragraph');
  });
});
