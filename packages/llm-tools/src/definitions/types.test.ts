import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineTool } from './types.js';

describe('defineTool', () => {
  it('returns the same definition object', () => {
    const def = {
      name: 'test_tool',
      description: 'A test tool',
      parameters: z.object({ query: z.string() }),
    };
    const result = defineTool(def);
    expect(result).toBe(def);
  });

  it('preserves the returns schema when provided', () => {
    const returns = z.object({ count: z.number() });
    const def = defineTool({
      name: 'test_tool',
      description: 'A test tool',
      parameters: z.object({}),
      returns,
    });
    expect(def.returns).toBe(returns);
  });
});
