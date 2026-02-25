import { describe, expect, it } from 'vitest';
import { validateJsonSchema } from './schema-validator.js';

describe('schema-validator $ref resolution', () => {
  const $defs = {
    Address: {
      type: 'object' as const,
      properties: {
        kind: { type: 'string' as const },
        blockId: { type: 'string' as const },
      },
      required: ['kind', 'blockId'],
      additionalProperties: false,
    },
    MarkSet: {
      type: 'object' as const,
      properties: {
        bold: { type: 'boolean' as const },
        italic: { type: 'boolean' as const },
      },
      additionalProperties: false,
    },
  };

  it('resolves top-level $ref to $defs entry', () => {
    const schema = { $ref: '#/$defs/Address' };
    const result = validateJsonSchema(schema, { kind: 'text', blockId: 'p1' }, $defs);
    expect(result.valid).toBe(true);
  });

  it('rejects invalid value against resolved $ref', () => {
    const schema = { $ref: '#/$defs/Address' };
    const result = validateJsonSchema(schema, { kind: 123 }, $defs);
    expect(result.valid).toBe(false);
  });

  it('resolves nested $ref in object properties', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        target: { $ref: '#/$defs/Address' },
        marks: { $ref: '#/$defs/MarkSet' },
      },
      required: ['target', 'marks'],
      additionalProperties: false,
    };
    const result = validateJsonSchema(
      schema,
      { target: { kind: 'text', blockId: 'p1' }, marks: { bold: true } },
      $defs,
    );
    expect(result.valid).toBe(true);
  });

  it('resolves $ref in array items', () => {
    const schema = {
      type: 'array' as const,
      items: { $ref: '#/$defs/Address' },
    };
    const result = validateJsonSchema(
      schema,
      [
        { kind: 'text', blockId: 'p1' },
        { kind: 'node', blockId: 'p2' },
      ],
      $defs,
    );
    expect(result.valid).toBe(true);
  });

  it('resolves $ref in oneOf branches', () => {
    const schema = {
      oneOf: [{ $ref: '#/$defs/Address' }, { type: 'string' as const }],
    };
    const result = validateJsonSchema(schema, { kind: 'text', blockId: 'p1' }, $defs);
    expect(result.valid).toBe(true);
    const result2 = validateJsonSchema(schema, 'plain-string', $defs);
    expect(result2.valid).toBe(true);
  });

  it('resolves $ref in anyOf branches', () => {
    const schema = {
      anyOf: [{ $ref: '#/$defs/Address' }, { type: 'string' as const }],
    };
    const result = validateJsonSchema(schema, { kind: 'text', blockId: 'p1' }, $defs);
    expect(result.valid).toBe(true);
  });

  it('reports unresolved $ref', () => {
    const schema = { $ref: '#/$defs/Missing' };
    const result = validateJsonSchema(schema, {}, $defs);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('unresolved $ref');
  });

  it('reports unresolved $ref when no $defs provided', () => {
    const schema = { $ref: '#/$defs/Address' };
    const result = validateJsonSchema(schema, {});
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('unresolved $ref');
  });

  it('ignores $defs at schema root (it is a keyword store, not a validation constraint)', () => {
    const schema = {
      type: 'object' as const,
      $defs: { Foo: { type: 'string' as const } },
      properties: { name: { type: 'string' as const } },
      additionalProperties: false,
    };
    const result = validateJsonSchema(schema, { name: 'test' });
    expect(result.valid).toBe(true);
  });
});
