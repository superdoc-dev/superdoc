import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { jsonSchemaToZodShape } from '../tools/json-schema-to-zod.js';
import { ALL_TOOLS } from '@superdoc/llm-tools';

describe('jsonSchemaToZodShape', () => {
  it('converts string properties', () => {
    const shape = jsonSchemaToZodShape({
      properties: {
        name: { type: 'string', description: 'A name' },
      },
      required: ['name'],
    });

    expect(shape.name).toBeDefined();
    const result = z.object(shape).safeParse({ name: 'hello' });
    expect(result.success).toBe(true);
  });

  it('converts string enum properties', () => {
    const shape = jsonSchemaToZodShape({
      properties: {
        action: { type: 'string', enum: ['insert', 'replace', 'delete'], description: 'Action' },
      },
      required: ['action'],
    });

    const schema = z.object(shape);
    expect(schema.safeParse({ action: 'insert' }).success).toBe(true);
    expect(schema.safeParse({ action: 'invalid' }).success).toBe(false);
  });

  it('converts number properties', () => {
    const shape = jsonSchemaToZodShape({
      properties: {
        count: { type: 'number', description: 'A count' },
      },
      required: ['count'],
    });

    const schema = z.object(shape);
    expect(schema.safeParse({ count: 42 }).success).toBe(true);
    expect(schema.safeParse({ count: 'nope' }).success).toBe(false);
  });

  it('converts boolean properties', () => {
    const shape = jsonSchemaToZodShape({
      properties: {
        suggest: { type: 'boolean', description: 'Suggest mode' },
      },
      required: [],
    });

    const schema = z.object(shape);
    expect(schema.safeParse({ suggest: true }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true); // optional
  });

  it('marks required vs optional correctly', () => {
    const shape = jsonSchemaToZodShape({
      properties: {
        session_id: { type: 'string' },
        target: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['session_id', 'target'],
    });

    const schema = z.object(shape);
    expect(schema.safeParse({ session_id: 's1', target: 't1' }).success).toBe(true);
    expect(schema.safeParse({ session_id: 's1' }).success).toBe(false); // missing target
  });

  it('converts nested object properties', () => {
    const shape = jsonSchemaToZodShape({
      properties: {
        start: {
          type: 'object',
          properties: { rowIndex: { type: 'number' }, columnIndex: { type: 'number' } },
          description: 'Start cell',
        },
      },
      required: [],
    });

    const schema = z.object(shape);
    expect(schema.safeParse({ start: { rowIndex: 0, columnIndex: 1 } }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true); // optional
  });

  it('converts array properties', () => {
    const shape = jsonSchemaToZodShape({
      properties: {
        keys: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              columnIndex: { type: 'number' },
              direction: { type: 'string', enum: ['ascending', 'descending'] },
            },
          },
          description: 'Sort keys',
        },
      },
      required: [],
    });

    const schema = z.object(shape);
    expect(schema.safeParse({ keys: [{ columnIndex: 0, direction: 'ascending' }] }).success).toBe(true);
  });

  it('handles properties with no type (z.any)', () => {
    const shape = jsonSchemaToZodShape({
      properties: {
        value: { description: 'Any value' },
      },
      required: [],
    });

    const schema = z.object(shape);
    expect(schema.safeParse({ value: 'text' }).success).toBe(true);
    expect(schema.safeParse({ value: 42 }).success).toBe(true);
    expect(schema.safeParse({ value: true }).success).toBe(true);
  });

  it('converts all 13 llm-tools definitions without error', () => {
    expect(ALL_TOOLS).toHaveLength(13);

    for (const tool of ALL_TOOLS) {
      const shape = jsonSchemaToZodShape(tool.inputSchema);
      expect(shape).toBeDefined();
      expect(shape.session_id).toBeDefined();

      // Verify the shape can be used in z.object
      const schema = z.object(shape);
      expect(schema).toBeDefined();
    }
  });
});
