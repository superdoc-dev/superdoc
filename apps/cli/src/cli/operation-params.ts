/**
 * Per-operation CLI param metadata — derived from document-api input schemas.
 *
 * For doc-backed operations, param specs are derived at init time from
 * `buildInternalContractSchemas()` input schemas. The CLI only hand-writes:
 * - Envelope params (session, out, force, dry-run, change-mode, expected-revision)
 * - Constraints (mutuallyExclusive, requiresOneOf) for a handful of ops
 * - Positional overrides (describeCommand)
 * - CLI-only operation metadata (10 ops)
 */

import {
  buildInternalContractSchemas,
  COMMAND_CATALOG,
  OPERATION_REQUIRES_DOCUMENT_CONTEXT_MAP,
  type OperationId,
} from '@superdoc/document-api';
import type {
  CliOperationConstraints,
  CliOperationMetadata,
  CliOperationOptionSpec,
  CliOperationParamSpec,
  CliTypeSpec,
} from './types';
import {
  CLI_DOC_OPERATIONS,
  CLI_OPERATION_IDS,
  type CliOperationId,
  type CliOnlyOperation,
  type DocBackedCliOpId,
} from './operation-set';
import { CLI_OPERATION_COMMAND_KEYS } from './commands';

// ---------------------------------------------------------------------------
// Envelope param templates (CLI transport — not in document-api)
// ---------------------------------------------------------------------------

const DOC_PARAM: CliOperationParamSpec = { name: 'doc', kind: 'doc', type: 'string' };
const SESSION_PARAM: CliOperationParamSpec = { name: 'sessionId', kind: 'flag', flag: 'session', type: 'string' };
const OUT_PARAM: CliOperationParamSpec = { name: 'out', kind: 'flag', type: 'string', agentVisible: false };
const FORCE_PARAM: CliOperationParamSpec = { name: 'force', kind: 'flag', type: 'boolean' };
const DRY_RUN_PARAM: CliOperationParamSpec = {
  name: 'dryRun',
  kind: 'flag',
  flag: 'dry-run',
  type: 'boolean',
  agentVisible: false,
};
const CHANGE_MODE_PARAM: CliOperationParamSpec = {
  name: 'changeMode',
  kind: 'flag',
  flag: 'change-mode',
  type: 'string',
  schema: { oneOf: [{ const: 'direct' }, { const: 'tracked' }] } as CliTypeSpec,
  agentVisible: false,
};
const EXPECTED_REVISION_PARAM: CliOperationParamSpec = {
  name: 'expectedRevision',
  kind: 'flag',
  flag: 'expected-revision',
  type: 'number',
  agentVisible: false,
};

// ---------------------------------------------------------------------------
// Schema → param derivation
// ---------------------------------------------------------------------------

type JsonSchema = Record<string, unknown>;
const AGENT_HIDDEN_PARAM_NAMES = new Set(['out', 'expectedRevision', 'changeMode', 'dryRun']);

function resolveRef(schema: JsonSchema, $defs?: Record<string, JsonSchema>): JsonSchema {
  if (schema.$ref && $defs) {
    const prefix = '#/$defs/';
    if (typeof schema.$ref === 'string' && schema.$ref.startsWith(prefix)) {
      const name = schema.$ref.slice(prefix.length);
      const resolved = $defs[name];
      if (resolved) return resolveRef(resolved, $defs);
    }
  }
  return schema;
}

function schemaToParamType(schema: JsonSchema, $defs?: Record<string, JsonSchema>): CliOperationParamSpec['type'] {
  schema = resolveRef(schema, $defs);
  if (schema.type === 'string') return 'string';
  if (schema.type === 'number' || schema.type === 'integer') return 'number';
  if (schema.type === 'boolean') return 'boolean';
  if (schema.type === 'array' && (schema.items as JsonSchema | undefined)?.type === 'string') return 'string[]';
  // Enums and oneOf-const are string enums
  if (schema.enum && Array.isArray(schema.enum)) return 'string';
  if (schema.oneOf && Array.isArray(schema.oneOf) && (schema.oneOf as JsonSchema[]).every((v) => 'const' in v))
    return 'string';
  return 'json';
}

function isSimpleType(schema: JsonSchema, $defs?: Record<string, JsonSchema>): boolean {
  schema = resolveRef(schema, $defs);
  const t = schema.type;
  if (t === 'string' || t === 'number' || t === 'integer' || t === 'boolean') return true;
  // Enums without explicit type are string enums
  if (schema.enum && Array.isArray(schema.enum)) return true;
  // oneOf with all const values is a string enum
  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    const allConst = (schema.oneOf as JsonSchema[]).every((v) => 'const' in v);
    if (allConst) return true;
  }
  return false;
}

function jsonSchemaToTypeSpec(schema: JsonSchema, $defs?: Record<string, JsonSchema>): CliTypeSpec {
  schema = resolveRef(schema, $defs);

  if ('const' in schema) return { const: schema.const } as CliTypeSpec;

  if (schema.oneOf) {
    return {
      oneOf: (schema.oneOf as JsonSchema[]).map((s) => jsonSchemaToTypeSpec(s, $defs)),
    } as CliTypeSpec;
  }

  if (schema.enum && Array.isArray(schema.enum)) {
    return {
      oneOf: (schema.enum as unknown[]).map((v) => ({ const: v }) as CliTypeSpec),
    } as CliTypeSpec;
  }

  if (schema.type === 'string') return { type: 'string' } as CliTypeSpec;
  if (schema.type === 'number' || schema.type === 'integer') return { type: 'number' } as CliTypeSpec;
  if (schema.type === 'boolean') return { type: 'boolean' } as CliTypeSpec;

  if (schema.type === 'array') {
    const items = (schema.items as JsonSchema) ?? {};
    return { type: 'array', items: jsonSchemaToTypeSpec(items, $defs) } as CliTypeSpec;
  }

  if (schema.type === 'object') {
    const properties: Record<string, CliTypeSpec> = {};
    for (const [key, propSchema] of Object.entries((schema.properties as Record<string, JsonSchema>) ?? {})) {
      properties[key] = jsonSchemaToTypeSpec(propSchema, $defs);
    }
    const result: CliTypeSpec = { type: 'object', properties } as CliTypeSpec;
    if (schema.required && Array.isArray(schema.required)) {
      (result as { required: readonly string[] }).required = schema.required as string[];
    }
    return result;
  }

  return { type: 'json' } as CliTypeSpec;
}

function deriveParamsFromInputSchema(
  inputSchema: JsonSchema,
  $defs?: Record<string, JsonSchema>,
): {
  params: CliOperationParamSpec[];
  positionalParams: string[];
} {
  const params: CliOperationParamSpec[] = [];
  const positionalParams: string[] = [];
  const properties = (inputSchema.properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set<string>((inputSchema.required as string[]) ?? []);

  for (const [name, rawPropSchema] of Object.entries(properties)) {
    const propSchema = resolveRef(rawPropSchema, $defs);
    const paramType = schemaToParamType(propSchema, $defs);
    const isComplex = !isSimpleType(propSchema, $defs) && paramType === 'json';

    const flagBase = camelToKebab(name);
    const param: CliOperationParamSpec = {
      name,
      kind: isComplex ? 'jsonFlag' : 'flag',
      flag: isComplex ? `${flagBase}-json` : flagBase,
      type: paramType,
      required: required.has(name),
    };

    if (AGENT_HIDDEN_PARAM_NAMES.has(name)) {
      param.agentVisible = false;
    }

    if (isComplex || (!isSimpleType(propSchema, $defs) && paramType !== 'json')) {
      param.schema = jsonSchemaToTypeSpec(propSchema, $defs);
    }

    // Attach enum schema for simple string params with oneOf/enum
    if (paramType === 'string' && (propSchema.oneOf || propSchema.enum)) {
      param.schema = jsonSchemaToTypeSpec(propSchema, $defs);
    }

    params.push(param);
  }

  return { params, positionalParams };
}

function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
}

// ---------------------------------------------------------------------------
// Envelope params per operation profile
// ---------------------------------------------------------------------------

function envelopeParams(docApiId: OperationId): CliOperationParamSpec[] {
  const catalog = COMMAND_CATALOG[docApiId];
  const envelope: CliOperationParamSpec[] = [];
  const requiresDoc = OPERATION_REQUIRES_DOCUMENT_CONTEXT_MAP[docApiId];

  if (requiresDoc) {
    envelope.push(DOC_PARAM);
  }

  envelope.push(SESSION_PARAM);

  if (catalog.mutates) {
    envelope.push(OUT_PARAM, FORCE_PARAM, EXPECTED_REVISION_PARAM, CHANGE_MODE_PARAM);

    if (catalog.supportsDryRun) {
      envelope.push(DRY_RUN_PARAM);
    }
  }

  return envelope;
}

// ---------------------------------------------------------------------------
// Per-operation constraint overrides
// ---------------------------------------------------------------------------

const OPERATION_CONSTRAINTS: Partial<Record<string, CliOperationConstraints>> = {
  'doc.find': {
    requiresOneOf: [['type', 'query']],
    mutuallyExclusive: [['type', 'query']],
  },
  'doc.lists.list': {
    mutuallyExclusive: [
      ['query', 'within'],
      ['query', 'kind'],
      ['query', 'level'],
      ['query', 'ordinal'],
      ['query', 'limit'],
      ['query', 'offset'],
    ],
  },
};

// ---------------------------------------------------------------------------
// Per-operation param flag overrides
//
// Rename schema-derived params to match CLI flag conventions.
// E.g., document-api uses `commentId` but CLI flag is `--id`.
// ---------------------------------------------------------------------------

const PARAM_FLAG_OVERRIDES: Partial<Record<string, Record<string, { name?: string; flag?: string }>>> = {
  'doc.getNodeById': {
    nodeId: { name: 'id', flag: 'id' },
  },
  'doc.comments.create': {
    parentCommentId: { name: 'parentId', flag: 'parent-id' },
  },
  'doc.comments.patch': {
    commentId: { name: 'id', flag: 'id' },
  },
  'doc.comments.delete': {
    commentId: { name: 'id', flag: 'id' },
  },
  'doc.comments.get': {
    commentId: { name: 'id', flag: 'id' },
  },
  'doc.lists.get': {
    address: { flag: 'address-json' },
  },
};

// ---------------------------------------------------------------------------
// Per-operation param schema overrides
//
// Some contract schemas intentionally use broad placeholders (for example,
// mutation-step arrays represented as { type: 'object' }). Validate these
// payloads as generic JSON to avoid over-constraining CLI flags.
// ---------------------------------------------------------------------------

const PARAM_SCHEMA_OVERRIDES: Partial<Record<string, Record<string, CliTypeSpec>>> = {
  'doc.mutations.preview': {
    steps: { type: 'json' },
  },
  'doc.mutations.apply': {
    steps: { type: 'json' },
  },
};

// ---------------------------------------------------------------------------
// Schema-derived param exclusions
//
// Params derived from the document-api input schema that should NOT be
// exposed in CLI metadata because the CLI provides an alternative interface.
// ---------------------------------------------------------------------------

const PARAM_EXCLUSIONS: Partial<Record<string, ReadonlySet<string>>> = {
  // CLI uses flat flags (--type, --pattern, --mode) or --query-json; `select`
  // is an internal document-api field that the invoker builds from flat flags.
  'doc.find': new Set(['select']),
};

// ---------------------------------------------------------------------------
// Extra CLI-specific params for doc-backed operations
//
// These are convenience params that CLI invokers accept but are NOT in the
// document-api input schema. They are merged into the metadata alongside
// schema-derived and envelope params.
// ---------------------------------------------------------------------------

// Flat-flag shortcut params for text-range target normalization.
// These are convenience alternatives to --target-json; invoke-input.ts
// normalizes them into canonical target objects before dispatch.
const TEXT_TARGET_FLAT_PARAMS: CliOperationParamSpec[] = [
  { name: 'blockId', kind: 'flag', flag: 'block-id', type: 'string' },
  { name: 'start', kind: 'flag', type: 'number' },
  { name: 'end', kind: 'flag', type: 'number' },
];

const INSERT_FLAT_PARAMS: CliOperationParamSpec[] = [
  { name: 'blockId', kind: 'flag', flag: 'block-id', type: 'string' },
  { name: 'offset', kind: 'flag', type: 'number' },
];

const LIST_TARGET_FLAT_PARAMS: CliOperationParamSpec[] = [
  { name: 'nodeId', kind: 'flag', flag: 'node-id', type: 'string' },
];

const EXTRA_CLI_PARAMS: Partial<Record<string, CliOperationParamSpec[]>> = {
  'doc.find': [
    { name: 'type', kind: 'flag', type: 'string' },
    { name: 'nodeType', kind: 'flag', flag: 'node-type', type: 'string' },
    { name: 'kind', kind: 'flag', type: 'string' },
    { name: 'pattern', kind: 'flag', type: 'string' },
    { name: 'mode', kind: 'flag', type: 'string' },
    { name: 'caseSensitive', kind: 'flag', flag: 'case-sensitive', type: 'boolean' },
    { name: 'select', kind: 'jsonFlag', flag: 'select-json', type: 'json' },
    { name: 'query', kind: 'jsonFlag', flag: 'query-json', type: 'json' },
  ],
  'doc.lists.list': [{ name: 'query', kind: 'jsonFlag', flag: 'query-json', type: 'json' }],
  'doc.getNode': [{ name: 'address', kind: 'jsonFlag', flag: 'address-json', type: 'json' }],
  // Text-range operations: flat flags (--block-id, --start, --end) as shortcuts for --target-json
  'doc.insert': [...INSERT_FLAT_PARAMS],
  'doc.replace': [...TEXT_TARGET_FLAT_PARAMS],
  'doc.delete': [...TEXT_TARGET_FLAT_PARAMS],
  'doc.format.apply': [...TEXT_TARGET_FLAT_PARAMS],
  'doc.comments.create': [...TEXT_TARGET_FLAT_PARAMS],
  'doc.comments.patch': [...TEXT_TARGET_FLAT_PARAMS],
  // List operations: flat flag (--node-id) as shortcut for --target-json, plus --input-json
  'doc.lists.insert': [
    { name: 'input', kind: 'jsonFlag', flag: 'input-json', type: 'json' },
    ...LIST_TARGET_FLAT_PARAMS,
  ],
  'doc.lists.setType': [
    { name: 'input', kind: 'jsonFlag', flag: 'input-json', type: 'json' },
    ...LIST_TARGET_FLAT_PARAMS,
  ],
  'doc.lists.indent': [
    { name: 'input', kind: 'jsonFlag', flag: 'input-json', type: 'json' },
    ...LIST_TARGET_FLAT_PARAMS,
  ],
  'doc.lists.outdent': [
    { name: 'input', kind: 'jsonFlag', flag: 'input-json', type: 'json' },
    ...LIST_TARGET_FLAT_PARAMS,
  ],
  'doc.lists.restart': [
    { name: 'input', kind: 'jsonFlag', flag: 'input-json', type: 'json' },
    ...LIST_TARGET_FLAT_PARAMS,
  ],
  'doc.lists.exit': [{ name: 'input', kind: 'jsonFlag', flag: 'input-json', type: 'json' }, ...LIST_TARGET_FLAT_PARAMS],
  'doc.create.paragraph': [{ name: 'input', kind: 'jsonFlag', flag: 'input-json', type: 'json' }],
  'doc.create.heading': [{ name: 'input', kind: 'jsonFlag', flag: 'input-json', type: 'json' }],
};

// ---------------------------------------------------------------------------
// Doc requirement derivation
// ---------------------------------------------------------------------------

function docRequirement(docApiId: OperationId): 'required' | 'optional' | 'none' {
  const requiresDoc = OPERATION_REQUIRES_DOCUMENT_CONTEXT_MAP[docApiId];
  const catalog = COMMAND_CATALOG[docApiId];

  if (!requiresDoc) return 'none';
  if (catalog.mutates) return 'optional';
  return 'optional';
}

// ---------------------------------------------------------------------------
// CLI-only operation metadata (hand-written)
// ---------------------------------------------------------------------------

type CliOnlyOperationId = `doc.${CliOnlyOperation}`;

const CLI_ONLY_METADATA: Record<CliOnlyOperationId, CliOperationMetadata> = {
  'doc.open': {
    command: 'open',
    positionalParams: ['doc'],
    docRequirement: 'required',
    params: [
      { name: 'doc', kind: 'doc', type: 'string', required: true },
      SESSION_PARAM,
      { name: 'collaboration', kind: 'jsonFlag', flag: 'collaboration-json', type: 'json' },
      { name: 'collabDocumentId', kind: 'flag', flag: 'collab-document-id', type: 'string' },
      { name: 'collabUrl', kind: 'flag', flag: 'collab-url', type: 'string' },
    ],
    constraints: null,
  },
  'doc.save': {
    command: 'save',
    positionalParams: [],
    docRequirement: 'none',
    params: [
      SESSION_PARAM,
      OUT_PARAM,
      FORCE_PARAM,
      { name: 'inPlace', kind: 'flag', flag: 'in-place', type: 'boolean' },
    ],
    constraints: null,
  },
  'doc.close': {
    command: 'close',
    positionalParams: [],
    docRequirement: 'none',
    params: [SESSION_PARAM, { name: 'discard', kind: 'flag', type: 'boolean' }],
    constraints: null,
  },
  'doc.status': {
    command: 'status',
    positionalParams: [],
    docRequirement: 'none',
    params: [SESSION_PARAM],
    constraints: null,
  },
  'doc.describe': {
    command: 'describe',
    positionalParams: [],
    docRequirement: 'none',
    params: [],
    constraints: null,
  },
  'doc.describeCommand': {
    command: 'describe command',
    positionalParams: ['operationId'],
    docRequirement: 'none',
    params: [{ name: 'operationId', kind: 'doc', type: 'string', required: true }],
    constraints: null,
  },
  'doc.session.list': {
    command: 'session list',
    positionalParams: [],
    docRequirement: 'none',
    params: [],
    constraints: null,
  },
  'doc.session.save': {
    command: 'session save',
    positionalParams: ['sessionId'],
    docRequirement: 'none',
    params: [
      { name: 'sessionId', kind: 'doc', type: 'string', required: true },
      OUT_PARAM,
      FORCE_PARAM,
      { name: 'inPlace', kind: 'flag', flag: 'in-place', type: 'boolean' },
    ],
    constraints: null,
  },
  'doc.session.close': {
    command: 'session close',
    positionalParams: ['sessionId'],
    docRequirement: 'none',
    params: [
      { name: 'sessionId', kind: 'doc', type: 'string', required: true },
      { name: 'discard', kind: 'flag', type: 'boolean' },
    ],
    constraints: null,
  },
  'doc.session.setDefault': {
    command: 'session set-default',
    positionalParams: ['sessionId'],
    docRequirement: 'none',
    params: [{ name: 'sessionId', kind: 'doc', type: 'string', required: true }],
    constraints: null,
  },
};

// ---------------------------------------------------------------------------
// Build doc-backed operation metadata
// ---------------------------------------------------------------------------

function buildDocBackedMetadata(): Record<DocBackedCliOpId, CliOperationMetadata> {
  const schemas = buildInternalContractSchemas();
  const $defs = schemas.$defs as Record<string, JsonSchema> | undefined;
  const result = {} as Record<DocBackedCliOpId, CliOperationMetadata>;

  for (const docApiId of CLI_DOC_OPERATIONS) {
    const cliOpId = `doc.${docApiId}` as DocBackedCliOpId;
    const schemaSet = schemas.operations[docApiId];
    const inputSchema = schemaSet.input as JsonSchema;

    const { params: schemaParams } = deriveParamsFromInputSchema(inputSchema, $defs);
    const envelope = envelopeParams(docApiId);

    // Merge: envelope params first, then schema-derived params (skip duplicates)
    const seenNames = new Set<string>();
    const mergedParams: CliOperationParamSpec[] = [];

    for (const param of envelope) {
      seenNames.add(param.name);
      mergedParams.push(param);
    }

    // Apply flag overrides and exclusions to schema params before merging
    const overrides = PARAM_FLAG_OVERRIDES[cliOpId];
    const schemaOverrides = PARAM_SCHEMA_OVERRIDES[cliOpId];
    const exclusions = PARAM_EXCLUSIONS[cliOpId];
    for (const param of schemaParams) {
      if (exclusions?.has(param.name)) continue;
      if (overrides && overrides[param.name]) {
        const override = overrides[param.name];
        if (override.name) param.name = override.name;
        if (override.flag) param.flag = override.flag;
      }
      if (schemaOverrides?.[param.name]) {
        param.schema = schemaOverrides[param.name];
      }
      if (seenNames.has(param.name)) continue;
      seenNames.add(param.name);
      mergedParams.push(param);
    }

    // Merge extra CLI-specific params (skip duplicates).
    // Operations with extra CLI params have custom invokers that handle their
    // own validation, so strip `required` from schema-derived params.
    const extraParams = EXTRA_CLI_PARAMS[cliOpId];
    if (extraParams) {
      for (const p of mergedParams) {
        if (p.required) p.required = false;
      }
      for (const param of extraParams) {
        if (seenNames.has(param.name)) continue;
        seenNames.add(param.name);
        mergedParams.push(param);
      }
    }

    // Positional params: doc (if applicable)
    const positionalParams: string[] = [];
    if (OPERATION_REQUIRES_DOCUMENT_CONTEXT_MAP[docApiId]) {
      positionalParams.push('doc');
    }

    const commandKey = CLI_OPERATION_COMMAND_KEYS[cliOpId] ?? docApiId;

    result[cliOpId] = {
      command: commandKey,
      positionalParams,
      docRequirement: docRequirement(docApiId),
      params: mergedParams,
      constraints: OPERATION_CONSTRAINTS[cliOpId] ?? null,
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Compose full metadata map
// ---------------------------------------------------------------------------

function buildAllMetadata(): Record<CliOperationId, CliOperationMetadata> {
  const docBacked = buildDocBackedMetadata();
  const merged = {
    ...docBacked,
    ...CLI_ONLY_METADATA,
  } as Record<CliOperationId, CliOperationMetadata>;

  return Object.fromEntries(
    CLI_OPERATION_IDS.map((operationId) => {
      const metadata = merged[operationId];
      if (!metadata) {
        throw new Error(`Missing CLI metadata for operation: ${operationId}`);
      }
      return [operationId, metadata] as const;
    }),
  ) as Record<CliOperationId, CliOperationMetadata>;
}

export const CLI_OPERATION_METADATA: Record<CliOperationId, CliOperationMetadata> = buildAllMetadata();

// ---------------------------------------------------------------------------
// Option specs (derived mechanically from params)
// ---------------------------------------------------------------------------

function deriveOptionSpecs(params: readonly CliOperationParamSpec[]): CliOperationOptionSpec[] {
  const specs: CliOperationOptionSpec[] = [];

  for (const param of params) {
    // Skip positional-only params (operationId, sessionId) but include the
    // document path param so --doc is recognized by the parser.
    if (param.kind === 'doc' && param.name !== 'doc') continue;

    const optionType: CliOperationOptionSpec['type'] =
      param.type === 'json' || param.type === 'string[]' ? 'string' : param.type;

    specs.push({
      name: param.flag ?? param.name,
      type: optionType,
    });
  }

  return specs;
}

export const CLI_OPERATION_OPTION_SPECS: Record<CliOperationId, CliOperationOptionSpec[]> = Object.fromEntries(
  CLI_OPERATION_IDS.map((operationId) => [operationId, deriveOptionSpecs(CLI_OPERATION_METADATA[operationId].params)]),
) as Record<CliOperationId, CliOperationOptionSpec[]>;

// Exposed for unit testing $ref resolution only
export const _testExports = { jsonSchemaToTypeSpec, deriveParamsFromInputSchema } as const;
