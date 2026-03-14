import { describe, expect, test } from 'bun:test';

import { CLI_ONLY_OPERATIONS } from '../operation-set';
import { CLI_ONLY_OPERATION_DEFINITIONS } from '../cli-only-operation-definitions';

// ---------------------------------------------------------------------------
// Structural completeness
// ---------------------------------------------------------------------------

describe('CLI-only operation definitions', () => {
  test('all CLI_ONLY_OPERATIONS have entries in CLI_ONLY_OPERATION_DEFINITIONS', () => {
    for (const op of CLI_ONLY_OPERATIONS) {
      expect(CLI_ONLY_OPERATION_DEFINITIONS[op]).toBeDefined();
    }
  });

  test('no extra entries beyond CLI_ONLY_OPERATIONS', () => {
    const definedKeys = new Set(Object.keys(CLI_ONLY_OPERATION_DEFINITIONS));
    const expectedKeys = new Set<string>(CLI_ONLY_OPERATIONS);
    expect(definedKeys).toEqual(expectedKeys);
  });

  test('all CLI-only ops have non-empty outputSchema with type:object', () => {
    for (const [, def] of Object.entries(CLI_ONLY_OPERATION_DEFINITIONS)) {
      expect(def.outputSchema).toBeTruthy();
      expect(def.outputSchema.type).toBe('object');
    }
  });

  test('outputSchema required arrays only reference defined properties', () => {
    function checkSchema(schema: Record<string, unknown>, path: string) {
      const properties = schema.properties as Record<string, unknown> | undefined;
      const required = schema.required as string[] | undefined;

      if (required && properties) {
        for (const req of required) {
          expect(properties[req]).toBeDefined();
        }
      }

      // Recurse into nested object schemas
      if (properties) {
        for (const [key, propSchema] of Object.entries(properties)) {
          if (
            propSchema &&
            typeof propSchema === 'object' &&
            (propSchema as Record<string, unknown>).type === 'object'
          ) {
            checkSchema(propSchema as Record<string, unknown>, `${path}.${key}`);
          }
        }
      }
    }

    for (const [op, def] of Object.entries(CLI_ONLY_OPERATION_DEFINITIONS)) {
      checkSchema(def.outputSchema, op);
    }
  });

  test('all CLI-only ops have non-empty intentName', () => {
    for (const [, def] of Object.entries(CLI_ONLY_OPERATION_DEFINITIONS)) {
      expect(def.intentName).toBeTruthy();
    }
  });

  test('sdkMetadata fields present and correctly typed', () => {
    const validIdempotency = new Set(['idempotent', 'non-idempotent', 'conditional']);

    for (const [, def] of Object.entries(CLI_ONLY_OPERATION_DEFINITIONS)) {
      expect(typeof def.sdkMetadata.mutates).toBe('boolean');
      expect(validIdempotency.has(def.sdkMetadata.idempotency)).toBe(true);
      expect(typeof def.sdkMetadata.supportsTrackedMode).toBe('boolean');
      expect(typeof def.sdkMetadata.supportsDryRun).toBe('boolean');
    }
  });
});

// ---------------------------------------------------------------------------
// Schema validity (lightweight — no AJV dependency)
// ---------------------------------------------------------------------------

describe('CLI-only outputSchema validity', () => {
  const VALID_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object']);

  function validateSchemaNode(schema: Record<string, unknown>, path: string) {
    if (schema.type) {
      expect(VALID_TYPES.has(schema.type as string)).toBe(true);
    }

    if (schema.type === 'object' && schema.properties) {
      expect(typeof schema.properties).toBe('object');
      for (const [key, propSchema] of Object.entries(schema.properties as Record<string, unknown>)) {
        if (propSchema && typeof propSchema === 'object') {
          validateSchemaNode(propSchema as Record<string, unknown>, `${path}.properties.${key}`);
        }
      }
    }

    if (schema.type === 'array' && schema.items) {
      expect(typeof schema.items).toBe('object');
      validateSchemaNode(schema.items as Record<string, unknown>, `${path}.items`);
    }

    if (schema.required) {
      expect(Array.isArray(schema.required)).toBe(true);
    }
  }

  test('all outputSchemas have valid JSON Schema structure', () => {
    for (const [op, def] of Object.entries(CLI_ONLY_OPERATION_DEFINITIONS)) {
      validateSchemaNode(def.outputSchema, op);
    }
  });
});

// ---------------------------------------------------------------------------
// Intent name naming policy
// ---------------------------------------------------------------------------

describe('CLI-only intent name naming policy', () => {
  test('all intentNames match snake_case naming policy', () => {
    for (const [, def] of Object.entries(CLI_ONLY_OPERATION_DEFINITIONS)) {
      expect(def.intentName).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  test('all intentNames are unique', () => {
    const seen = new Set<string>();
    for (const [, def] of Object.entries(CLI_ONLY_OPERATION_DEFINITIONS)) {
      expect(seen.has(def.intentName)).toBe(false);
      seen.add(def.intentName);
    }
  });
});
