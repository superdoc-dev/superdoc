/**
 * JSON Schema generation from the ValueSchema AST.
 *
 * Imports only from registry.ts. Consumed by contract/schemas.ts.
 */

import type { ValueSchema, StylesChannel } from './registry.js';
import { PROPERTY_REGISTRY } from './registry.js';

type JsonSchema = Record<string, unknown>;

// ---------------------------------------------------------------------------
// ValueSchema → JSON Schema conversion (recursive)
// ---------------------------------------------------------------------------

/** Converts a ValueSchema AST node to a JSON Schema object. */
export function toJsonSchema(schema: ValueSchema): JsonSchema {
  switch (schema.kind) {
    case 'boolean':
      return { type: 'boolean' };

    case 'integer': {
      const s: JsonSchema = { type: 'integer' };
      if (schema.min !== undefined) s.minimum = schema.min;
      if (schema.max !== undefined) s.maximum = schema.max;
      return s;
    }

    case 'enum':
      return { enum: [...schema.values] };

    case 'string':
      return { type: 'string', minLength: 1 };

    case 'object': {
      const properties: Record<string, JsonSchema> = {};
      for (const [key, childSchema] of Object.entries(schema.children)) {
        properties[key] = toJsonSchema(childSchema);
      }
      return {
        type: 'object',
        properties,
        additionalProperties: false,
        minProperties: 1,
      };
    }

    case 'array':
      return {
        type: 'array',
        items: toJsonSchema(schema.item),
      };
  }
}

// ---------------------------------------------------------------------------
// Registry → patch schemas (for contract/schemas.ts)
// ---------------------------------------------------------------------------

/** Builds a JSON Schema for the patch object of a given channel. */
export function buildPatchSchema(channel: StylesChannel): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  for (const def of PROPERTY_REGISTRY) {
    if (def.channel !== channel) continue;
    properties[def.key] = toJsonSchema(def.schema);
  }
  return {
    type: 'object',
    properties,
    additionalProperties: false,
    minProperties: 1,
  };
}

/** Builds a JSON Schema for the before/after state map covering all registry keys. */
export function buildStateSchema(): JsonSchema {
  const properties: Record<string, JsonSchema> = {};

  for (const def of PROPERTY_REGISTRY) {
    const schema = def.schema;
    switch (schema.kind) {
      case 'boolean':
        properties[def.key] = { enum: ['on', 'off', 'inherit'] };
        break;
      case 'integer':
        properties[def.key] = { oneOf: [{ type: 'number' }, { const: 'inherit' }] };
        break;
      case 'enum':
      case 'string':
        properties[def.key] = { oneOf: [{ type: 'string' }, { const: 'inherit' }] };
        break;
      case 'object':
        properties[def.key] = { oneOf: [{ type: 'object' }, { const: 'inherit' }] };
        break;
      case 'array':
        properties[def.key] = { oneOf: [{ type: 'array' }, { const: 'inherit' }] };
        break;
    }
  }

  return {
    type: 'object',
    properties,
    additionalProperties: false,
  };
}
