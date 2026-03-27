import { describe, it, expect } from 'vitest';
import { exportSchemaToJson } from '@converter/exporter.js';

describe('passthrough export', () => {
  it('returns the original xml for passthrough nodes', () => {
    const originalXml = { name: 'w:custom', attributes: { 'w:foo': 'bar' }, elements: [] };
    const node = {
      type: 'passthroughBlock',
      attrs: {
        originalXml,
      },
    };

    const result = exportSchemaToJson({ node });
    expect(result).toEqual(originalXml);
  });
});
