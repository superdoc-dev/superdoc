/**
 * Dedicated $ref/$defs test fixtures for CLI schema consumers.
 *
 * Verifies that `operation-params.ts` and `response-schemas.ts` correctly
 * resolve `$ref` pointers against a `$defs` map when deriving CLI metadata
 * from JSON Schema operation schemas.
 *
 * Uses synthetic schemas — not production schemas — to exercise resolution
 * in isolation (per Phase 2 acceptance criteria).
 */

import { describe, expect, test } from 'bun:test';
import { _testExports as paramExports } from '../operation-params';
import { _testExports as responseExports } from '../response-schemas';
import type { CliTypeSpec } from '../types';

const $defs: Record<string, Record<string, unknown>> = {
  TextAddress: {
    type: 'object',
    properties: {
      kind: { type: 'string' },
      blockId: { type: 'string' },
      range: {
        type: 'object',
        properties: {
          start: { type: 'integer' },
          end: { type: 'integer' },
        },
        required: ['start', 'end'],
      },
    },
    required: ['kind', 'blockId', 'range'],
    additionalProperties: false,
  },
  MarkSet: {
    type: 'object',
    properties: {
      bold: { type: 'boolean' },
      italic: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  Handle: {
    type: 'object',
    properties: {
      ref: { type: 'string' },
      refStability: { enum: ['stable', 'ephemeral'] },
    },
    required: ['ref', 'refStability'],
  },
};

// ---------------------------------------------------------------------------
// operation-params: jsonSchemaToTypeSpec with $ref
// ---------------------------------------------------------------------------

describe('operation-params $ref resolution', () => {
  const { jsonSchemaToTypeSpec } = paramExports;

  test('resolves top-level $ref to a concrete type spec', () => {
    const schema = { $ref: '#/$defs/TextAddress' };
    const result = jsonSchemaToTypeSpec(schema, $defs);
    expect((result as { type: string }).type).toBe('object');
    expect((result as { properties: Record<string, unknown> }).properties).toHaveProperty('kind');
    expect((result as { properties: Record<string, unknown> }).properties).toHaveProperty('blockId');
    expect((result as { properties: Record<string, unknown> }).properties).toHaveProperty('range');
  });

  test('resolves nested $ref inside object properties', () => {
    const schema = {
      type: 'object',
      properties: {
        target: { $ref: '#/$defs/TextAddress' },
        marks: { $ref: '#/$defs/MarkSet' },
        text: { type: 'string' },
      },
      required: ['target', 'marks', 'text'],
    };
    const result = jsonSchemaToTypeSpec(schema, $defs) as {
      type: string;
      properties: Record<string, CliTypeSpec>;
      required: readonly string[];
    };
    expect(result.type).toBe('object');
    expect((result.properties.target as { type: string }).type).toBe('object');
    expect((result.properties.marks as { type: string }).type).toBe('object');
    expect((result.properties.text as { type: string }).type).toBe('string');
  });

  test('resolves $ref inside array items', () => {
    const schema = {
      type: 'array',
      items: { $ref: '#/$defs/Handle' },
    };
    const result = jsonSchemaToTypeSpec(schema, $defs) as {
      type: string;
      items: { type: string; properties: Record<string, unknown> };
    };
    expect(result.type).toBe('array');
    expect(result.items.type).toBe('object');
    expect(result.items.properties).toHaveProperty('ref');
  });

  test('resolves $ref inside oneOf branches', () => {
    const schema = {
      oneOf: [{ $ref: '#/$defs/TextAddress' }, { type: 'string' }],
    };
    const result = jsonSchemaToTypeSpec(schema, $defs) as { oneOf: CliTypeSpec[] };
    expect(result.oneOf).toHaveLength(2);
    expect((result.oneOf[0] as { type: string }).type).toBe('object');
    expect((result.oneOf[1] as { type: string }).type).toBe('string');
  });

  test('falls back to json type for unresolved $ref', () => {
    const schema = { $ref: '#/$defs/Missing' };
    const result = jsonSchemaToTypeSpec(schema, $defs);
    // unresolved $ref returns the raw {$ref:...} which has no type → falls to 'json'
    expect((result as { type: string }).type).toBe('json');
  });

  test('works without $defs (backward compat)', () => {
    const schema = { type: 'string' };
    const result = jsonSchemaToTypeSpec(schema);
    expect((result as { type: string }).type).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// operation-params: deriveParamsFromInputSchema with $ref
// ---------------------------------------------------------------------------

describe('operation-params deriveParamsFromInputSchema with $ref', () => {
  const { deriveParamsFromInputSchema } = paramExports;

  test('derives params from schema with $ref properties', () => {
    const inputSchema = {
      type: 'object',
      properties: {
        target: { $ref: '#/$defs/TextAddress' },
        text: { type: 'string' },
      },
      required: ['target', 'text'],
    };
    const { params } = deriveParamsFromInputSchema(inputSchema, $defs);
    const targetParam = params.find((p) => p.name === 'target');
    const textParam = params.find((p) => p.name === 'text');
    expect(targetParam).toBeDefined();
    expect(targetParam!.type).toBe('json'); // complex object → json
    expect(targetParam!.required).toBe(true);
    expect(textParam).toBeDefined();
    expect(textParam!.type).toBe('string');
    expect(textParam!.required).toBe(true);
  });

  test('derives params from schema with $ref to simple type', () => {
    const simpleDefs = {
      ...($defs as Record<string, Record<string, unknown>>),
      Mode: { type: 'string', enum: ['strict', 'candidates'] },
    };
    const inputSchema = {
      type: 'object',
      properties: {
        mode: { $ref: '#/$defs/Mode' },
      },
    };
    const { params } = deriveParamsFromInputSchema(inputSchema, simpleDefs);
    const modeParam = params.find((p) => p.name === 'mode');
    expect(modeParam).toBeDefined();
    expect(modeParam!.type).toBe('string'); // enum → string
  });
});

// ---------------------------------------------------------------------------
// response-schemas: jsonSchemaToTypeSpec with $ref
// ---------------------------------------------------------------------------

describe('response-schemas $ref resolution', () => {
  const { jsonSchemaToTypeSpec } = responseExports;

  test('resolves top-level $ref to a concrete type spec', () => {
    const schema = { $ref: '#/$defs/Handle' };
    const result = jsonSchemaToTypeSpec(schema, $defs);
    expect((result as { type: string }).type).toBe('object');
    expect((result as { properties: Record<string, unknown> }).properties).toHaveProperty('ref');
  });

  test('resolves nested $ref in response output', () => {
    const schema = {
      type: 'object',
      properties: {
        success: { const: true },
        result: {
          type: 'object',
          properties: {
            handle: { $ref: '#/$defs/Handle' },
            address: { $ref: '#/$defs/TextAddress' },
          },
        },
      },
    };
    const result = jsonSchemaToTypeSpec(schema, $defs) as {
      type: string;
      properties: Record<string, CliTypeSpec>;
    };
    expect(result.type).toBe('object');
    const innerResult = result.properties.result as {
      type: string;
      properties: Record<string, CliTypeSpec>;
    };
    expect(innerResult.type).toBe('object');
    expect((innerResult.properties.handle as { type: string }).type).toBe('object');
    expect((innerResult.properties.address as { type: string }).type).toBe('object');
  });

  test('works without $defs (backward compat)', () => {
    const schema = { type: 'boolean' };
    const result = jsonSchemaToTypeSpec(schema);
    expect((result as { type: string }).type).toBe('boolean');
  });
});
