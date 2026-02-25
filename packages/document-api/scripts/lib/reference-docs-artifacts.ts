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
  OPERATION_REFERENCE_DOC_PATH_MAP,
  REFERENCE_OPERATION_GROUPS,
  type ReferenceOperationGroupDefinition,
} from '../../src/index.js';

const GENERATED_MARKER = '{/* GENERATED FILE: DO NOT EDIT. Regenerate via `pnpm run docapi:sync`. */}';
const OUTPUT_ROOT = 'apps/docs/document-api/reference';
const REFERENCE_INDEX_PATH = `${OUTPUT_ROOT}/index.mdx`;
const OVERVIEW_PATH = 'apps/docs/document-api/overview.mdx';
const OVERVIEW_OPERATIONS_START = '{/* DOC_API_OPERATIONS_START */}';
const OVERVIEW_OPERATIONS_END = '{/* DOC_API_OPERATIONS_END */}';

interface OperationGroup {
  definition: ReferenceOperationGroupDefinition;
  pagePath: string;
  operations: ContractOperationSnapshot[];
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

function renderList(values: readonly string[]): string {
  if (values.length === 0) return '- None';
  return values.map((value) => `- \`${value}\``).join('\n');
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
 * Build field table rows from an object schema's properties.
 * Non-object schemas produce an empty array.
 */
function buildFieldRows(schema: JsonSchema, $defs: Defs): FieldRow[] {
  const { resolved } = resolveRef(schema, $defs);
  const properties = resolved.properties as Record<string, JsonSchema> | undefined;
  if (!properties) return [];

  const requiredSet = new Set<string>(Array.isArray(resolved.required) ? (resolved.required as string[]) : []);

  // Sort properties alphabetically for determinism
  return Object.keys(properties)
    .sort()
    .map((field) => {
      const prop = properties[field];
      return {
        field,
        type: schemaTypeLabel(prop, $defs),
        required: requiredSet.has(field),
        description: schemaDescription(prop, $defs),
      };
    });
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

  // oneOf / anyOf — first variant
  for (const keyword of ['oneOf', 'anyOf'] as const) {
    const variants = schema[keyword];
    if (Array.isArray(variants) && variants.length > 0) {
      return generateExample(variants[0] as JsonSchema, $defs, fieldName, depth);
    }
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

  // primitives
  if (schema.type === 'string') {
    if (fieldName && STRING_EXAMPLES[fieldName] !== undefined) return STRING_EXAMPLES[fieldName];
    return 'example';
  }
  if (schema.type === 'integer') {
    if (fieldName && INTEGER_EXAMPLES[fieldName] !== undefined) return INTEGER_EXAMPLES[fieldName];
    return 1;
  }
  if (schema.type === 'number') {
    if (fieldName && INTEGER_EXAMPLES[fieldName] !== undefined) return INTEGER_EXAMPLES[fieldName];
    return 12.5;
  }
  if (schema.type === 'boolean') return true;

  return {};
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

    return {
      definition,
      pagePath: toGroupPath(definition),
      operations: groupedOperations,
    };
  });
}

function renderOperationPage(operation: ContractOperationSnapshot, $defs: Defs): string {
  const title = operation.operationId;
  const metadata = operation.metadata;

  const inputRows = buildFieldRows(operation.schemas.input, $defs);
  const outputRows = buildFieldRows(operation.schemas.output, $defs);

  const inputExample = generateExample(operation.schemas.input, $defs);
  const outputExample = generateExample(operation.schemas.output, $defs);

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
description: Generated reference for ${title}
---

${GENERATED_MARKER}

> Alpha: Document API is currently alpha and subject to breaking changes.

## Summary

- Operation ID: \`${operation.operationId}\`
- API member path: \`${formatMemberPath(operation.memberPath)}\`
- Mutates document: \`${metadata.mutates ? 'yes' : 'no'}\`
- Idempotency: \`${metadata.idempotency}\`
- Supports tracked mode: \`${metadata.supportsTrackedMode ? 'yes' : 'no'}\`
- Supports dry run: \`${metadata.supportsDryRun ? 'yes' : 'no'}\`
- Deterministic target resolution: \`${metadata.deterministicTargetResolution ? 'yes' : 'no'}\`

## Input fields

${renderFieldTable(inputRows)}

### Example request

\`\`\`json
${stableStringify(inputExample)}
\`\`\`

## Output fields

${renderFieldTable(outputRows)}

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
      return `| [\`${operation.operationId}\`](${toRelativeDocHref(group.pagePath, toOperationDocPath(operation.operationId))}) | \`${operation.memberPath}\` | ${metadata.mutates ? 'Yes' : 'No'} | \`${metadata.idempotency}\` | ${metadata.supportsTrackedMode ? 'Yes' : 'No'} | ${metadata.supportsDryRun ? 'Yes' : 'No'} |`;
    })
    .join('\n');

  return `---
title: ${group.definition.title} operations
sidebarTitle: ${group.definition.title}
description: Generated ${group.definition.title} operation reference from the canonical Document API contract.
---

${GENERATED_MARKER}

> Alpha: Document API is currently alpha and subject to breaking changes.

[Back to full reference](${toRelativeDocHref(group.pagePath, REFERENCE_INDEX_PATH)})

${group.definition.description}

| Operation | Member path | Mutates | Idempotency | Tracked | Dry run |
| --- | --- | --- | --- | --- | --- |
${rows}
`;
}

function renderReferenceIndex(operations: ContractOperationSnapshot[], groups: OperationGroup[]): string {
  const groupRows = groups
    .map((group) => {
      return `| ${group.definition.title} | ${group.operations.length} | [Open](${toRelativeDocHref(REFERENCE_INDEX_PATH, group.pagePath)}) |`;
    })
    .join('\n');

  const operationGroupTitleById = new Map<ContractOperationSnapshot['operationId'], string>();
  for (const group of groups) {
    for (const operation of group.operations) {
      operationGroupTitleById.set(operation.operationId, group.definition.title);
    }
  }

  const operationRows = operations
    .map((operation) => {
      const metadata = operation.metadata;
      const groupTitle = operationGroupTitleById.get(operation.operationId) ?? 'Unknown';
      return `| [\`${operation.operationId}\`](${toRelativeDocHref(REFERENCE_INDEX_PATH, toOperationDocPath(operation.operationId))}) | ${groupTitle} | \`${operation.memberPath}\` | ${metadata.mutates ? 'Yes' : 'No'} | \`${metadata.idempotency}\` | ${metadata.supportsTrackedMode ? 'Yes' : 'No'} | ${metadata.supportsDryRun ? 'Yes' : 'No'} |`;
    })
    .join('\n');

  return `---
title: Document API reference
sidebarTitle: Reference
description: Generated operation reference from the canonical Document API contract.
---

${GENERATED_MARKER}

This reference is generated from \`packages/document-api/src/contract/*\`.
Document API is currently alpha and subject to breaking changes.

## Browse by namespace

| Namespace | Operations | Reference |
| --- | --- | --- |
${groupRows}

## All operations

| Operation | Namespace | Member path | Mutates | Idempotency | Tracked | Dry run |
| --- | --- | --- | --- | --- | --- | --- |
${operationRows}
`;
}

function renderOverviewApiSurfaceSection(operations: ContractOperationSnapshot[], groups: OperationGroup[]): string {
  const sortedGroups = [...groups].sort((a, b) => a.definition.title.localeCompare(b.definition.title));

  const namespaceRows = sortedGroups
    .map((group) => {
      return `| ${group.definition.title} | ${group.operations.length} | [Reference](${toPublicDocHref(group.pagePath)}) |`;
    })
    .join('\n');

  const operationRows = operations
    .map((operation) => {
      return `| \`${formatMemberPath(operation.memberPath)}\` | [\`${operation.operationId}\`](${toPublicDocHref(toOperationDocPath(operation.operationId))}) |`;
    })
    .join('\n');

  return `${OVERVIEW_OPERATIONS_START}
### Available operations

Use the tables below to see what operations are available and where each one is documented.

| Namespace | Operations | Reference |
| --- | --- | --- |
${namespaceRows}

| Editor method | Operation ID |
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
  const section = renderOverviewApiSurfaceSection(snapshot.operations, groups);
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
    content: renderOperationPage(operation, snapshot.$defs),
  }));

  const groupFiles = groups.map((group) => ({
    path: group.pagePath,
    content: renderGroupIndex(group),
  }));

  const allFiles = [
    {
      path: REFERENCE_INDEX_PATH,
      content: renderReferenceIndex(snapshot.operations, groups),
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
 * Checks that generated `.mdx` files contain the generated marker and that
 * the overview doc's API-surface block is up to date. Skips files already
 * present in {@link existingIssuePaths} to avoid duplicate reports.
 */
export async function checkReferenceDocsExtras(files: GeneratedFile[], issues: GeneratedCheckIssue[]): Promise<void> {
  const existingIssuePaths = new Set(issues.map((issue) => issue.path));

  for (const file of files) {
    if (!file.path.endsWith('.mdx') || existingIssuePaths.has(file.path)) continue;
    const content = await readFile(resolveWorkspacePath(file.path), 'utf8').catch(() => null);
    if (content == null || !content.includes(GENERATED_MARKER)) {
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
