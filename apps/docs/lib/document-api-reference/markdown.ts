import { getNamespaceJobs, relatedOperations } from './curation';
import {
  getGroupOperations,
  getReferenceExample,
  getReferenceGroup,
  getReferenceModel,
  getReferenceOperation,
} from './model';
import { referenceUrl } from './urls';
import { collectReferencedDefinitions } from './schema';

export function renderReferenceLandingMarkdown() {
  const model = getReferenceModel();
  const groups = model.groups
    .map(
      (group) => `- [${group.title}](${referenceUrl(group.path)}) (${group.operationIds.length}): ${group.description}`,
    )
    .join('\n');

  return [
    `The reference contains ${Object.keys(model.operations).length} operations in contract ${model.contractVersion}.`,
    '',
    '## Common tasks',
    '',
    '- [Find and replace text](/document-api/query-content)',
    '- [Create and resolve comment threads](/document-api/comments)',
    '- [Preview and apply mutation plans](/document-api/mutation-plans)',
    '',
    '## Namespaces',
    '',
    groups,
    '',
  ].join('\n');
}

export function renderReferenceNamespaceMarkdown(namespace: string) {
  const group = getReferenceGroup(namespace);
  if (!group) return `Unknown Document API namespace: ${namespace}.\n`;
  const operations = new Map(getGroupOperations(group).map((operation) => [operation.operationId, operation]));
  const jobs = getNamespaceJobs(namespace, group.operationIds) ?? [
    { id: 'operations', title: 'Operations', operationIds: group.operationIds },
  ];
  const sections = jobs.map((job) => {
    const rows = job.operationIds.flatMap((operationId) => {
      const operation = operations.get(operationId);
      if (!operation) return [];
      const flags = [
        operation.metadata.mutates ? 'mutates' : 'read',
        operation.metadata.supportsTrackedMode ? 'tracked' : '',
      ]
        .filter(Boolean)
        .join(', ');
      return `- [\`${operation.operationId}\`](${referenceUrl(operation.path)}) (${flags}): ${operation.description}`;
    });
    return [`## ${job.title}`, '', ...rows, ''].join('\n');
  });

  return [
    `${group.operationIds.length} operations. Names, descriptions, and behavior flags come from the canonical contract.`,
    '',
    ...sections,
  ].join('\n');
}

export function renderReferenceOperationMarkdown(operationId: string, headingLevel = 2) {
  const operation = getReferenceOperation(operationId);
  if (!operation) return `Unknown Document API operation: ${operationId}.\n`;
  const model = getReferenceModel();
  const sectionHeading = '#'.repeat(headingLevel);
  const example = getReferenceExample(operationId);
  const related = relatedOperations[operationId] ?? [];
  const memberPath = `${operation.metadata.returnsPromise ? 'await ' : ''}doc.${operation.memberPath}(${operation.memberPath === 'capabilities' ? '' : '…'})`;
  const behavior = [
    `- Member path: \`${memberPath}\``,
    `- Mutates document: ${operation.metadata.mutates ? 'yes' : 'no'}`,
    `- Idempotency: \`${operation.metadata.idempotency}\``,
    `- Supports tracked mode: ${operation.metadata.supportsTrackedMode ? 'yes' : operation.metadata.supportsConditionalTrackedMode ? 'conditional' : 'no'}`,
    `- Supports dry run: ${operation.metadata.supportsDryRun ? 'yes' : 'no'}`,
  ];
  const exampleSection = example
    ? [
        `${sectionHeading} Usage`,
        '',
        `**Typechecked example:** ${example.label}. ${example.provenance}`,
        '',
        '```ts',
        example.code,
        '```',
        '',
      ]
    : [];
  const throws = operation.metadata.throws.preApply.length
    ? operation.metadata.throws.preApply.map((code) => `- \`${code}\``)
    : ['- None'];
  const failures = operation.metadata.possibleFailureCodes.length
    ? operation.metadata.possibleFailureCodes.map((code) => `- \`${code}\``)
    : ['- None'];
  const relatedSection = related.length
    ? [
        `${sectionHeading} Related`,
        '',
        ...related.map((item) => {
          const linkedOperation = item.operationId ? getReferenceOperation(item.operationId) : undefined;
          const href = item.href ?? (linkedOperation ? referenceUrl(linkedOperation.path) : '#');
          return `- [${item.title}](${href}): ${item.description}`;
        }),
        '',
      ]
    : [];
  const inputSchema = {
    $schema: model.schemaDialect,
    $defs: collectReferencedDefinitions(operation.schemas.input, model.definitions),
    ...operation.schemas.input,
  };
  const outputSchema = {
    $schema: model.schemaDialect,
    $defs: collectReferencedDefinitions(operation.schemas.output, model.definitions),
    ...operation.schemas.output,
  };

  return [
    ...behavior,
    '',
    ...exampleSection,
    `${sectionHeading} Expected result`,
    '',
    operation.expectedResult,
    '',
    `${sectionHeading} Input schema`,
    '',
    '```json',
    JSON.stringify(inputSchema, null, 2),
    '```',
    '',
    `${sectionHeading} Output schema`,
    '',
    '```json',
    JSON.stringify(outputSchema, null, 2),
    '```',
    '',
    `${sectionHeading} Pre-apply throws`,
    '',
    ...throws,
    '',
    `${sectionHeading} Non-applied receipt codes`,
    '',
    ...failures,
    '',
    ...relatedSection,
  ].join('\n');
}

export function renderFullReferenceMarkdown() {
  const model = getReferenceModel();
  return model.groups
    .flatMap((group) => [
      `# ${group.title} operations`,
      '',
      group.description,
      '',
      ...group.operationIds.flatMap((operationId) => {
        const operation = getReferenceOperation(operationId);
        if (!operation) return [];
        return [`## ${operation.operationId}`, '', renderReferenceOperationMarkdown(operationId, 3), ''];
      }),
    ])
    .join('\n');
}
