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
import { CLI_OPERATION_COMMAND_KEYS } from './commands';
import {
  CLI_DOC_OPERATIONS,
  CLI_OPERATION_IDS,
  type CliOnlyOperation,
  type CliOperationId,
  type DocBackedCliOpId,
} from './operation-set';
import type {
  CliOperationConstraints,
  CliOperationMetadata,
  CliOperationOptionSpec,
  CliOperationParamSpec,
  CliTypeSpec,
} from './types';

// ---------------------------------------------------------------------------
// Envelope param templates (CLI transport — not in document-api)
// ---------------------------------------------------------------------------

const DOC_PARAM: CliOperationParamSpec = {
  name: 'doc',
  kind: 'doc',
  type: 'string',
  description: 'Document path. Optional when a session is already open.',
};
const SESSION_PARAM: CliOperationParamSpec = {
  name: 'sessionId',
  kind: 'flag',
  flag: 'session',
  type: 'string',
  description: 'Session ID for multi-session workflows. Optional when only one session is open.',
};
const OUT_PARAM: CliOperationParamSpec = { name: 'out', kind: 'flag', type: 'string', agentVisible: false };
const FORCE_PARAM: CliOperationParamSpec = {
  name: 'force',
  kind: 'flag',
  type: 'boolean',
  description: 'Bypass confirmation checks.',
};
const DRY_RUN_PARAM: CliOperationParamSpec = {
  name: 'dryRun',
  kind: 'flag',
  flag: 'dry-run',
  type: 'boolean',
  description: 'Preview the result without applying changes.',
};
const CHANGE_MODE_PARAM: CliOperationParamSpec = {
  name: 'changeMode',
  kind: 'flag',
  flag: 'change-mode',
  type: 'string',
  schema: { enum: ['direct', 'tracked'] } as CliTypeSpec,
  description: 'Edit mode: "direct" applies changes immediately, "tracked" records as suggestions.',
};
const EXPECTED_REVISION_PARAM: CliOperationParamSpec = {
  name: 'expectedRevision',
  kind: 'flag',
  flag: 'expected-revision',
  type: 'number',
  agentVisible: false,
};
const USER_NAME_PARAM: CliOperationParamSpec = {
  name: 'userName',
  kind: 'flag',
  flag: 'user-name',
  type: 'string',
};
const USER_EMAIL_PARAM: CliOperationParamSpec = {
  name: 'userEmail',
  kind: 'flag',
  flag: 'user-email',
  type: 'string',
};

// ---------------------------------------------------------------------------
// Schema → param derivation
// ---------------------------------------------------------------------------

type JsonSchema = Record<string, unknown>;
const AGENT_HIDDEN_PARAM_NAMES = new Set(['out']);

type ObjectSchemaVariant = {
  properties: Record<string, JsonSchema>;
  required: Set<string>;
};

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

function hasObjectShape(schema: JsonSchema): boolean {
  return schema.type === 'object' || schema.properties != null || schema.required != null;
}

function cloneVariant(variant: ObjectSchemaVariant): ObjectSchemaVariant {
  return {
    properties: { ...variant.properties },
    required: new Set(variant.required),
  };
}

function directObjectVariant(schema: JsonSchema): ObjectSchemaVariant {
  return {
    properties: {
      ...(((schema.properties as Record<string, JsonSchema> | undefined) ?? {}) as Record<string, JsonSchema>),
    },
    required: new Set<string>(((schema.required as string[] | undefined) ?? []) as string[]),
  };
}

function schemasEqual(left: JsonSchema, right: JsonSchema): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergePropertySchemas(left: JsonSchema, right: JsonSchema): JsonSchema {
  if (schemasEqual(left, right)) return left;

  const variants: JsonSchema[] = [];
  const appendVariant = (schema: JsonSchema) => {
    if (variants.some((candidate) => schemasEqual(candidate, schema))) return;
    variants.push(schema);
  };

  if (Array.isArray(left.oneOf)) {
    for (const entry of left.oneOf as JsonSchema[]) appendVariant(entry);
  } else {
    appendVariant(left);
  }

  if (Array.isArray(right.oneOf)) {
    for (const entry of right.oneOf as JsonSchema[]) appendVariant(entry);
  } else {
    appendVariant(right);
  }

  return variants.length === 1 ? variants[0]! : { oneOf: variants };
}

function mergeObjectVariants(left: ObjectSchemaVariant, right: ObjectSchemaVariant): ObjectSchemaVariant {
  const merged = cloneVariant(left);
  for (const [name, schema] of Object.entries(right.properties)) {
    const existing = merged.properties[name];
    merged.properties[name] = existing ? mergePropertySchemas(existing, schema) : schema;
  }
  for (const key of right.required) {
    merged.required.add(key);
  }
  return merged;
}

function extractObjectSchemaVariants(rawSchema: JsonSchema, $defs?: Record<string, JsonSchema>): ObjectSchemaVariant[] {
  const schema = resolveRef(rawSchema, $defs);
  const directVariants = hasObjectShape(schema) ? [directObjectVariant(schema)] : [];
  let variants = directVariants.length > 0 ? directVariants.map(cloneVariant) : [];

  if (Array.isArray(schema.allOf)) {
    variants = variants.length > 0 ? variants : [{ properties: {}, required: new Set<string>() }];
    for (const member of schema.allOf as JsonSchema[]) {
      const memberVariants = extractObjectSchemaVariants(member, $defs);
      if (memberVariants.length === 0) continue;

      const nextVariants: ObjectSchemaVariant[] = [];
      for (const base of variants) {
        for (const part of memberVariants) {
          nextVariants.push(mergeObjectVariants(base, part));
        }
      }
      variants = nextVariants;
    }
  }

  const alternativeKeyword = Array.isArray(schema.oneOf) ? 'oneOf' : Array.isArray(schema.anyOf) ? 'anyOf' : null;
  if (alternativeKeyword) {
    const branches = (schema[alternativeKeyword] as JsonSchema[]).flatMap((member) =>
      extractObjectSchemaVariants(member, $defs),
    );
    if (branches.length > 0) {
      const baseVariants = variants.length > 0 ? variants : [{ properties: {}, required: new Set<string>() }];
      const nextVariants: ObjectSchemaVariant[] = [];
      for (const base of baseVariants) {
        for (const branch of branches) {
          nextVariants.push(mergeObjectVariants(base, branch));
        }
      }
      variants = nextVariants;
    }
  }

  if (variants.length > 0) return variants;
  return hasObjectShape(schema) ? [directObjectVariant(schema)] : [];
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
  const desc = typeof schema.description === 'string' ? schema.description : undefined;

  let result: CliTypeSpec;

  if ('const' in schema) {
    result = { const: schema.const } as CliTypeSpec;
  } else if (schema.oneOf) {
    result = {
      oneOf: (schema.oneOf as JsonSchema[]).map((s) => jsonSchemaToTypeSpec(s, $defs)),
    } as CliTypeSpec;
  } else if (schema.enum && Array.isArray(schema.enum)) {
    result = {
      oneOf: (schema.enum as unknown[]).map((v) => ({ const: v }) as CliTypeSpec),
    } as CliTypeSpec;
  } else if (schema.type === 'string') {
    result = { type: 'string' } as CliTypeSpec;
  } else if (schema.type === 'number' || schema.type === 'integer') {
    result = { type: 'number' } as CliTypeSpec;
  } else if (schema.type === 'boolean') {
    result = { type: 'boolean' } as CliTypeSpec;
  } else if (schema.type === 'array') {
    const items = (schema.items as JsonSchema) ?? {};
    result = { type: 'array', items: jsonSchemaToTypeSpec(items, $defs) } as CliTypeSpec;
  } else if (schema.type === 'object') {
    const properties: Record<string, CliTypeSpec> = {};
    for (const [key, propSchema] of Object.entries((schema.properties as Record<string, JsonSchema>) ?? {})) {
      properties[key] = jsonSchemaToTypeSpec(propSchema, $defs);
    }
    result = { type: 'object', properties } as CliTypeSpec;
    if (schema.required && Array.isArray(schema.required)) {
      (result as { required: readonly string[] }).required = schema.required as string[];
    }
  } else {
    result = { type: 'json' } as CliTypeSpec;
  }

  if (desc) {
    (result as { description?: string }).description = desc;
  }
  return result;
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
  const variants = extractObjectSchemaVariants(inputSchema, $defs);
  const properties: Record<string, JsonSchema> = {};
  const requiredCounts = new Map<string, number>();

  for (const variant of variants) {
    for (const [name, schema] of Object.entries(variant.properties)) {
      const existing = properties[name];
      properties[name] = existing ? mergePropertySchemas(existing, schema) : schema;
    }
    for (const name of variant.required) {
      requiredCounts.set(name, (requiredCounts.get(name) ?? 0) + 1);
    }
  }

  const required = new Set<string>();
  for (const [name] of Object.entries(properties)) {
    if (variants.length > 0 && requiredCounts.get(name) === variants.length) {
      required.add(name);
    }
  }

  for (const [name, rawPropSchema] of Object.entries(properties)) {
    const propSchema = resolveRef(rawPropSchema, $defs);
    const paramType = schemaToParamType(propSchema, $defs);
    const isComplex = !isSimpleType(propSchema, $defs) && paramType === 'json';

    const flagBase = camelToKebab(name);
    const isRequired = required.has(name);
    const param: CliOperationParamSpec = {
      name,
      kind: isComplex ? 'jsonFlag' : 'flag',
      flag: isComplex ? `${flagBase}-json` : flagBase,
      type: paramType,
      required: isRequired,
    };

    // Propagate description from JSON Schema property.
    // Check raw schema first (description may sit alongside $ref), then resolved schema.
    const rawDesc = (rawPropSchema as JsonSchema).description;
    const resolvedDesc = propSchema.description;
    const desc = typeof rawDesc === 'string' ? rawDesc : typeof resolvedDesc === 'string' ? resolvedDesc : undefined;
    if (desc) {
      param.description = desc;
    }

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
// Override specific parameter schemas when the contract schema needs
// adjustment for CLI metadata (e.g. simplifying or enriching).
// ---------------------------------------------------------------------------

const PARAM_SCHEMA_OVERRIDES: Partial<Record<string, Record<string, CliTypeSpec>>> = {};

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
  { name: 'blockId', kind: 'flag', flag: 'block-id', type: 'string', description: 'Block ID of the target paragraph.' },
  { name: 'start', kind: 'flag', type: 'number', description: 'Start offset within the block (character index).' },
  { name: 'end', kind: 'flag', type: 'number', description: 'End offset within the block (character index).' },
];

const LIST_TARGET_FLAT_PARAMS: CliOperationParamSpec[] = [
  { name: 'nodeId', kind: 'flag', flag: 'node-id', type: 'string', description: 'Node ID of the target list item.' },
];

const FORMAT_OPERATION_IDS = CLI_DOC_OPERATIONS.filter((operationId): operationId is OperationId =>
  operationId.startsWith('format.'),
);

const EXTRA_CLI_PARAMS: Partial<Record<string, CliOperationParamSpec[]>> = {
  'doc.find': [
    {
      name: 'type',
      kind: 'flag',
      type: 'string',
      description: "Selector type: 'text' for text search or 'node' for node type search.",
    },
    {
      name: 'nodeType',
      kind: 'flag',
      flag: 'node-type',
      type: 'string',
      description: 'Node type to match (paragraph, heading, table, listItem, etc.).',
    },
    { name: 'kind', kind: 'flag', type: 'string', description: "Filter: 'block' or 'inline'." },
    { name: 'pattern', kind: 'flag', type: 'string', description: 'Text or regex pattern to match.' },
    { name: 'mode', kind: 'flag', type: 'string', description: "Match mode: 'contains' (substring) or 'regex'." },
    {
      name: 'caseSensitive',
      kind: 'flag',
      flag: 'case-sensitive',
      type: 'boolean',
      description: 'Case-sensitive matching. Default: false.',
    },
    {
      name: 'select',
      kind: 'jsonFlag',
      flag: 'select-json',
      type: 'json',
      description: "Search selector as JSON: {type:'text', pattern:'...'} or {type:'node', nodeType:'...'}.",
    },
    { name: 'query', kind: 'jsonFlag', flag: 'query-json', type: 'json', description: 'Query filter as JSON object.' },
  ],
  'doc.lists.list': [{ name: 'query', kind: 'jsonFlag', flag: 'query-json', type: 'json' }],
  'doc.getNode': [
    {
      name: 'address',
      kind: 'jsonFlag',
      flag: 'address-json',
      type: 'json',
      description: 'Node address to retrieve (block or inline address object).',
    },
  ],
  // Text-range operations: flat flags (--block-id, --start, --end) as shortcuts for --target-json
  'doc.insert': [
    ...TEXT_TARGET_FLAT_PARAMS,
    {
      name: 'offset',
      kind: 'flag',
      type: 'number',
      description: 'Character offset for insertion (alias for --start/--end with same value).',
    },
  ],
  'doc.replace': [...TEXT_TARGET_FLAT_PARAMS],
  'doc.delete': [...TEXT_TARGET_FLAT_PARAMS],
  'doc.styles.apply': [
    {
      name: 'target',
      kind: 'jsonFlag',
      flag: 'target-json',
      type: 'json',
      description: 'Text address or block address to apply styles to.',
    },
    {
      name: 'patch',
      kind: 'jsonFlag',
      flag: 'patch-json',
      type: 'json',
      description: 'Style patch object with run and/or paragraph properties to apply.',
    },
  ],
  'doc.comments.create': [...TEXT_TARGET_FLAT_PARAMS],
  'doc.comments.patch': [...TEXT_TARGET_FLAT_PARAMS],
  // List operations: flat flag (--node-id) as shortcut for --target-json, plus --input-json
  'doc.lists.insert': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
    ...LIST_TARGET_FLAT_PARAMS,
  ],
  'doc.lists.indent': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
    ...LIST_TARGET_FLAT_PARAMS,
  ],
  'doc.lists.outdent': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
    ...LIST_TARGET_FLAT_PARAMS,
  ],
  'doc.lists.create': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
  ],
  'doc.lists.attach': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
  ],
  'doc.lists.detach': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
    ...LIST_TARGET_FLAT_PARAMS,
  ],
  'doc.lists.join': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
  ],
  'doc.lists.canJoin': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
  ],
  'doc.lists.separate': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
    ...LIST_TARGET_FLAT_PARAMS,
  ],
  'doc.lists.setLevel': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
    ...LIST_TARGET_FLAT_PARAMS,
  ],
  'doc.lists.setValue': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
    ...LIST_TARGET_FLAT_PARAMS,
  ],
  'doc.lists.continuePrevious': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
    ...LIST_TARGET_FLAT_PARAMS,
  ],
  'doc.lists.canContinuePrevious': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
    ...LIST_TARGET_FLAT_PARAMS,
  ],
  'doc.lists.setLevelRestart': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
  ],
  'doc.lists.applyTemplate': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
  ],
  'doc.lists.applyPreset': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
  ],
  'doc.lists.captureTemplate': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
  ],
  'doc.lists.setLevelNumbering': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
  ],
  'doc.lists.setLevelBullet': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
  ],
  'doc.lists.setLevelPictureBullet': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
  ],
  'doc.lists.setLevelAlignment': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
  ],
  'doc.lists.setLevelIndents': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
  ],
  'doc.lists.setLevelTrailingCharacter': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
  ],
  'doc.lists.setLevelMarkerFont': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
  ],
  'doc.lists.clearLevelOverrides': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
  ],
  'doc.lists.convertToText': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Operation input as JSON object.',
    },
    ...LIST_TARGET_FLAT_PARAMS,
  ],
  'doc.blocks.list': [
    { name: 'offset', kind: 'flag', flag: 'offset', type: 'number' },
    { name: 'limit', kind: 'flag', flag: 'limit', type: 'number' },
    { name: 'nodeTypes', kind: 'jsonFlag', flag: 'node-types-json', type: 'json' },
  ],
  'doc.blocks.delete': [
    {
      name: 'nodeType',
      kind: 'flag',
      flag: 'node-type',
      type: 'string',
      description: 'Block type of the node to delete.',
    },
    { name: 'nodeId', kind: 'flag', flag: 'node-id', type: 'string', description: 'Node ID of the block to delete.' },
  ],
  'doc.blocks.deleteRange': [
    {
      name: 'start',
      kind: 'jsonFlag',
      flag: 'start-json',
      type: 'json',
      description: 'Block address of the first block in the range to delete.',
    },
    {
      name: 'end',
      kind: 'jsonFlag',
      flag: 'end-json',
      type: 'json',
      description: 'Block address of the last block in the range to delete.',
    },
  ],
  'doc.create.paragraph': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Full paragraph input as JSON (alternative to individual text/at params).',
    },
  ],
  'doc.create.heading': [
    {
      name: 'input',
      kind: 'jsonFlag',
      flag: 'input-json',
      type: 'json',
      description: 'Full heading input as JSON (alternative to individual text/level/at params).',
    },
  ],
};

for (const operationId of FORMAT_OPERATION_IDS) {
  EXTRA_CLI_PARAMS[`doc.${operationId}`] = [...TEXT_TARGET_FLAT_PARAMS];
}

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
    docRequirement: 'none',
    params: [
      { name: 'doc', kind: 'doc', type: 'string' },
      SESSION_PARAM,
      { name: 'collaboration', kind: 'jsonFlag', flag: 'collaboration-json', type: 'json' },
      { name: 'collabDocumentId', kind: 'flag', flag: 'collab-document-id', type: 'string' },
      { name: 'collabUrl', kind: 'flag', flag: 'collab-url', type: 'string' },
      { name: 'contentOverride', kind: 'flag', flag: 'content-override', type: 'string' },
      { name: 'overrideType', kind: 'flag', flag: 'override-type', type: 'string' },
      { name: 'onMissing', kind: 'flag', flag: 'on-missing', type: 'string' },
      { name: 'bootstrapSettlingMs', kind: 'flag', flag: 'bootstrap-settling-ms', type: 'number' },
      USER_NAME_PARAM,
      USER_EMAIL_PARAM,
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

    for (const envelopeParam of envelope) {
      seenNames.add(envelopeParam.name);
      mergedParams.push(envelopeParam);
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

// Legacy flag aliases — accepted by the parser but not in the canonical schema.
// The pre-validation normalizer in operation-executor.ts maps aliased values
// to their canonical names before schema validation.
const OPTION_FLAG_ALIASES: Partial<Record<string, Record<string, string[]>>> = {
  // SD-2132: tables.split renamed atRowIndex → rowIndex.
  'doc.tables.split': { 'row-index': ['at-row-index'] },
};

function deriveOptionSpecs(operationId: string, params: readonly CliOperationParamSpec[]): CliOperationOptionSpec[] {
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

  const aliases = OPTION_FLAG_ALIASES[operationId];
  if (aliases) {
    for (const spec of specs) {
      if (aliases[spec.name]) {
        spec.aliases = aliases[spec.name];
      }
    }
  }

  return specs;
}

export const CLI_OPERATION_OPTION_SPECS: Record<CliOperationId, CliOperationOptionSpec[]> = Object.fromEntries(
  CLI_OPERATION_IDS.map((operationId) => [
    operationId,
    deriveOptionSpecs(operationId, CLI_OPERATION_METADATA[operationId].params),
  ]),
) as Record<CliOperationId, CliOperationOptionSpec[]>;

// Exposed for unit testing $ref resolution only
export const _testExports = { jsonSchemaToTypeSpec, deriveParamsFromInputSchema } as const;
