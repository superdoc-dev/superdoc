/**
 * Shared type definitions for the CLI metadata layer.
 *
 * These types mirror the shapes that consuming code (operation-args.ts,
 * operation-executor.ts, etc.) expects from the CLI metadata modules.
 */

// ---------------------------------------------------------------------------
// JSON Schema type spec (used for response validation + param schemas)
// ---------------------------------------------------------------------------

type TypeSpecBase = {
  description?: string;
};

export type CliTypeSpec =
  | ({ const: unknown } & TypeSpecBase)
  | ({ oneOf: readonly CliTypeSpec[] } & TypeSpecBase)
  | ({ type: 'json' } & TypeSpecBase)
  | ({ type: 'string' } & TypeSpecBase)
  | ({ type: 'number' } & TypeSpecBase)
  | ({ type: 'boolean' } & TypeSpecBase)
  | ({ type: 'array'; items: CliTypeSpec } & TypeSpecBase)
  | ({
      type: 'object';
      properties: Record<string, CliTypeSpec>;
      required?: readonly string[];
    } & TypeSpecBase);

// ---------------------------------------------------------------------------
// Per-operation param spec
// ---------------------------------------------------------------------------

export type CliOperationParamSpec = {
  name: string;
  kind: 'doc' | 'flag' | 'jsonFlag';
  flag?: string;
  type: 'string' | 'number' | 'boolean' | 'string[]' | 'json';
  required?: boolean;
  schema?: CliTypeSpec;
  /** When false, param is a transport-envelope detail hidden from agent tool schemas. */
  agentVisible?: boolean;
};

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

export type CliOperationConstraints = {
  requiresOneOf?: readonly (readonly string[])[];
  mutuallyExclusive?: readonly (readonly string[])[];
  requiredWhen?: readonly {
    param: string;
    whenParam: string;
    equals?: unknown;
    present?: boolean;
  }[];
};

// ---------------------------------------------------------------------------
// Per-operation metadata (combines params + response)
// ---------------------------------------------------------------------------

export type CliOperationMetadata = {
  command: string;
  positionalParams: readonly string[];
  docRequirement: 'required' | 'optional' | 'none';
  params: readonly CliOperationParamSpec[];
  constraints: CliOperationConstraints | null;
};

// ---------------------------------------------------------------------------
// Option spec (for arg parsing)
// ---------------------------------------------------------------------------

export type CliOperationOptionSpec = {
  name: string;
  type: 'string' | 'number' | 'boolean';
  aliases?: string[];
};

// ---------------------------------------------------------------------------
// Command spec
// ---------------------------------------------------------------------------

export type CliCommandSpec = {
  key: string;
  tokens: readonly string[];
  operationId: string;
  category: string;
  description: string;
  mutates: boolean;
  requiresDocumentContext: boolean;
  alias: boolean;
  canonicalKey: string;
  examples: readonly string[];
};

// ---------------------------------------------------------------------------
// Args-by-id type (for generic param extraction)
// ---------------------------------------------------------------------------

export type CliOperationArgsById = {
  [K: string]: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// CLI-only operation types (shared between operation-set and definitions)
// ---------------------------------------------------------------------------

export type CliCategory =
  | 'query'
  | 'mutation'
  | 'format'
  | 'create'
  | 'lists'
  | 'comments'
  | 'trackChanges'
  | 'capabilities'
  | 'lifecycle'
  | 'session'
  | 'introspection';

/** The 10 CLI-only operation identifiers (without `doc.` prefix). Single source of truth. */
export const CLI_ONLY_OPERATIONS = [
  'open',
  'save',
  'close',
  'status',
  'describe',
  'describeCommand',
  'session.list',
  'session.save',
  'session.close',
  'session.setDefault',
] as const;

export type CliOnlyOperation = (typeof CLI_ONLY_OPERATIONS)[number];
