import { createHash } from 'node:crypto';
import { readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COMMAND_CATALOG,
  CONTRACT_VERSION,
  JSON_SCHEMA_DIALECT,
  OPERATION_DESCRIPTION_MAP,
  OPERATION_EXPECTED_RESULT_MAP,
  OPERATION_IDS,
  OPERATION_MEMBER_PATH_MAP,
  OPERATION_REFERENCE_DOC_PATH_MAP,
  REFERENCE_OPERATION_GROUPS,
  buildInternalContractSchemas,
  type OperationId,
} from '@superdoc/document-api';
import { collectReferencedDefinitions } from '../lib/document-api-reference/schema';
import type { JsonSchema } from '../lib/document-api-reference/types';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const referenceRoot = resolve(appRoot, 'content/docs/document-api/reference');
const generatedRoot = resolve(appRoot, 'generated');
const modelPath = resolve(generatedRoot, 'document-api-reference.json');
const rawSchemaRoot = resolve(appRoot, 'public/reference/document-api');
const referenceExamples = {
  'query.match': {
    label: 'Find one clause and create a revision-guarded comment',
    provenance: 'Typechecked against the public Document API. Runtime validation is tracked separately.',
    sourcePath: 'snippets/document-api/reference-query-match.ts',
  },
} as const;
const referencePathOverrides: Partial<Record<OperationId, string>> = {
  formatRange: 'format/format-range',
};
const namespacePathOverrides: Partial<Record<string, string>> = {
  index: 'document-index',
};

type PageTreeNode = {
  files: string[];
  directories: Map<string, PageTreeNode>;
};

const snapshot = buildReferenceSnapshot();
const groupByOperation = new Map(
  REFERENCE_OPERATION_GROUPS.flatMap((group) =>
    group.operations.map((operationId) => [operationId, group.key] as const),
  ),
);

validateReferencePathOverrides();

async function main() {
  const model = {
    contractVersion: snapshot.contractVersion,
    sourceHash: snapshot.sourceHash,
    schemaDialect: snapshot.schemaDialect,
    definitions: snapshot.$defs ?? {},
    groups: REFERENCE_OPERATION_GROUPS.map((group) => {
      const path = withoutExtension(group.pagePath);
      const namespacePath = namespacePathOverrides[group.key];
      return {
        key: group.key,
        title: group.title,
        description: group.description,
        path: namespacePath ? `${namespacePath}/${path.split('/').at(-1)}` : path,
        operationIds: [...group.operations],
      };
    }),
    operations: Object.fromEntries(
      snapshot.operations.map((operation) => [
        operation.operationId,
        {
          operationId: operation.operationId,
          groupKey: groupByOperation.get(operation.operationId),
          memberPath: operation.memberPath,
          description: OPERATION_DESCRIPTION_MAP[operation.operationId],
          expectedResult: OPERATION_EXPECTED_RESULT_MAP[operation.operationId],
          path: operationReferencePath(operation.operationId),
          metadata: operation.metadata,
          schemas: operation.schemas,
        },
      ]),
    ),
    examples: Object.fromEntries(
      await Promise.all(
        Object.entries(referenceExamples).map(async ([operationId, example]) => [
          operationId,
          {
            label: example.label,
            provenance: example.provenance,
            sourcePath: example.sourcePath,
            code: (await readFile(resolve(appRoot, example.sourcePath), 'utf8')).trim(),
          },
        ]),
      ),
    ),
  };
  validateReferencePaths(model);

  await rm(referenceRoot, { recursive: true, force: true });
  await rm(rawSchemaRoot, { recursive: true, force: true });
  await mkdir(referenceRoot, { recursive: true });
  await mkdir(generatedRoot, { recursive: true });
  await mkdir(rawSchemaRoot, { recursive: true });
  await writeFile(modelPath, `${JSON.stringify(model, null, 2)}\n`, 'utf8');

  await writeMdx(
    'index.mdx',
    'Document API reference',
    'Search and inspect every operation generated from the canonical Document API contract.',
    '<DocumentApiReferenceLanding />',
    'Reference',
  );

  for (const group of model.groups) {
    await writeMdx(
      `${group.path}.mdx`,
      `${group.title} operations`,
      group.description,
      `<DocumentApiNamespace namespace="${group.key}" />`,
    );
  }

  for (const operation of Object.values(model.operations)) {
    await writeMdx(
      `${operation.path}.mdx`,
      operation.operationId,
      operation.description,
      `<DocumentApiOperation operationId="${operation.operationId}" />`,
    );
    await writeRawSchemas(
      operation.path,
      operation.operationId,
      operation.schemas,
      model.schemaDialect,
      model.definitions,
    );
  }

  await writeNavigationMetadata(model);

  console.log(
    `Generated Document API reference: ${snapshot.operations.length} operations in ${model.groups.length} namespaces.`,
  );
}

function operationReferencePath(operationId: OperationId) {
  const path = referencePathOverrides[operationId] ?? withoutExtension(OPERATION_REFERENCE_DOC_PATH_MAP[operationId]);
  const namespacePath = namespacePathOverrides[groupByOperation.get(operationId) ?? ''];
  return namespacePath ? `${namespacePath}/${path.split('/').slice(1).join('/')}` : path;
}

async function writeRawSchemas(
  path: string,
  operationId: string,
  schemas: unknown,
  schemaDialect: string,
  definitions: Record<string, JsonSchema>,
) {
  const absolutePath = resolve(rawSchemaRoot, `${path}.json`);
  const referencedDefinitions = collectReferencedDefinitions(schemas, definitions);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(
    absolutePath,
    `${JSON.stringify({ $schema: schemaDialect, $defs: referencedDefinitions, operationId, schemas }, null, 2)}\n`,
    'utf8',
  );
}

void main().catch((error: unknown) => {
  console.error('Document API reference generation failed.', error);
  process.exitCode = 1;
});

async function writeMdx(path: string, title: string, description: string, component: string, navTitle?: string) {
  const absolutePath = resolve(referenceRoot, path);
  await mkdir(dirname(absolutePath), { recursive: true });
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(title)}`,
    // Sidebar labels stay short; the descriptive title remains on the page.
    ...(navTitle ? [`navTitle: ${JSON.stringify(navTitle)}`] : []),
    `description: ${JSON.stringify(description.replace(/[<>]/gu, ''))}`,
    'full: true',
    '---',
    '',
    component,
    '',
  ].join('\n');
  await writeFile(absolutePath, frontmatter, 'utf8');
}

function withoutExtension(path: string) {
  return path.replace(/\.mdx$/u, '');
}

function buildReferenceSnapshot() {
  const internalSchemas = buildInternalContractSchemas();
  const operations = OPERATION_IDS.map((operationId) => ({
    operationId,
    memberPath: OPERATION_MEMBER_PATH_MAP[operationId],
    metadata: COMMAND_CATALOG[operationId],
    schemas: internalSchemas.operations[operationId],
  }));
  const sourcePayload = {
    contractVersion: CONTRACT_VERSION,
    schemaDialect: JSON_SCHEMA_DIALECT,
    operationCatalog: COMMAND_CATALOG,
    operationMap: OPERATION_MEMBER_PATH_MAP,
    operationDescriptions: OPERATION_DESCRIPTION_MAP,
    operationExpectedResults: OPERATION_EXPECTED_RESULT_MAP,
    schemas: internalSchemas.operations,
  };

  return {
    contractVersion: CONTRACT_VERSION,
    schemaDialect: JSON_SCHEMA_DIALECT,
    sourceHash: createHash('sha256').update(stableStringify(sourcePayload), 'utf8').digest('hex'),
    ...(internalSchemas.$defs ? { $defs: internalSchemas.$defs } : {}),
    operations,
  };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableSort(value), null, 2);
}

function stableSort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableSort);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableSort(nested)]),
  );
}

function validateReferencePathOverrides() {
  const operationIdsByPath = new Map<string, string[]>();

  for (const operation of snapshot.operations) {
    const path = withoutExtension(OPERATION_REFERENCE_DOC_PATH_MAP[operation.operationId]);
    const operationIds = operationIdsByPath.get(path) ?? [];
    operationIds.push(operation.operationId);
    operationIdsByPath.set(path, operationIds);
  }

  for (const operationId of Object.keys(referencePathOverrides) as OperationId[]) {
    const canonicalPath = withoutExtension(OPERATION_REFERENCE_DOC_PATH_MAP[operationId]);
    const collidingOperationIds = operationIdsByPath.get(canonicalPath) ?? [];

    if (collidingOperationIds.length < 2) {
      throw new Error(
        `Reference path override for ${operationId} is no longer needed. Remove it and use the canonical path.`,
      );
    }
  }
}

function validateReferencePaths(model: {
  groups: Array<{ key: string; path: string }>;
  operations: Record<string, { path: string }>;
}) {
  const ownersByPath = new Map<string, string[]>();
  const generatedPaths = [
    { owner: 'reference landing', path: 'index' },
    ...model.groups.map((group) => ({ owner: `namespace ${group.key}`, path: group.path })),
    ...Object.entries(model.operations).map(([operationId, operation]) => ({
      owner: `operation ${operationId}`,
      path: operation.path,
    })),
  ];

  for (const { owner, path } of generatedPaths) {
    const owners = ownersByPath.get(path) ?? [];
    owners.push(owner);
    ownersByPath.set(path, owners);
  }

  const collisions = [...ownersByPath].filter(([, owners]) => owners.length > 1);
  if (collisions.length > 0) {
    const details = collisions.map(([path, owners]) => `${path}: ${owners.join(', ')}`).join('; ');
    throw new Error(`Document API reference paths collide: ${details}`);
  }
}

async function writeNavigationMetadata(model: {
  groups: Array<{ path: string; title: string }>;
  operations: Record<string, { path: string }>;
}) {
  const root: PageTreeNode = { files: [], directories: new Map() };
  const paths = [
    'index',
    ...model.groups.map((group) => group.path),
    ...Object.values(model.operations).map((op) => op.path),
  ];
  const groupTitles = new Map(model.groups.map((group) => [group.path, group.title]));

  for (const path of paths) addToTree(root, path.split('/'));
  await writeTreeMetadata(referenceRoot, root, '', groupTitles, new Set(groupTitles.keys()));
}

function addToTree(node: PageTreeNode, segments: string[]) {
  const [segment, ...rest] = segments;
  if (!segment) return;
  if (rest.length === 0) {
    if (!node.files.includes(segment)) node.files.push(segment);
    return;
  }
  const child = node.directories.get(segment) ?? { files: [], directories: new Map() };
  node.directories.set(segment, child);
  addToTree(child, rest);
}

async function writeTreeMetadata(
  directory: string,
  node: PageTreeNode,
  relativePath: string,
  groupTitles: Map<string, string>,
  groupPaths: Set<string>,
) {
  const visibleDirectories = [...node.directories.keys()]
    .filter((name) => {
      const path = relativePath ? `${relativePath}/${name}` : name;
      return [...groupPaths].some((groupPath) => groupPath === `${path}/index` || groupPath.startsWith(`${path}/`));
    })
    .sort();
  const pages = [...node.files.filter((file) => file === 'index').sort(pageOrder), ...visibleDirectories];
  const title = relativePath
    ? (groupTitles.get(`${relativePath}/index`) ?? titleFromSegment(relativePath.split('/').at(-1)!))
    : // The group already sits under "Document API"; repeating it in the label
      // wastes sidebar width and reads as a duplicate section.
      'Reference';
  await writeFile(resolve(directory, 'meta.json'), `${JSON.stringify({ title, pages }, null, 2)}\n`, 'utf8');

  for (const [name, child] of node.directories) {
    const childDirectory = resolve(directory, name);
    const childPath = relativePath ? `${relativePath}/${name}` : name;
    await mkdir(childDirectory, { recursive: true });
    await writeTreeMetadata(childDirectory, child, childPath, groupTitles, groupPaths);
  }
}

function pageOrder(left: string, right: string) {
  if (left === 'index') return -1;
  if (right === 'index') return 1;
  return left.localeCompare(right);
}

function titleFromSegment(segment: string) {
  return segment
    .split('-')
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}
