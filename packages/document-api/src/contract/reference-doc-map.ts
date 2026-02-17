import { OPERATION_IDS, type OperationId } from './types.js';

export type ReferenceGroupKey = 'core' | 'capabilities' | 'create' | 'format' | 'lists' | 'comments' | 'trackChanges';

export interface ReferenceOperationGroupDefinition {
  key: ReferenceGroupKey;
  title: string;
  description: string;
  pagePath: string;
  operations: readonly OperationId[];
}

export const OPERATION_REFERENCE_DOC_PATH_MAP: Record<OperationId, string> = {
  find: 'find.mdx',
  getNode: 'get-node.mdx',
  getNodeById: 'get-node-by-id.mdx',
  getText: 'get-text.mdx',
  info: 'info.mdx',
  insert: 'insert.mdx',
  replace: 'replace.mdx',
  delete: 'delete.mdx',
  'format.bold': 'format/bold.mdx',
  'create.paragraph': 'create/paragraph.mdx',
  'lists.list': 'lists/list.mdx',
  'lists.get': 'lists/get.mdx',
  'lists.insert': 'lists/insert.mdx',
  'lists.setType': 'lists/set-type.mdx',
  'lists.indent': 'lists/indent.mdx',
  'lists.outdent': 'lists/outdent.mdx',
  'lists.restart': 'lists/restart.mdx',
  'lists.exit': 'lists/exit.mdx',
  'comments.add': 'comments/add.mdx',
  'comments.edit': 'comments/edit.mdx',
  'comments.reply': 'comments/reply.mdx',
  'comments.move': 'comments/move.mdx',
  'comments.resolve': 'comments/resolve.mdx',
  'comments.remove': 'comments/remove.mdx',
  'comments.setInternal': 'comments/set-internal.mdx',
  'comments.setActive': 'comments/set-active.mdx',
  'comments.goTo': 'comments/go-to.mdx',
  'comments.get': 'comments/get.mdx',
  'comments.list': 'comments/list.mdx',
  'trackChanges.list': 'track-changes/list.mdx',
  'trackChanges.get': 'track-changes/get.mdx',
  'trackChanges.accept': 'track-changes/accept.mdx',
  'trackChanges.reject': 'track-changes/reject.mdx',
  'trackChanges.acceptAll': 'track-changes/accept-all.mdx',
  'trackChanges.rejectAll': 'track-changes/reject-all.mdx',
  'capabilities.get': 'capabilities/get.mdx',
};

export const REFERENCE_OPERATION_GROUPS: readonly ReferenceOperationGroupDefinition[] = [
  {
    key: 'core',
    title: 'Core',
    description: 'Primary read and write operations.',
    pagePath: 'core/index.mdx',
    operations: ['find', 'getNode', 'getNodeById', 'getText', 'info', 'insert', 'replace', 'delete'],
  },
  {
    key: 'capabilities',
    title: 'Capabilities',
    description: 'Runtime support discovery for capability-aware branching.',
    pagePath: 'capabilities/index.mdx',
    operations: ['capabilities.get'],
  },
  {
    key: 'create',
    title: 'Create',
    description: 'Structured creation helpers.',
    pagePath: 'create/index.mdx',
    operations: ['create.paragraph'],
  },
  {
    key: 'format',
    title: 'Format',
    description: 'Formatting mutations.',
    pagePath: 'format/index.mdx',
    operations: ['format.bold'],
  },
  {
    key: 'lists',
    title: 'Lists',
    description: 'List inspection and list mutations.',
    pagePath: 'lists/index.mdx',
    operations: [
      'lists.list',
      'lists.get',
      'lists.insert',
      'lists.setType',
      'lists.indent',
      'lists.outdent',
      'lists.restart',
      'lists.exit',
    ],
  },
  {
    key: 'comments',
    title: 'Comments',
    description: 'Comment authoring and thread lifecycle operations.',
    pagePath: 'comments/index.mdx',
    operations: [
      'comments.add',
      'comments.edit',
      'comments.reply',
      'comments.move',
      'comments.resolve',
      'comments.remove',
      'comments.setInternal',
      'comments.setActive',
      'comments.goTo',
      'comments.get',
      'comments.list',
    ],
  },
  {
    key: 'trackChanges',
    title: 'Track Changes',
    description: 'Tracked-change inspection and review operations.',
    pagePath: 'track-changes/index.mdx',
    operations: [
      'trackChanges.list',
      'trackChanges.get',
      'trackChanges.accept',
      'trackChanges.reject',
      'trackChanges.acceptAll',
      'trackChanges.rejectAll',
    ],
  },
];

/**
 * Fail-fast guard that runs at import time to catch stale reference-doc
 * mappings before they reach consumers. The same invariants are also covered
 * by contract.test.ts; this assertion provides an immediate signal during
 * development when a new operation is added but the doc map is not updated.
 */
function assertReferenceMapCoverage(): void {
  const operationIds = [...OPERATION_IDS].sort();

  const docPathKeys = Object.keys(OPERATION_REFERENCE_DOC_PATH_MAP).sort();
  if (docPathKeys.join('|') !== operationIds.join('|')) {
    throw new Error('OPERATION_REFERENCE_DOC_PATH_MAP keys must match OPERATION_IDS exactly.');
  }

  const grouped = REFERENCE_OPERATION_GROUPS.flatMap((group) => group.operations);
  const groupedSorted = [...grouped].sort();
  if (groupedSorted.join('|') !== operationIds.join('|')) {
    throw new Error('REFERENCE_OPERATION_GROUPS operation coverage must match OPERATION_IDS exactly.');
  }

  if (new Set(grouped).size !== grouped.length) {
    throw new Error('REFERENCE_OPERATION_GROUPS contains duplicate operations.');
  }
}

assertReferenceMapCoverage();
