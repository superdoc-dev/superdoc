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

function renderOperationPage(operation: ContractOperationSnapshot): string {
  const title = operation.operationId;
  const metadata = operation.metadata;

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

## Pre-apply throws

${renderList(metadata.throws.preApply)}

## Non-applied failure codes

${renderList(metadata.possibleFailureCodes)}

## Input schema

\`\`\`json
${stableStringify(operation.schemas.input)}
\`\`\`

## Output schema

\`\`\`json
${stableStringify(operation.schemas.output)}
\`\`\`
${
  operation.schemas.success
    ? `
## Success schema

\`\`\`json
${stableStringify(operation.schemas.success)}
\`\`\`
`
    : ''
}${
    operation.schemas.failure
      ? `
## Failure schema

\`\`\`json
${stableStringify(operation.schemas.failure)}
\`\`\`
`
      : ''
  }${
    metadata.remediationHints && metadata.remediationHints.length > 0
      ? `
## Remediation hints

${renderList(metadata.remediationHints)}
`
      : ''
  }`;
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
  const namespaceRows = groups
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
    content: renderOperationPage(operation),
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
