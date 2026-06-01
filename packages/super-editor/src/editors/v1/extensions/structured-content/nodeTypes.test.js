import { describe, expect, it } from 'vitest';

import { STRUCTURED_CONTENT_NODE_TYPES, isStructuredContentNodeType } from './nodeTypes.js';

describe('structured content node types', () => {
  it('recognizes inline and block structured content node types', () => {
    expect(STRUCTURED_CONTENT_NODE_TYPES).toEqual(new Set(['structuredContent', 'structuredContentBlock']));
    expect(isStructuredContentNodeType('structuredContent')).toBe(true);
    expect(isStructuredContentNodeType('structuredContentBlock')).toBe(true);
    expect(isStructuredContentNodeType('paragraph')).toBe(false);
    expect(isStructuredContentNodeType(null)).toBe(false);
  });
});
