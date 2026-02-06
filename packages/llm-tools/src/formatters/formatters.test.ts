import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type { AnyToolDefinition } from '../definitions/types.js';
import { formatForAnthropic } from './anthropic.js';
import { formatForOpenAI } from './openai.js';
import { formatForGeneric } from './generic.js';

const fakeTool: AnyToolDefinition = {
  name: 'test_tool',
  description: 'A test tool',
  parameters: z.object({ query: z.string() }),
  returns: z.object({ count: z.number() }),
};

const fakeToolNoReturns: AnyToolDefinition = {
  name: 'simple_tool',
  description: 'No return schema',
  parameters: z.object({ id: z.string() }),
};

describe('formatForAnthropic', () => {
  it('returns an array matching the input length', () => {
    const result = formatForAnthropic([fakeTool]);
    expect(result).toHaveLength(1);
  });

  it('produces the correct Anthropic shape', () => {
    const [tool] = formatForAnthropic([fakeTool]);
    expect(tool.name).toBe('test_tool');
    expect(tool.description).toBe('A test tool');
    expect(tool.input_schema).toBeDefined();
    expect(typeof tool.input_schema).toBe('object');
  });

  it('returns an empty array for empty input', () => {
    expect(formatForAnthropic([])).toEqual([]);
  });
});

describe('formatForOpenAI', () => {
  it('returns an array matching the input length', () => {
    const result = formatForOpenAI([fakeTool]);
    expect(result).toHaveLength(1);
  });

  it('produces the correct OpenAI shape', () => {
    const [tool] = formatForOpenAI([fakeTool]);
    expect(tool.type).toBe('function');
    expect(tool.function.name).toBe('test_tool');
    expect(tool.function.description).toBe('A test tool');
    expect(tool.function.parameters).toBeDefined();
  });

  it('returns an empty array for empty input', () => {
    expect(formatForOpenAI([])).toEqual([]);
  });
});

describe('formatForGeneric', () => {
  it('includes returns when the tool has a return schema', () => {
    const [tool] = formatForGeneric([fakeTool]);
    expect(tool.name).toBe('test_tool');
    expect(tool.parameters).toBeDefined();
    expect(tool.returns).toBeDefined();
  });

  it('omits returns when the tool has no return schema', () => {
    const [tool] = formatForGeneric([fakeToolNoReturns]);
    expect(tool.returns).toBeUndefined();
  });

  it('returns an empty array for empty input', () => {
    expect(formatForGeneric([])).toEqual([]);
  });
});
