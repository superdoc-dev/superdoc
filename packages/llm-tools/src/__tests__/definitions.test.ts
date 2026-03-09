import { test, expect, describe } from 'bun:test';
import { ALL_TOOLS } from '../index.js';

describe('tool definitions', () => {
  test('exports 13 tools (excluding lifecycle)', () => {
    expect(ALL_TOOLS).toHaveLength(13);
  });

  test('all tools have unique names', () => {
    const names = ALL_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('all tool names start with "superdoc_"', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.name).toStartWith('superdoc_');
    }
  });

  test('all tools have a description', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  test('all tools have a valid inputSchema', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeTruthy();
      expect(tool.inputSchema.required).toBeInstanceOf(Array);
    }
  });

  test('all tools require session_id', () => {
    for (const tool of ALL_TOOLS) {
      const required = tool.inputSchema.required as string[];
      expect(required).toContain('session_id');
    }
  });

  test('all tools have annotations', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.annotations).toBeTruthy();
      expect(typeof tool.annotations!.readOnlyHint).toBe('boolean');
    }
  });

  test('read-only tools are marked correctly', () => {
    const readOnly = ALL_TOOLS.filter((t) => t.annotations?.readOnlyHint);
    const readOnlyNames = readOnly.map((t) => t.name);
    expect(readOnlyNames).toContain('superdoc_read');
    expect(readOnlyNames).toContain('superdoc_find');
    expect(readOnlyNames).not.toContain('superdoc_edit');
    expect(readOnlyNames).not.toContain('superdoc_format');
  });

  test('expected tool names are present', () => {
    const names = ALL_TOOLS.map((t) => t.name);
    expect(names).toEqual([
      'superdoc_read',
      'superdoc_find',
      'superdoc_edit',
      'superdoc_create',
      'superdoc_format',
      'superdoc_table',
      'superdoc_list',
      'superdoc_image',
      'superdoc_comment',
      'superdoc_review',
      'superdoc_section',
      'superdoc_reference',
      'superdoc_control',
    ]);
  });
});
