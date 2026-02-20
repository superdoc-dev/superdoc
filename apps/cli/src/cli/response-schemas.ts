/**
 * CLI response schemas — delegates to document-api for doc-backed operations.
 *
 * `validateOperationResponseData()` validates `CommandExecution["data"]`,
 * which for doc-backed ops IS the document-api output directly.
 * For CLI-only ops, permissive JSON validation is derived from the canonical
 * definitions object (precise schemas live in outputSchema for SDK use).
 */

import { buildInternalContractSchemas } from '@superdoc/document-api';
import type { CliTypeSpec } from './types';
import { CLI_ONLY_OPERATION_DEFINITIONS } from './cli-only-operation-definitions';

type JsonSchema = Record<string, unknown>;

function jsonSchemaToTypeSpec(schema: JsonSchema): CliTypeSpec {
  if ('const' in schema) return { const: schema.const } as CliTypeSpec;

  if (schema.oneOf) {
    return {
      oneOf: (schema.oneOf as JsonSchema[]).map(jsonSchemaToTypeSpec),
    } as CliTypeSpec;
  }

  if (schema.type === 'string') return { type: 'string' } as CliTypeSpec;
  if (schema.type === 'number' || schema.type === 'integer') return { type: 'number' } as CliTypeSpec;
  if (schema.type === 'boolean') return { type: 'boolean' } as CliTypeSpec;

  if (schema.type === 'array') {
    const items = (schema.items as JsonSchema) ?? {};
    return { type: 'array', items: jsonSchemaToTypeSpec(items) } as CliTypeSpec;
  }

  if (schema.type === 'object') {
    const properties: Record<string, CliTypeSpec> = {};
    for (const [key, propSchema] of Object.entries((schema.properties as Record<string, JsonSchema>) ?? {})) {
      properties[key] = jsonSchemaToTypeSpec(propSchema);
    }
    const result: CliTypeSpec = { type: 'object', properties } as CliTypeSpec;
    if (schema.required && Array.isArray(schema.required)) {
      (result as { required: readonly string[] }).required = schema.required as string[];
    }
    return result;
  }

  return { type: 'json' } as CliTypeSpec;
}

/** Lazy-init cache for doc-backed response schemas. */
let cachedDocSchemas: Map<string, CliTypeSpec> | null = null;

function getDocResponseSchemas(): Map<string, CliTypeSpec> {
  if (cachedDocSchemas) return cachedDocSchemas;

  const schemas = buildInternalContractSchemas();
  cachedDocSchemas = new Map<string, CliTypeSpec>();

  for (const [opId, schemaSet] of Object.entries(schemas.operations)) {
    const cliOpId = `doc.${opId}`;
    cachedDocSchemas.set(cliOpId, jsonSchemaToTypeSpec(schemaSet.output as JsonSchema));
  }

  return cachedDocSchemas;
}

/** CLI-only operation response schemas (permissive — derived from canonical definitions). */
const CLI_ONLY_RESPONSE_SCHEMAS: Record<string, CliTypeSpec> = Object.fromEntries(
  Object.keys(CLI_ONLY_OPERATION_DEFINITIONS).map((op) => [`doc.${op}`, { type: 'json' } as CliTypeSpec]),
);

/**
 * Returns the response validation schema for a CLI operation.
 * Doc-backed ops get strict schemas from document-api; CLI-only ops get permissive JSON.
 */
export function getResponseSchema(cliOpId: string): CliTypeSpec | null {
  const docSchemas = getDocResponseSchemas();
  const fromDoc = docSchemas.get(cliOpId);
  if (fromDoc) return fromDoc;

  return CLI_ONLY_RESPONSE_SCHEMAS[cliOpId] ?? null;
}
