export type NamespaceJob = {
  id: string;
  title: string;
  operationIds: string[];
};

const contentControlReads = new Set([
  'contentControls.list',
  'contentControls.get',
  'contentControls.listInRange',
  'contentControls.selectByTag',
  'contentControls.selectByTitle',
  'contentControls.listChildren',
  'contentControls.getParent',
  'contentControls.getContent',
  'contentControls.getBinding',
  'contentControls.getRawProperties',
  'contentControls.validateWordCompatibility',
  'contentControls.checkbox.getState',
  'contentControls.choiceList.getItems',
]);

const contentControlMetadata = new Set([
  'contentControls.patch',
  'contentControls.setLockMode',
  'contentControls.setType',
  'contentControls.setBinding',
  'contentControls.clearBinding',
  'contentControls.patchRawProperties',
  'contentControls.normalizeWordCompatibility',
  'contentControls.normalizeTagPayload',
]);

export function getNamespaceJobs(namespace: string, operationIds: string[]): NamespaceJob[] | undefined {
  if (namespace !== 'contentControls') return;

  const buckets = new Map<string, NamespaceJob>([
    ['discover', { id: 'discover', title: 'Discover and inspect', operationIds: [] }],
    ['create', { id: 'create', title: 'Create, wrap, and place', operationIds: [] }],
    ['typed', { id: 'typed', title: 'Values and typed controls', operationIds: [] }],
    ['metadata', { id: 'metadata', title: 'Locking, metadata, and XML binding', operationIds: [] }],
    ['repeating', { id: 'repeating', title: 'Repeating sections and groups', operationIds: [] }],
  ]);

  for (const operationId of operationIds) {
    const bucket = contentControlReads.has(operationId)
      ? 'discover'
      : operationId.includes('.repeatingSection.') || operationId.includes('.group.')
        ? 'repeating'
        : contentControlMetadata.has(operationId)
          ? 'metadata'
          : /\.(?:text|date|checkbox|choiceList)\./u.test(operationId) ||
              operationId.endsWith('replaceContent') ||
              operationId.endsWith('clearContent')
            ? 'typed'
            : 'create';
    buckets.get(bucket)!.operationIds.push(operationId);
  }

  return [...buckets.values()].filter((job) => job.operationIds.length > 0);
}

export const featuredInputFields: Record<string, string[]> = {
  'query.match': ['select', 'require', 'within', 'in', 'limit', 'offset'],
};

export const relatedOperations: Record<
  string,
  Array<{ operationId?: string; title: string; description: string; href?: string }>
> = {
  'query.match': [
    {
      operationId: 'comments.create',
      title: 'comments.create',
      description: 'Anchor a comment to a text match target.',
    },
    { operationId: 'replace', title: 'replace', description: 'Replace the exact matched range.' },
    { operationId: 'delete', title: 'delete', description: 'Delete the exact matched range.' },
    {
      title: 'Query content guide',
      description: 'Learn targeting, cardinality, references, and revision safety.',
      href: '/document-api/query-content',
    },
  ],
};
