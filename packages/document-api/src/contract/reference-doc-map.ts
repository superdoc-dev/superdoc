import {
  OPERATION_DEFINITIONS,
  OPERATION_IDS,
  projectFromDefinitions,
  type ReferenceGroupKey,
} from './operation-definitions.js';
import type { OperationId } from './types.js';

export type { ReferenceGroupKey } from './operation-definitions.js';

export interface ReferenceOperationGroupDefinition {
  key: ReferenceGroupKey;
  title: string;
  description: string;
  pagePath: string;
  operations: readonly OperationId[];
}

export const OPERATION_REFERENCE_DOC_PATH_MAP: Record<OperationId, string> = projectFromDefinitions(
  (_id, entry) => entry.referenceDocPath,
);

const GROUP_METADATA: Record<ReferenceGroupKey, { title: string; description: string; pagePath: string }> = {
  core: {
    title: 'Core',
    description: 'Primary read and write operations.',
    pagePath: 'core/index.mdx',
  },
  capabilities: {
    title: 'Capabilities',
    description: 'Runtime support discovery for capability-aware branching.',
    pagePath: 'capabilities/index.mdx',
  },
  create: {
    title: 'Create',
    description: 'Structured creation helpers.',
    pagePath: 'create/index.mdx',
  },
  format: {
    title: 'Format',
    description: 'Formatting mutations.',
    pagePath: 'format/index.mdx',
  },
  lists: {
    title: 'Lists',
    description: 'List inspection and list mutations.',
    pagePath: 'lists/index.mdx',
  },
  comments: {
    title: 'Comments',
    description: 'Comment authoring and thread lifecycle operations.',
    pagePath: 'comments/index.mdx',
  },
  trackChanges: {
    title: 'Track Changes',
    description: 'Tracked-change inspection and review operations.',
    pagePath: 'track-changes/index.mdx',
  },
};

export const REFERENCE_OPERATION_GROUPS: readonly ReferenceOperationGroupDefinition[] = (
  Object.keys(GROUP_METADATA) as ReferenceGroupKey[]
).map((key) => ({
  key,
  ...GROUP_METADATA[key],
  operations: OPERATION_IDS.filter((id) => OPERATION_DEFINITIONS[id].referenceGroup === key),
}));
