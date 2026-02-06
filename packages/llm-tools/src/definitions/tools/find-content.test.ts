import { describe, it, expect } from 'vitest';
import { findContentTool } from './find-content.js';

describe('findContentTool', () => {
  it('has the expected name', () => {
    expect(findContentTool.name).toBe('find_content');
  });

  it('validates correct parameters', () => {
    const result = findContentTool.parameters.parse({
      selector: { type: 'text', pattern: 'hello' },
      limit: 10,
      offset: 0,
    });
    expect(result.selector.pattern).toBe('hello');
    expect(result.limit).toBe(10);
  });

  it('rejects negative limit', () => {
    expect(() =>
      findContentTool.parameters.parse({
        selector: { type: 'text', pattern: 'hello' },
        limit: -1,
      }),
    ).toThrow();
  });

  it('rejects negative offset', () => {
    expect(() =>
      findContentTool.parameters.parse({
        selector: { type: 'text', pattern: 'hello' },
        offset: -1,
      }),
    ).toThrow();
  });

  it('allows omitting optional fields', () => {
    const result = findContentTool.parameters.parse({
      selector: { type: 'text', pattern: '\\w+' },
    });
    expect(result.limit).toBeUndefined();
    expect(result.offset).toBeUndefined();
  });

  it('has a returns schema that validates result shape', () => {
    expect(findContentTool.returns).toBeDefined();
    const result = findContentTool.returns!.parse({
      matches: [{ address: { kind: 'block', blockId: 'b1' }, text: 'hello' }],
      total: 1,
    });
    expect(result.matches).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});
