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
  blocks: {
    title: 'Blocks',
    description: 'Block-level structural operations.',
    pagePath: 'blocks/index.mdx',
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
  sections: {
    title: 'Sections',
    description: 'Section structure and page-setup operations.',
    pagePath: 'sections/index.mdx',
  },
  format: {
    title: 'Format',
    description: "Canonical formatting mutation with directive semantics ('on', 'off', 'clear').",
    pagePath: 'format/index.mdx',
  },
  styles: {
    title: 'Styles',
    description: 'Document-level stylesheet mutations (docDefaults, style definitions).',
    pagePath: 'styles/index.mdx',
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
  query: {
    title: 'Query',
    description: 'Deterministic selector-based queries for mutation targeting.',
    pagePath: 'query/index.mdx',
  },
  mutations: {
    title: 'Mutations',
    description: 'Atomic mutation plan preview and execution.',
    pagePath: 'mutations/index.mdx',
  },
  tables: {
    title: 'Tables',
    description: 'Table structure, layout, styling, and cell operations.',
    pagePath: 'tables/index.mdx',
  },
};

export const REFERENCE_OPERATION_GROUPS: readonly ReferenceOperationGroupDefinition[] = (
  Object.keys(GROUP_METADATA) as ReferenceGroupKey[]
).map((key) => ({
  key,
  ...GROUP_METADATA[key],
  operations: OPERATION_IDS.filter((id) => OPERATION_DEFINITIONS[id].referenceGroup === key),
}));
