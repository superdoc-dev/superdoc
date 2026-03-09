import { describe, it, expect } from 'bun:test';
import { dispatch, ALL_TOOLS } from '@superdoc/llm-tools';

/** Mock executor that records calls and returns a success object. */
function mockExecutor() {
  const calls: Array<{ operationId: string; input: Record<string, unknown>; options?: Record<string, unknown> }> = [];

  const execute = async (operationId: string, input: Record<string, unknown>, options?: Record<string, unknown>) => {
    calls.push({ operationId, input, options });
    return { success: true };
  };

  return { execute, calls };
}

describe('MCP dispatch integration', () => {
  it('dispatches superdoc_read with format "text" to getText', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_read', { format: 'text' }, execute);
    expect(calls).toHaveLength(1);
    expect(calls[0].operationId).toBe('getText');
  });

  it('dispatches superdoc_read with format "info" to info', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_read', { format: 'info' }, execute);
    expect(calls).toHaveLength(1);
    expect(calls[0].operationId).toBe('info');
  });

  it('dispatches superdoc_find with pattern to find', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_find', { pattern: 'hello' }, execute);
    expect(calls).toHaveLength(1);
    expect(calls[0].operationId).toBe('find');
    expect(calls[0].input).toEqual({ select: { type: 'text', pattern: 'hello', mode: 'contains' } });
  });

  it('dispatches superdoc_edit insert action to insert', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_edit', { action: 'insert', target: '{"kind":"text"}', text: 'hi' }, execute);
    expect(calls).toHaveLength(1);
    expect(calls[0].operationId).toBe('insert');
  });

  it('dispatches superdoc_create paragraph to create.paragraph', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_create', { type: 'paragraph', text: 'Hello' }, execute);
    expect(calls).toHaveLength(1);
    expect(calls[0].operationId).toBe('create.paragraph');
    expect(calls[0].input).toEqual({ text: 'Hello' });
  });

  it('dispatches superdoc_comment list action to comments.list', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_comment', { action: 'list' }, execute);
    expect(calls).toHaveLength(1);
    expect(calls[0].operationId).toBe('comments.list');
  });

  it('dispatches superdoc_review list action to trackChanges.list', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_review', { action: 'list' }, execute);
    expect(calls).toHaveLength(1);
    expect(calls[0].operationId).toBe('trackChanges.list');
  });

  it('dispatches superdoc_format with bold to format.apply', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_format', { target: '{"kind":"text"}', bold: true }, execute);
    expect(calls).toHaveLength(1);
    expect(calls[0].operationId).toBe('format.apply');
  });

  it('throws for unknown tool name', async () => {
    const { execute } = mockExecutor();
    expect(dispatch('superdoc_nonexistent', {}, execute)).rejects.toThrow('Unknown tool');
  });

  it('all 13 tool names are dispatchable', () => {
    const toolNames = ALL_TOOLS.map((t) => t.name);
    expect(toolNames).toHaveLength(13);
    expect(toolNames).toContain('superdoc_read');
    expect(toolNames).toContain('superdoc_find');
    expect(toolNames).toContain('superdoc_edit');
    expect(toolNames).toContain('superdoc_create');
    expect(toolNames).toContain('superdoc_format');
    expect(toolNames).toContain('superdoc_table');
    expect(toolNames).toContain('superdoc_list');
    expect(toolNames).toContain('superdoc_image');
    expect(toolNames).toContain('superdoc_comment');
    expect(toolNames).toContain('superdoc_review');
    expect(toolNames).toContain('superdoc_section');
    expect(toolNames).toContain('superdoc_reference');
    expect(toolNames).toContain('superdoc_control');
  });
});
