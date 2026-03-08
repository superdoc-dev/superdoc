import { describe, expect, test } from 'bun:test';
import { sanitizeToolSchemas, formatToolResult, formatToolError, mergeDiscoveredTools } from '../platform.js';

/* ------------------------------------------------------------------ */
/*  sanitizeToolSchemas                                                */
/* ------------------------------------------------------------------ */

describe('sanitizeToolSchemas', () => {
  test('strips const keyword for vertex', () => {
    const tools = [
      {
        name: 'query_match',
        parameters: {
          type: 'object',
          properties: {
            matchKind: { const: 'text' },
            query: { type: 'string' },
          },
        },
      },
    ];

    const result = sanitizeToolSchemas(tools, 'vertex');

    expect(result[0].parameters.properties.matchKind).toEqual({});
    expect(result[0].parameters.properties.query).toEqual({ type: 'string' });
  });

  test('strips const recursively in nested schemas', () => {
    const tools = [
      {
        name: 'test',
        parameters: {
          oneOf: [
            { properties: { kind: { const: 'a' }, value: { type: 'string' } } },
            { properties: { kind: { const: 'b' }, value: { type: 'number' } } },
          ],
        },
      },
    ];

    const result = sanitizeToolSchemas(tools, 'vertex');

    expect(result[0].parameters.oneOf[0].properties.kind).toEqual({});
    expect(result[0].parameters.oneOf[1].properties.kind).toEqual({});
    expect(result[0].parameters.oneOf[0].properties.value).toEqual({ type: 'string' });
  });

  test('does not mutate original tools', () => {
    const tools = [{ name: 'test', parameters: { properties: { x: { const: 'a' } } } }];
    const original = JSON.stringify(tools);

    sanitizeToolSchemas(tools, 'vertex');

    expect(JSON.stringify(tools)).toBe(original);
  });

  test('is a no-op for bedrock', () => {
    const tools = [{ name: 'test', parameters: { properties: { x: { const: 'a' } } } }];
    const result = sanitizeToolSchemas(tools, 'bedrock');
    expect(result).toBe(tools); // same reference — no cloning needed
  });

  test('handles empty array', () => {
    expect(sanitizeToolSchemas([], 'vertex')).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  formatToolResult                                                   */
/* ------------------------------------------------------------------ */

describe('formatToolResult', () => {
  describe('bedrock', () => {
    test('wraps object result in toolResult shape', () => {
      const result = formatToolResult({ text: 'hello' }, { target: 'bedrock', toolUseId: 'tu-1' });
      expect(result).toEqual({
        toolResult: { toolUseId: 'tu-1', content: [{ json: { text: 'hello' } }] },
      });
    });

    test('wraps array result in { result } wrapper', () => {
      const result = formatToolResult([1, 2, 3], { target: 'bedrock', toolUseId: 'tu-1' });
      expect(result).toEqual({
        toolResult: { toolUseId: 'tu-1', content: [{ json: { result: [1, 2, 3] } }] },
      });
    });

    test('wraps string result in { result } wrapper', () => {
      const result = formatToolResult('hello', { target: 'bedrock', toolUseId: 'tu-1' });
      expect(result).toEqual({
        toolResult: { toolUseId: 'tu-1', content: [{ json: { result: 'hello' } }] },
      });
    });

    test('wraps null result in { result } wrapper', () => {
      const result = formatToolResult(null, { target: 'bedrock', toolUseId: 'tu-1' });
      expect(result).toEqual({
        toolResult: { toolUseId: 'tu-1', content: [{ json: { result: null } }] },
      });
    });
  });

  describe('vertex', () => {
    test('wraps in functionResponse shape', () => {
      const result = formatToolResult({ data: 1 }, { target: 'vertex', name: 'get_text' });
      expect(result).toEqual({
        functionResponse: { name: 'get_text', response: { data: 1 } },
      });
    });
  });

  describe('anthropic', () => {
    test('wraps in tool_result shape', () => {
      const result = formatToolResult({ ok: true }, { target: 'anthropic', toolUseId: 'tu-1' });
      expect(result).toEqual({
        type: 'tool_result',
        tool_use_id: 'tu-1',
        content: '{"ok":true}',
      });
    });
  });

  describe('openai', () => {
    test('wraps in tool role message', () => {
      const result = formatToolResult({ ok: true }, { target: 'openai', toolUseId: 'call-1', name: 'fn' });
      expect(result).toEqual({
        role: 'tool',
        tool_call_id: 'call-1',
        content: '{"ok":true}',
      });
    });
  });
});

/* ------------------------------------------------------------------ */
/*  formatToolError                                                    */
/* ------------------------------------------------------------------ */

describe('formatToolError', () => {
  test('bedrock error shape', () => {
    const result = formatToolError(new Error('boom'), { target: 'bedrock', toolUseId: 'tu-1' });
    expect(result).toEqual({
      toolResult: { toolUseId: 'tu-1', content: [{ text: 'Error: boom' }], status: 'error' },
    });
  });

  test('vertex error shape', () => {
    const result = formatToolError('fail', { target: 'vertex', name: 'fn' });
    expect(result).toEqual({
      functionResponse: { name: 'fn', response: { error: 'fail' } },
    });
  });

  test('anthropic error shape', () => {
    const result = formatToolError(new Error('nope'), { target: 'anthropic', toolUseId: 'tu-1' });
    expect(result).toEqual({
      type: 'tool_result',
      tool_use_id: 'tu-1',
      content: 'Error: nope',
      is_error: true,
    });
  });

  test('openai error shape', () => {
    const result = formatToolError(new Error('bad'), { target: 'openai', toolUseId: 'call-1' });
    expect(result).toEqual({
      role: 'tool',
      tool_call_id: 'call-1',
      content: 'Error: bad',
    });
  });
});

/* ------------------------------------------------------------------ */
/*  mergeDiscoveredTools                                               */
/* ------------------------------------------------------------------ */

describe('mergeDiscoveredTools', () => {
  const anthropicTools = [
    { name: 'add_comment', description: 'Add a comment', input_schema: { type: 'object' } },
    { name: 'format_bold', description: 'Bold text', input_schema: { type: 'object' } },
  ];

  const genericTools = [
    {
      name: 'add_comment',
      description: 'Add a comment',
      parameters: { type: 'object', properties: { kind: { const: 'inline' } } },
    },
    { name: 'format_bold', description: 'Bold text', parameters: { type: 'object' } },
  ];

  describe('bedrock target', () => {
    test('merges tools into bedrock toolConfig', () => {
      const toolConfig = { tools: [{ toolSpec: { name: 'existing', description: 'x', inputSchema: { json: {} } } }] };
      const result = { tools: anthropicTools };

      const count = mergeDiscoveredTools(toolConfig, result, { provider: 'anthropic', target: 'bedrock' });

      expect(count).toBe(2);
      expect(toolConfig.tools).toHaveLength(3);
      expect(toolConfig.tools[1]).toEqual({
        toolSpec: {
          name: 'add_comment',
          description: 'Add a comment',
          inputSchema: { json: { type: 'object' } },
        },
      });
    });

    test('skips duplicate tools', () => {
      const toolConfig = {
        tools: [{ toolSpec: { name: 'add_comment', description: 'x', inputSchema: { json: {} } } }],
      };
      const result = { tools: anthropicTools };

      const count = mergeDiscoveredTools(toolConfig, result, { provider: 'anthropic', target: 'bedrock' });

      expect(count).toBe(1); // only format_bold added, add_comment skipped
      expect(toolConfig.tools).toHaveLength(2);
    });
  });

  describe('vertex target', () => {
    test('merges tools and sanitizes schemas', () => {
      const toolConfig = [{ functionDeclarations: [{ name: 'existing', description: 'x', parameters: {} }] }];
      const result = { tools: genericTools };

      const count = mergeDiscoveredTools(toolConfig, result, { provider: 'generic', target: 'vertex' });

      expect(count).toBe(2);
      expect(toolConfig[0].functionDeclarations).toHaveLength(3);
      // const keyword should be stripped
      const addComment = toolConfig[0].functionDeclarations[1] as Record<string, unknown>;
      expect(JSON.stringify(addComment)).not.toContain('"const"');
    });
  });

  describe('direct provider (no target)', () => {
    test('merges into plain array', () => {
      const toolConfig = [{ name: 'existing', description: 'x', input_schema: {} }] as unknown[];
      const result = { tools: anthropicTools };

      const count = mergeDiscoveredTools(toolConfig, result, { provider: 'anthropic' });

      expect(count).toBe(2);
      expect(toolConfig).toHaveLength(3);
    });
  });

  describe('edge cases', () => {
    test('returns 0 for empty discover result', () => {
      const toolConfig = { tools: [] };
      const count = mergeDiscoveredTools(toolConfig, {}, { provider: 'anthropic', target: 'bedrock' });
      expect(count).toBe(0);
    });

    test('returns 0 for non-object discover result', () => {
      const toolConfig = { tools: [] };
      const count = mergeDiscoveredTools(toolConfig, 'not an object', { provider: 'anthropic', target: 'bedrock' });
      expect(count).toBe(0);
    });

    test('returns 0 for null discover result', () => {
      const toolConfig = { tools: [] };
      const count = mergeDiscoveredTools(toolConfig, null, { provider: 'anthropic', target: 'bedrock' });
      expect(count).toBe(0);
    });
  });
});
