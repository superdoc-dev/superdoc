import { readFile } from 'node:fs/promises';
import { posix as pathPosix } from 'node:path';
import type { ContractOperationSnapshot } from './contract-snapshot.js';
import { buildContractSnapshot } from './contract-snapshot.js';
import {
  resolveWorkspacePath,
  stableStringify,
  type GeneratedCheckIssue,
  type GeneratedFile,
} from './generation-utils.js';
import {
  OPERATION_DESCRIPTION_MAP,
  OPERATION_EXPECTED_RESULT_MAP,
  OPERATION_REFERENCE_DOC_PATH_MAP,
  PUBLIC_STEP_OP_CATALOG,
  REFERENCE_OPERATION_ALIASES,
  REFERENCE_OPERATION_GROUPS,
  type ReferenceAliasDefinition,
  type ReferenceOperationGroupDefinition,
} from '../../src/index.js';

const GENERATED_MARKER = '{/* GENERATED FILE: DO NOT EDIT. Regenerate via `pnpm run docapi:sync`. */}';
const OUTPUT_ROOT = 'apps/docs/document-api/reference';
const REFERENCE_INDEX_PATH = `${OUTPUT_ROOT}/index.mdx`;
const OVERVIEW_PATH = 'apps/docs/document-api/available-operations.mdx';
const OVERVIEW_OPERATIONS_START = '{/* DOC_API_OPERATIONS_START */}';
const OVERVIEW_OPERATIONS_END = '{/* DOC_API_OPERATIONS_END */}';

interface OperationGroup {
  definition: ReferenceOperationGroupDefinition;
  pagePath: string;
  operations: ContractOperationSnapshot[];
  aliases: Array<{
    definition: ReferenceAliasDefinition;
    canonicalOperation: ContractOperationSnapshot;
  }>;
}

function formatMemberPath(memberPath: string): string {
  return `editor.doc.${memberPath}${memberPath === 'capabilities' ? '()' : '(...)'}`;
}

function toOperationDocPath(operationId: ContractOperationSnapshot['operationId']): string {
  return `${OUTPUT_ROOT}/${OPERATION_REFERENCE_DOC_PATH_MAP[operationId]}`;
}

function toGroupPath(group: ReferenceOperationGroupDefinition): string {
  return `${OUTPUT_ROOT}/${group.pagePath}`;
}

function toRelativeDocHref(fromPath: string, toPath: string): string {
  const fromDir = pathPosix.dirname(fromPath);
  const relativePath = pathPosix.relative(fromDir, toPath).replace(/\.mdx$/u, '');
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

function toPublicDocHref(path: string): string {
  return `/${path.replace(/^apps\/docs\//u, '').replace(/\.mdx$/u, '')}`;
}

/**
 * Quote a string for safe use as a YAML frontmatter value.
 * Wraps in double quotes when the value contains characters that would
 * break unquoted YAML scalars (colons, hash signs, brackets, etc.).
 */
function yamlQuote(value: string): string {
  if (/[:#\[\]{}&*!|>'"%@`]/u.test(value)) {
    return `"${value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`;
  }
  return value;
}

/**
 * Escape MDX expression delimiters in plain prose so generated docs don't
 * evaluate `{ ... }` fragments as JavaScript at runtime.
 */
function escapeMdxText(value: string): string {
  return value.replace(/[{}]/gu, '\\$&');
}

function renderList(values: readonly string[]): string {
  if (values.length === 0) return '- None';
  return values.map((value) => `- \`${value}\``).join('\n');
}

function renderNoWrapCode(value: string): string {
  return `<span style={{ whiteSpace: 'nowrap', wordBreak: 'normal', overflowWrap: 'normal' }}><code>${value}</code></span>`;
}

function renderNoWrapLinkCode(label: string, href: string): string {
  return `<span style={{ whiteSpace: 'nowrap', wordBreak: 'normal', overflowWrap: 'normal' }}><a href="${href}"><code>${label}</code></a></span>`;
}

const STEP_DOMAIN_ORDER = ['assert', 'text', 'format', 'create', 'tables'] as const;
const STEP_DOMAIN_LABELS: Record<(typeof STEP_DOMAIN_ORDER)[number], string> = {
  assert: 'Assert',
  text: 'Text',
  format: 'Format',
  create: 'Create',
  tables: 'Tables',
};

function renderStepReferenceCell(referenceOperationId?: ContractOperationSnapshot['operationId']): string {
  if (!referenceOperationId) return '—';
  const operationPath = toOperationDocPath(referenceOperationId);
  return renderNoWrapLinkCode(referenceOperationId, toPublicDocHref(operationPath));
}

function renderStepOpsSection(operation: ContractOperationSnapshot): string {
  if (operation.operationId !== 'mutations.apply' && operation.operationId !== 'mutations.preview') {
    return '';
  }

  const domainSections = STEP_DOMAIN_ORDER.map((domain) => {
    const entries = PUBLIC_STEP_OP_CATALOG.filter((entry) => entry.domain === domain);
    if (entries.length === 0) return '';

    const rows = entries
      .map(
        (entry) =>
          `| ${renderNoWrapCode(entry.opId)} | ${escapeCell(entry.description)} | ${renderStepReferenceCell(entry.referenceOperationId)} |`,
      )
      .join('\n');

    return `### ${STEP_DOMAIN_LABELS[domain]}

| Step op (\`steps[].op\`) | Description | Related API operation |
| --- | --- | --- |
${rows}`;
  })
    .filter(Boolean)
    .join('\n\n');

  return `## Supported step operations

Use these values in \`steps[].op\` when authoring mutation plans.

${domainSections}

The runtime capability snapshot also exposes this allowlist at \`planEngine.supportedStepOps\`.`;
}

// ---------------------------------------------------------------------------
// $ref resolution
// ---------------------------------------------------------------------------

type JsonSchema = Record<string, unknown>;
type Defs = Record<string, JsonSchema> | undefined;

/**
 * If `schema` is a `{ $ref: '#/$defs/Foo' }` pointer, resolve it against the
 * supplied `$defs` map. Returns the dereferenced schema and the definition
 * name. Non-ref schemas are returned as-is with `refName` undefined.
 */
function resolveRef(schema: JsonSchema, $defs: Defs): { resolved: JsonSchema; refName?: string } {
  const $ref = schema.$ref;
  if (typeof $ref === 'string' && $defs) {
    const match = /^#\/\$defs\/(.+)$/u.exec($ref);
    if (match) {
      const name = match[1];
      const target = $defs[name];
      if (target) return { resolved: target, refName: name };
    }
  }
  return { resolved: schema };
}

/**
 * Extract the `$defs` reference name from a schema without resolving it.
 * Returns `undefined` if the schema is not a simple `$ref`.
 */
function refName(schema: JsonSchema): string | undefined {
  const $ref = schema.$ref;
  if (typeof $ref !== 'string') return undefined;
  const match = /^#\/\$defs\/(.+)$/u.exec($ref);
  return match ? match[1] : undefined;
}

// ---------------------------------------------------------------------------
// Field table rendering
// ---------------------------------------------------------------------------

interface FieldRow {
  field: string;
  type: string;
  required: boolean;
  description: string;
}

interface FieldSection {
  title?: string;
  rows: FieldRow[];
}

/**
 * Try to derive a short discriminator label from an inline object schema.
 * Looks for a `const` property that acts as a type discriminator (e.g., `type: "text"`).
 */
function objectDiscriminatorLabel(schema: JsonSchema): string | undefined {
  if (schema.type !== 'object' || !schema.properties) return undefined;
  const properties = schema.properties as Record<string, JsonSchema>;
  for (const [key, prop] of Object.entries(properties)) {
    if (prop.const !== undefined && typeof prop.const === 'string') {
      return `${key}=${JSON.stringify(prop.const)}`;
    }
  }
  return undefined;
}

/** Derive a human-readable type label from a JSON Schema node. */
function schemaTypeLabel(schema: JsonSchema, $defs: Defs): string {
  // $ref — show the def name
  const rn = refName(schema);
  if (rn) return rn;

  // const
  if (schema.const !== undefined) return `\`${JSON.stringify(schema.const)}\``;

  // enum
  if (Array.isArray(schema.enum)) {
    return `enum`;
  }

  // allOf — flatten and derive type from merged schema
  if (Array.isArray(schema.allOf)) {
    const flat = flattenAllOf(schema, $defs);
    return schemaTypeLabel(flat, $defs);
  }

  // oneOf / anyOf
  for (const keyword of ['oneOf', 'anyOf'] as const) {
    const variants = schema[keyword];
    if (Array.isArray(variants)) {
      const labels = (variants as JsonSchema[]).map((v) => {
        const base = schemaTypeLabel(v, $defs);
        if (base === 'object') {
          const resolved = resolveRef(v, $defs).resolved;
          const disc = objectDiscriminatorLabel(resolved);
          if (disc) return `object(${disc})`;
        }
        return base;
      });
      return labels.join(' \\| ');
    }
  }

  // array
  if (schema.type === 'array') {
    const items = schema.items as JsonSchema | undefined;
    if (items) {
      const itemLabel = schemaTypeLabel(items, $defs);
      return `${itemLabel}[]`;
    }
    return 'array';
  }

  // object with properties — try discriminator
  if (schema.type === 'object' && schema.properties) {
    const disc = objectDiscriminatorLabel(schema);
    if (disc) return `object(${disc})`;
    return 'object';
  }

  // primitive
  if (typeof schema.type === 'string') return schema.type as string;

  return 'any';
}

/** Derive a description string from a JSON Schema node. */
function schemaDescription(schema: JsonSchema, $defs: Defs): string {
  const rn = refName(schema);
  if (rn) return rn;

  if (schema.const !== undefined) return `Constant: \`${JSON.stringify(schema.const)}\``;

  if (Array.isArray(schema.enum)) {
    return (schema.enum as unknown[]).map((v) => `\`${JSON.stringify(v)}\``).join(', ');
  }

  if (Array.isArray(schema.allOf)) {
    const flat = flattenAllOf(schema, $defs);
    return schemaDescription(flat, $defs);
  }

  for (const keyword of ['oneOf', 'anyOf'] as const) {
    const variants = schema[keyword];
    if (Array.isArray(variants)) {
      const labels = (variants as JsonSchema[]).map((v) => schemaTypeLabel(v, $defs));
      return `One of: ${labels.join(', ')}`;
    }
  }

  return '';
}

/**
 * Collect all nested `const` discriminator values for a schema.
 */
function collectConstDiscriminators(
  schema: JsonSchema,
  $defs: Defs,
  prefix = '',
  depth = 0,
): Array<{ path: string; value: unknown }> {
  if (depth > 6) return [];

  const { resolved } = resolveRef(schema, $defs);
  const properties = resolved.properties as Record<string, JsonSchema> | undefined;
  if (resolved.const !== undefined && prefix) {
    return [{ path: prefix.replace(/\.$/u, ''), value: resolved.const }];
  }
  if (!properties || resolved.type !== 'object') return [];

  const discriminators: Array<{ path: string; value: unknown }> = [];
  for (const key of Object.keys(properties)) {
    discriminators.push(...collectConstDiscriminators(properties[key], $defs, `${prefix}${key}.`, depth + 1));
  }
  return discriminators;
}

function hasTopLevelUnion(schema: JsonSchema): boolean {
  return (
    (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) || (Array.isArray(schema.anyOf) && schema.anyOf.length > 0)
  );
}

function preferredDiscriminator(
  discriminators: Array<{ path: string; value: unknown }>,
): { path: string; value: unknown } | undefined {
  if (discriminators.length === 0) return undefined;

  const priorities = [/^success$/u, /(^|\.)(type|kind|mode|channel)$/u];
  for (const pattern of priorities) {
    const match = discriminators.find((entry) => pattern.test(entry.path));
    if (match) return match;
  }

  return discriminators[0];
}

function combineVariantTitles(parentTitle: string, childTitle?: string): string {
  if (!childTitle) return parentTitle;

  const parentMatch = /^Variant (\d+)(.*)$/u.exec(parentTitle);
  const childMatch = /^Variant (\d+)(.*)$/u.exec(childTitle);
  if (parentMatch && childMatch) {
    return `Variant ${parentMatch[1]}.${childMatch[1]}${childMatch[2]}`;
  }

  return `${parentTitle} / ${childTitle}`;
}

/**
 * If `schema` contains an `allOf` array, merge all members' properties and
 * required fields into a single flat object schema. Recursively resolves
 * `$ref` pointers inside each member. Returns the original schema unchanged
 * when no `allOf` is present.
 */
function flattenAllOf(schema: JsonSchema, $defs: Defs): JsonSchema {
  const allOf = schema.allOf;
  if (!Array.isArray(allOf) || allOf.length === 0) return schema;

  const mergedProperties: Record<string, JsonSchema> = {};
  const mergedRequired = new Set<string>();

  for (const member of allOf as JsonSchema[]) {
    const { resolved } = resolveRef(member, $defs);
    // Recursively flatten nested allOf
    const flat = flattenAllOf(resolved, $defs);

    if (flat.properties && typeof flat.properties === 'object') {
      Object.assign(mergedProperties, flat.properties);
    }
    if (Array.isArray(flat.required)) {
      for (const r of flat.required as string[]) mergedRequired.add(r);
    }

    // For oneOf/anyOf TargetLocator-style schemas, extract properties from
    // each variant so they appear in the merged field table.
    for (const keyword of ['oneOf', 'anyOf'] as const) {
      const variants = flat[keyword];
      if (!Array.isArray(variants)) continue;
      for (const variant of variants as JsonSchema[]) {
        const { resolved: varResolved } = resolveRef(variant, $defs);
        if (varResolved.properties && typeof varResolved.properties === 'object') {
          // Only merge the properties — requirement is optional since
          // these are union alternatives, not all simultaneously required.
          Object.assign(mergedProperties, varResolved.properties);
        }
      }
    }
  }

  // Preserve any top-level non-allOf keys (e.g. type, description)
  const result: JsonSchema = { ...schema, type: 'object', properties: mergedProperties };
  delete result.allOf;
  if (mergedRequired.size > 0) {
    result.required = [...mergedRequired];
  }
  return result;
}

/**
 * Build field table rows from an object schema's properties.
 * Recursively flattens nested objects into dot-path rows.
 */
function buildFieldRows(schema: JsonSchema, $defs: Defs, prefix = '', parentRequired = true, depth = 0): FieldRow[] {
  if (depth > 8) return [];

  const { resolved } = resolveRef(schema, $defs);
  const flat = flattenAllOf(resolved, $defs);
  const properties = flat.properties as Record<string, JsonSchema> | undefined;
  if (!properties || flat.type !== 'object') return [];

  const requiredSet = new Set<string>(Array.isArray(flat.required) ? (flat.required as string[]) : []);
  const rows: FieldRow[] = [];

  for (const field of Object.keys(properties).sort()) {
    const prop = properties[field];
    const fieldPath = prefix ? `${prefix}.${field}` : field;
    const fieldRequired = parentRequired && requiredSet.has(field);

    rows.push({
      field: fieldPath,
      type: schemaTypeLabel(prop, $defs),
      required: fieldRequired,
      description: schemaDescription(prop, $defs),
    });

    rows.push(...buildFieldRows(prop, $defs, fieldPath, fieldRequired, depth + 1));
  }

  return rows;
}

/** Build field sections, splitting top-level oneOf/anyOf schemas into explicit variants. */
function buildFieldSections(schema: JsonSchema, $defs: Defs): FieldSection[] {
  const { resolved } = resolveRef(schema, $defs);
  // Flatten allOf first — the merged schema may itself contain oneOf/anyOf.
  const flat = flattenAllOf(resolved, $defs);

  for (const keyword of ['oneOf', 'anyOf'] as const) {
    const variants = flat[keyword];
    if (!Array.isArray(variants) || variants.length === 0) continue;

    return variants.flatMap((variant, index) => {
      const variantSchema = flattenAllOf(resolveRef(variant as JsonSchema, $defs).resolved, $defs);
      const discriminators = collectConstDiscriminators(variantSchema, $defs);
      const preferred = preferredDiscriminator(discriminators);
      const label = preferred
        ? `Variant ${index + 1} (${preferred.path}=${JSON.stringify(preferred.value)})`
        : `Variant ${index + 1}`;
      const rows = buildFieldRows(variantSchema, $defs);
      if (rows.length === 0 && hasTopLevelUnion(variantSchema)) {
        return buildFieldSections(variantSchema, $defs).map((section) => ({
          title: combineVariantTitles(label, section.title),
          rows: section.rows,
        }));
      }

      return {
        title: label,
        rows,
      };
    });
  }

  return [{ rows: buildFieldRows(flat, $defs) }];
}

/** Escape pipe characters inside markdown table cells. */
function escapeCell(value: string): string {
  return value.replace(/\|/gu, '\\|');
}

function renderFieldTable(rows: FieldRow[]): string {
  if (rows.length === 0) return '_No fields._';

  const header = '| Field | Type | Required | Description |\n| --- | --- | --- | --- |';
  const body = rows
    .map(
      (row) =>
        `| \`${row.field}\` | ${escapeCell(row.type)} | ${row.required ? 'yes' : 'no'} | ${escapeCell(row.description)} |`,
    )
    .join('\n');

  return `${header}\n${body}`;
}

function renderFieldSections(schema: JsonSchema, $defs: Defs): string {
  const sections = buildFieldSections(schema, $defs);
  if (sections.length === 1) {
    return renderFieldTable(sections[0].rows);
  }

  return sections.map((section) => `### ${section.title}\n\n${renderFieldTable(section.rows)}`).join('\n\n');
}

// ---------------------------------------------------------------------------
// Example payload generation
// ---------------------------------------------------------------------------

/** Deterministic example value map keyed by field name substring. */
const STRING_EXAMPLES: Record<string, string> = {
  blockId: 'block-abc123',
  nodeId: 'node-def456',
  entityId: 'entity-789',
  pattern: 'hello world',
  text: 'Hello, world.',
  ref: 'handle:abc123',
  kind: 'example',
  evaluatedRevision: 'rev-001',
  snippet: '...the quick brown fox...',
  styleId: 'style-001',
  type: 'example',
  id: 'id-001',
  commentId: 'comment-001',
  parentCommentId: 'comment-000',
  author: 'Jane Doe',
  authorEmail: 'jane@example.com',
  authorImage: 'https://example.com/avatar.png',
  date: '2025-01-15T10:00:00Z',
  excerpt: 'Sample excerpt...',
  message: 'Operation failed.',
  label: 'Paragraph 1',
  marker: '1.',
  nodeType: 'paragraph',
  importedId: 'imp-001',
  creatorName: 'Jane Doe',
  creatorEmail: 'jane@example.com',
  expectedRevision: 'rev-001',
  mode: 'strict',
  decision: 'accept',
  scope: 'all',
  code: 'INVALID_TARGET',
};

const INTEGER_EXAMPLES: Record<string, number> = {
  start: 0,
  from: 0,
  end: 10,
  to: 10,
  limit: 50,
  offset: 0,
  returned: 1,
  total: 1,
  level: 1,
  ordinal: 1,
  words: 250,
  paragraphs: 12,
  headings: 3,
  tables: 1,
  images: 2,
  comments: 0,
  listLevel: 0,
};

function applyNumericBounds(value: number, schema: JsonSchema, type: 'integer' | 'number'): number {
  let bounded = value;

  const minimum = typeof schema.minimum === 'number' ? schema.minimum : undefined;
  const maximum = typeof schema.maximum === 'number' ? schema.maximum : undefined;
  const exclusiveMinimum = typeof schema.exclusiveMinimum === 'number' ? schema.exclusiveMinimum : undefined;
  const exclusiveMaximum = typeof schema.exclusiveMaximum === 'number' ? schema.exclusiveMaximum : undefined;

  if (minimum !== undefined && bounded < minimum) bounded = minimum;
  if (exclusiveMinimum !== undefined && bounded <= exclusiveMinimum) {
    bounded = type === 'integer' ? Math.floor(exclusiveMinimum) + 1 : exclusiveMinimum + 0.1;
  }

  if (maximum !== undefined && bounded > maximum) bounded = maximum;
  if (exclusiveMaximum !== undefined && bounded >= exclusiveMaximum) {
    bounded = type === 'integer' ? Math.ceil(exclusiveMaximum) - 1 : exclusiveMaximum - 0.1;
  }

  if (!Number.isFinite(bounded)) return type === 'integer' ? 1 : 12.5;
  return type === 'integer' ? Math.trunc(bounded) : bounded;
}

/**
 * Generate a deterministic example value from a JSON Schema node.
 * `fieldName` is used to pick contextual string/integer values.
 */
function generateExample(schema: JsonSchema, $defs: Defs, fieldName?: string, depth = 0): unknown {
  if (depth > 10) return {};

  // const value
  if (schema.const !== undefined) return schema.const;

  // enum — first value
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];

  // $ref — resolve and recurse
  const rn = refName(schema);
  if (rn) {
    const { resolved } = resolveRef(schema, $defs);
    return generateExample(resolved, $defs, fieldName, depth);
  }

  // array — single item
  if (schema.type === 'array') {
    const items = schema.items as JsonSchema | undefined;
    if (schema.maxItems === 0) return [];
    if (items) return [generateExample(items, $defs, undefined, depth + 1)];
    return [];
  }

  // object — recurse into properties
  if (schema.type === 'object' && schema.properties) {
    const properties = schema.properties as Record<string, JsonSchema>;
    const requiredSet = new Set<string>(Array.isArray(schema.required) ? (schema.required as string[]) : []);
    for (const keyword of ['oneOf', 'anyOf'] as const) {
      const variants = schema[keyword];
      if (!Array.isArray(variants) || variants.length === 0) continue;
      const firstVariant = variants[0] as JsonSchema;
      if (Array.isArray(firstVariant.required)) {
        for (const requiredField of firstVariant.required as string[]) {
          requiredSet.add(requiredField);
        }
      }
      break;
    }

    const result: Record<string, unknown> = {};
    const keys = Object.keys(properties);
    // Include required properties + up to 2 optional
    let optionalCount = 0;
    for (const key of keys) {
      if (requiredSet.has(key)) {
        result[key] = generateExample(properties[key], $defs, key, depth + 1);
      } else if (optionalCount < 2) {
        result[key] = generateExample(properties[key], $defs, key, depth + 1);
        optionalCount++;
      }
    }
    return result;
  }

  // allOf — generate per-member and merge. This preserves oneOf/anyOf
  // variant selection (first-variant-only) instead of flattening all
  // variant properties into a single object.
  if (Array.isArray(schema.allOf)) {
    const merged: Record<string, unknown> = {};
    for (const member of schema.allOf as JsonSchema[]) {
      const { resolved } = resolveRef(member, $defs);
      const memberExample = generateExample(resolved, $defs, fieldName, depth + 1);
      if (typeof memberExample === 'object' && memberExample !== null && !Array.isArray(memberExample)) {
        Object.assign(merged, memberExample as Record<string, unknown>);
      }
    }
    return merged;
  }

  // oneOf / anyOf — first variant (non-object union fallback)
  for (const keyword of ['oneOf', 'anyOf'] as const) {
    const variants = schema[keyword];
    if (Array.isArray(variants) && variants.length > 0) {
      return generateExample(variants[0] as JsonSchema, $defs, fieldName, depth);
    }
  }

  // primitives
  if (schema.type === 'string') {
    if (fieldName && STRING_EXAMPLES[fieldName] !== undefined) return STRING_EXAMPLES[fieldName];
    return 'example';
  }
  if (schema.type === 'integer') {
    const base = fieldName && INTEGER_EXAMPLES[fieldName] !== undefined ? INTEGER_EXAMPLES[fieldName] : 1;
    return applyNumericBounds(base, schema, 'integer');
  }
  if (schema.type === 'number') {
    const base = fieldName && INTEGER_EXAMPLES[fieldName] !== undefined ? INTEGER_EXAMPLES[fieldName] : 12.5;
    return applyNumericBounds(base, schema, 'number');
  }
  if (schema.type === 'boolean') return true;

  return {};
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildCapabilitiesOutputExample(snapshot: ReturnType<typeof buildContractSnapshot>): unknown {
  const operation = snapshot.operations.find((entry) => entry.operationId === 'capabilities.get');
  if (!operation) return {};

  const generic = generateExample(operation.schemas.output, snapshot.$defs);
  if (!isObjectRecord(generic)) return generic;

  return {
    ...generic,
    global: {
      trackChanges: { enabled: true },
      comments: { enabled: true },
      lists: { enabled: true },
      dryRun: { enabled: true },
      history: { enabled: true },
    },
    operations: Object.fromEntries(
      snapshot.operations.map((entry) => [
        entry.operationId,
        {
          available: true,
          tracked: entry.metadata.supportsTrackedMode,
          dryRun: entry.metadata.supportsDryRun,
        },
      ]),
    ),
  };
}

function getOperationExamples(
  operation: ContractOperationSnapshot,
  snapshot: ReturnType<typeof buildContractSnapshot>,
): { input: unknown; output: unknown } {
  const inputOverrides: Partial<Record<ContractOperationSnapshot['operationId'], unknown>> = {
    insert: {
      target: {
        kind: 'block',
        nodeId: 'node-def456',
        nodeType: 'paragraph',
      },
      content: {
        type: 'paragraph',
        content: [{ type: 'text', text: 'example' }],
      },
      placement: 'after',
    },
    replace: {
      target: {
        kind: 'selection',
        start: {
          kind: 'text',
          blockId: 'block-abc123',
          offset: 0,
        },
        end: {
          kind: 'text',
          blockId: 'block-abc123',
          offset: 12,
        },
      },
      text: 'Hello, world.',
    },
  };

  const outputOverrides: Partial<Record<ContractOperationSnapshot['operationId'], unknown>> = {
    'capabilities.get': buildCapabilitiesOutputExample(snapshot),
    insert: {
      success: true,
      evaluatedRevision: {
        before: 'rev-001',
        after: 'rev-002',
      },
      resolution: {
        target: {
          kind: 'block',
          nodeId: 'node-def456',
          nodeType: 'paragraph',
        },
        range: {
          from: 42,
          to: 42,
        },
      },
    },
    replace: {
      success: true,
      evaluatedRevision: {
        before: 'rev-001',
        after: 'rev-002',
      },
      resolution: {
        target: {
          kind: 'text',
          blockId: 'block-abc123',
          range: {
            start: 0,
            end: 12,
          },
        },
        range: {
          from: 0,
          to: 12,
        },
      },
    },
  };

  return {
    input: inputOverrides[operation.operationId] ?? generateExample(operation.schemas.input, snapshot.$defs),
    output: outputOverrides[operation.operationId] ?? generateExample(operation.schemas.output, snapshot.$defs),
  };
}

// ---------------------------------------------------------------------------
// Collapsible raw schema rendering
// ---------------------------------------------------------------------------

function renderAccordionSchema(title: string, schema: JsonSchema): string {
  return `<Accordion title="${title}">
\`\`\`json
${stableStringify(schema)}
\`\`\`
</Accordion>`;
}

// ---------------------------------------------------------------------------
// Operation page composition
// ---------------------------------------------------------------------------

function buildOperationGroups(operations: ContractOperationSnapshot[]): OperationGroup[] {
  const operationById = new Map(operations.map((operation) => [operation.operationId, operation] as const));

  return REFERENCE_OPERATION_GROUPS.map((definition) => {
    const groupedOperations = definition.operations.map((operationId) => {
      const operation = operationById.get(operationId);
      if (!operation) {
        throw new Error(`Missing operation snapshot for "${operationId}" in reference docs generation.`);
      }
      return operation;
    });

    const groupedAliases = REFERENCE_OPERATION_ALIASES.filter((alias) => alias.referenceGroup === definition.key).map(
      (alias) => {
        const canonicalOperation = operationById.get(alias.canonicalOperationId);
        if (!canonicalOperation) {
          throw new Error(
            `Missing canonical operation snapshot for alias "${alias.memberPath}" -> "${alias.canonicalOperationId}".`,
          );
        }
        return { definition: alias, canonicalOperation };
      },
    );

    return {
      definition,
      pagePath: toGroupPath(definition),
      operations: groupedOperations,
      aliases: groupedAliases,
    };
  });
}

function renderOperationPage(
  operation: ContractOperationSnapshot,
  snapshot: ReturnType<typeof buildContractSnapshot>,
): string {
  const $defs = snapshot.$defs;
  const title = operation.operationId;
  const metadata = operation.metadata;
  const description = OPERATION_DESCRIPTION_MAP[operation.operationId];
  const escapedDescription = escapeMdxText(description);
  const expectedResult = OPERATION_EXPECTED_RESULT_MAP[operation.operationId];
  const escapedExpectedResult = escapeMdxText(expectedResult);

  const inputFields = renderFieldSections(operation.schemas.input, $defs);
  const outputFields = renderFieldSections(operation.schemas.output, $defs);

  const { input: inputExample, output: outputExample } = getOperationExamples(operation, snapshot);
  const stepOpsSection = renderStepOpsSection(operation);
  const expectedResultSection = `${escapedExpectedResult}${stepOpsSection ? `\n\n${stepOpsSection}` : ''}`;

  // -- Build raw-schema accordion blocks --
  const rawSchemaBlocks: string[] = [];
  rawSchemaBlocks.push(renderAccordionSchema('Raw input schema', operation.schemas.input));
  rawSchemaBlocks.push(renderAccordionSchema('Raw output schema', operation.schemas.output));
  if (operation.schemas.success) {
    rawSchemaBlocks.push(renderAccordionSchema('Raw success schema', operation.schemas.success));
  }
  if (operation.schemas.failure) {
    rawSchemaBlocks.push(renderAccordionSchema('Raw failure schema', operation.schemas.failure));
  }

  return `---
title: ${title}
sidebarTitle: ${title}
description: ${yamlQuote(description)}
---

${GENERATED_MARKER}

> Alpha: Document API is currently alpha and subject to breaking changes.

## Summary

${escapedDescription}

- Operation ID: \`${operation.operationId}\`
- API member path: \`${formatMemberPath(operation.memberPath)}\`
- Mutates document: \`${metadata.mutates ? 'yes' : 'no'}\`
- Idempotency: \`${metadata.idempotency}\`
- Supports tracked mode: \`${metadata.supportsTrackedMode ? 'yes' : 'no'}\`
- Supports dry run: \`${metadata.supportsDryRun ? 'yes' : 'no'}\`
- Deterministic target resolution: \`${metadata.deterministicTargetResolution ? 'yes' : 'no'}\`

## Expected result

${expectedResultSection}

## Input fields

${inputFields}

### Example request

\`\`\`json
${stableStringify(inputExample)}
\`\`\`

## Output fields

${outputFields}

### Example response

\`\`\`json
${stableStringify(outputExample)}
\`\`\`

## Pre-apply throws

${renderList(metadata.throws.preApply)}

## Non-applied failure codes

${renderList(metadata.possibleFailureCodes)}
${
  metadata.remediationHints && metadata.remediationHints.length > 0
    ? `
## Remediation hints

${renderList(metadata.remediationHints)}
`
    : ''
}
## Raw schemas

${rawSchemaBlocks.join('\n\n')}
`;
}

function renderGroupIndex(group: OperationGroup): string {
  const rows = group.operations
    .map((operation) => {
      const metadata = operation.metadata;
      const operationHref = toPublicDocHref(toOperationDocPath(operation.operationId));
      return `| ${renderNoWrapLinkCode(operation.operationId, operationHref)} | \`${operation.memberPath}\` | ${metadata.mutates ? 'Yes' : 'No'} | \`${metadata.idempotency}\` | ${metadata.supportsTrackedMode ? 'Yes' : 'No'} | ${metadata.supportsDryRun ? 'Yes' : 'No'} |`;
    })
    .join('\n');

  const aliasRows = group.aliases
    .map((alias) => {
      const canonicalLink = toPublicDocHref(toOperationDocPath(alias.canonicalOperation.operationId));
      return `| \`${formatMemberPath(alias.definition.memberPath)}\` | ${renderNoWrapLinkCode(alias.canonicalOperation.operationId, canonicalLink)} | ${alias.definition.description} |`;
    })
    .join('\n');

  return `---
title: ${group.definition.title} operations
sidebarTitle: ${group.definition.title}
description: ${group.definition.title} operation reference from the canonical Document API contract.
---

${GENERATED_MARKER}

> Alpha: Document API is currently alpha and subject to breaking changes.

[Back to full reference](${toRelativeDocHref(group.pagePath, REFERENCE_INDEX_PATH)})

${group.definition.description}

| Operation | Member path | Mutates | Idempotency | Tracked | Dry run |
| --- | --- | --- | --- | --- | --- |
${rows}
${
  group.aliases.length > 0
    ? `

## Convenience aliases

| Alias method | Canonical operation | Behavior |
| --- | --- | --- |
${aliasRows}
`
    : ''
}
`;
}

function renderReferenceIndex(groups: OperationGroup[]): string {
  const groupRows = groups
    .map((group) => {
      const canonicalCount = group.operations.length;
      const aliasCount = group.aliases.length;
      const totalCount = canonicalCount + aliasCount;
      return `| ${group.definition.title} | ${canonicalCount} | ${aliasCount} | ${totalCount} | [Open](${toPublicDocHref(group.pagePath)}) |`;
    })
    .join('\n');

  const availableOperationsSections = groups
    .map((group) => {
      const operationRows = group.operations
        .map((operation) => {
          const operationHref = toPublicDocHref(toOperationDocPath(operation.operationId));
          return `| ${renderNoWrapLinkCode(operation.operationId, operationHref)} | ${renderNoWrapCode(formatMemberPath(operation.memberPath))} | ${escapeCell(OPERATION_DESCRIPTION_MAP[operation.operationId] ?? '')} |`;
        })
        .join('\n');

      const aliasRows = group.aliases
        .map((alias) => {
          const canonicalLink = toPublicDocHref(toOperationDocPath(alias.canonicalOperation.operationId));
          return `| ${renderNoWrapLinkCode(alias.definition.memberPath, canonicalLink)} | ${renderNoWrapCode(formatMemberPath(alias.definition.memberPath))} | ${escapeCell(alias.definition.description)} |`;
        })
        .join('\n');

      const rows = [operationRows, aliasRows].filter(Boolean).join('\n');

      return `#### ${group.definition.title}

| Operation | API member path | Description |
| --- | --- | --- |
${rows}`;
    })
    .join('\n\n');

  return `---
title: Document API reference
sidebarTitle: Reference
description: Operation reference from the canonical Document API contract.
---

${GENERATED_MARKER}

This reference is sourced from \`packages/document-api/src/contract/*\`.
Document API is currently alpha and subject to breaking changes.

<style>{\`
  table th,
  table td {
    font-size: calc(1em - 2px);
  }
\`}</style>

## Browse by namespace

| Namespace | Canonical ops | Aliases | Total surface | Reference |
| --- | --- | --- | --- | --- |
${groupRows}

## Available operations

The tables below are grouped by namespace.

${availableOperationsSections}
`;
}

function renderOverviewApiSurfaceSection(groups: OperationGroup[]): string {
  const sortedGroups = [...groups].sort((a, b) => a.definition.title.localeCompare(b.definition.title));

  const namespaceRows = sortedGroups
    .map((group) => {
      const canonicalCount = group.operations.length;
      const aliasCount = group.aliases.length;
      const totalCount = canonicalCount + aliasCount;
      return `| ${group.definition.title} | ${canonicalCount} | ${aliasCount} | ${totalCount} | [Reference](${toPublicDocHref(group.pagePath)}) |`;
    })
    .join('\n');

  const operationRows = sortedGroups
    .flatMap((group) => {
      const canonicalRows = group.operations.map(
        (operation) =>
          `| ${renderNoWrapCode(formatMemberPath(operation.memberPath))} | [\`${operation.operationId}\`](${toPublicDocHref(toOperationDocPath(operation.operationId))}) |`,
      );

      const aliasRows = group.aliases.map((alias) => {
        const canonicalOperationId = alias.canonicalOperation.operationId;
        return `| ${renderNoWrapCode(formatMemberPath(alias.definition.memberPath))} | [\`${canonicalOperationId}\`](${toPublicDocHref(toOperationDocPath(canonicalOperationId))}) |`;
      });

      return [...canonicalRows, ...aliasRows];
    })
    .join('\n');

  return `${OVERVIEW_OPERATIONS_START}
### Available operations

Use the tables below to see what operations are available and where each one is documented.

| Namespace | Canonical ops | Aliases | Total surface | Reference |
| --- | --- | --- | --- | --- |
${namespaceRows}

| Editor method | Operation |
| --- | --- |
${operationRows}
${OVERVIEW_OPERATIONS_END}`;
}

function replaceOverviewSection(content: string, section: string): string {
  const startIndex = content.indexOf(OVERVIEW_OPERATIONS_START);
  const endIndex = content.indexOf(OVERVIEW_OPERATIONS_END);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(
      `overview marker block not found in ${OVERVIEW_PATH}. Expected ${OVERVIEW_OPERATIONS_START} ... ${OVERVIEW_OPERATIONS_END}.`,
    );
  }

  const endMarkerEndIndex = endIndex + OVERVIEW_OPERATIONS_END.length;
  return `${content.slice(0, startIndex)}${section}${content.slice(endMarkerEndIndex)}`;
}

export function applyGeneratedOverviewApiSurface(overviewContent: string): string {
  const snapshot = buildContractSnapshot();
  const groups = buildOperationGroups(snapshot.operations);
  const section = renderOverviewApiSurfaceSection(groups);
  return replaceOverviewSection(overviewContent, section);
}

export async function buildOverviewArtifact(): Promise<GeneratedFile> {
  const overviewPath = OVERVIEW_PATH;
  const currentOverview = await readFile(resolveWorkspacePath(overviewPath), 'utf8');
  const nextOverview = applyGeneratedOverviewApiSurface(currentOverview);
  return { path: overviewPath, content: nextOverview };
}

export function buildReferenceDocsArtifacts(): GeneratedFile[] {
  const snapshot = buildContractSnapshot();
  const groups = buildOperationGroups(snapshot.operations);

  const operationFiles = snapshot.operations.map((operation) => ({
    path: toOperationDocPath(operation.operationId),
    content: renderOperationPage(operation, snapshot),
  }));

  const groupFiles = groups.map((group) => ({
    path: group.pagePath,
    content: renderGroupIndex(group),
  }));

  const allFiles = [
    {
      path: REFERENCE_INDEX_PATH,
      content: renderReferenceIndex(groups),
    },
    ...groupFiles,
    ...operationFiles,
  ];

  const manifest = {
    generatedBy: 'packages/document-api/scripts/generate-reference-docs.ts',
    marker: GENERATED_MARKER,
    contractVersion: snapshot.contractVersion,
    sourceHash: snapshot.sourceHash,
    groups: groups.map((group) => ({
      key: group.definition.key,
      title: group.definition.title,
      pagePath: group.pagePath,
      operationIds: group.operations.map((operation) => operation.operationId),
      aliasMemberPaths: group.aliases.map((alias) => alias.definition.memberPath),
    })),
    files: allFiles.map((file) => file.path).sort(),
  };

  return [
    ...allFiles,
    {
      path: `${OUTPUT_ROOT}/_generated-manifest.json`,
      content: stableStringify(manifest),
    },
  ];
}

/**
 * Validate that YAML frontmatter values don't contain unquoted special characters.
 * Returns an array of field names with invalid values.
 */
function validateFrontmatter(content: string): string[] {
  const match = /^---\n([\s\S]*?)\n---/u.exec(content);
  if (!match) return [];

  const invalid: string[] = [];
  for (const line of match[1].split('\n')) {
    const kvMatch = /^(\w+):\s+(.+)$/u.exec(line);
    if (!kvMatch) continue;
    const [, key, value] = kvMatch;
    // Unquoted values containing colons break YAML parsing
    if (!value.startsWith('"') && !value.startsWith("'") && /:/u.test(value)) {
      invalid.push(key);
    }
  }
  return invalid;
}

/**
 * Checks that generated `.mdx` files contain the generated marker, have valid
 * YAML frontmatter, and that the overview doc's API-surface block is up to date.
 * Skips files already present in {@link existingIssuePaths} to avoid duplicate reports.
 */
export async function checkReferenceDocsExtras(files: GeneratedFile[], issues: GeneratedCheckIssue[]): Promise<void> {
  const existingIssuePaths = new Set(issues.map((issue) => issue.path));

  for (const file of files) {
    if (!file.path.endsWith('.mdx') || existingIssuePaths.has(file.path)) continue;
    const content = await readFile(resolveWorkspacePath(file.path), 'utf8').catch(() => null);
    if (content == null || !content.includes(GENERATED_MARKER)) {
      issues.push({ kind: 'content', path: file.path });
      continue;
    }
    const invalidFields = validateFrontmatter(content);
    if (invalidFields.length > 0) {
      issues.push({ kind: 'content', path: file.path });
    }
  }

  const overviewPath = OVERVIEW_PATH;
  if (existingIssuePaths.has(overviewPath)) return;

  const overviewContent = await readFile(resolveWorkspacePath(overviewPath), 'utf8').catch(() => null);
  if (overviewContent == null) {
    issues.push({ kind: 'missing', path: overviewPath });
  } else {
    try {
      const expectedOverview = applyGeneratedOverviewApiSurface(overviewContent);
      if (expectedOverview !== overviewContent) {
        issues.push({ kind: 'content', path: overviewPath });
      }
    } catch {
      issues.push({ kind: 'content', path: overviewPath });
    }
  }
}

export function getReferenceDocsOutputRoot(): string {
  return OUTPUT_ROOT;
}

export function getReferenceDocsGeneratedMarker(): string {
  return GENERATED_MARKER;
}

export function getOverviewDocsPath(): string {
  return OVERVIEW_PATH;
}

export function getOverviewApiSurfaceStartMarker(): string {
  return OVERVIEW_OPERATIONS_START;
}

export function getOverviewApiSurfaceEndMarker(): string {
  return OVERVIEW_OPERATIONS_END;
}
