/**
 * Canonical CLI operation set — the root definition.
 *
 * All CLI metadata derives from this file. The doc-backed operation set is
 * derived from document-api's OPERATION_IDS via an explicit denylist.
 * 10 CLI-only operations are added for lifecycle/session/introspection.
 */

import {
  COMMAND_CATALOG,
  OPERATION_IDS,
  OPERATION_MEMBER_PATH_MAP,
  OPERATION_DESCRIPTION_MAP,
  OPERATION_REQUIRES_DOCUMENT_CONTEXT_MAP,
  isOperationId,
  type OperationId,
  REFERENCE_OPERATION_GROUPS,
  type ReferenceGroupKey,
} from '@superdoc/document-api';

// ---------------------------------------------------------------------------
// Doc-backed operations (derived from document-api with denylist)
// ---------------------------------------------------------------------------

/** Operations explicitly excluded from the CLI (with justification). */
const CLI_OPERATION_DENYLIST = [
  'getText', // Subsumed by find + info; revisit if needed
  'capabilities.get', // Internal engine concern, not user-facing
  'create.heading', // Currently unavailable in the CLI/runtime command surface
] as const satisfies readonly OperationId[];

type DeniedOperationId = (typeof CLI_OPERATION_DENYLIST)[number];

/**
 * Narrowed type: only the document-api operations the CLI actually exposes.
 * Uses Exclude to get a precise literal union — filter() would widen to OperationId.
 */
export type CliExposedOperationId = Exclude<OperationId, DeniedOperationId>;

/** Runtime list of CLI-exposed operations — typed to match the Exclude union. */
const denySet: ReadonlySet<string> = new Set(CLI_OPERATION_DENYLIST);
export const CLI_DOC_OPERATIONS: readonly CliExposedOperationId[] = OPERATION_IDS.filter(
  (id): id is CliExposedOperationId => !denySet.has(id),
);

// ---------------------------------------------------------------------------
// CLI-only operations (not in document-api)
// ---------------------------------------------------------------------------

export const CLI_ONLY_OPERATIONS = [
  'open',
  'save',
  'close',
  'status',
  'describe',
  'describeCommand',
  'session.list',
  'session.save',
  'session.close',
  'session.setDefault',
] as const;

export type CliOnlyOperation = (typeof CLI_ONLY_OPERATIONS)[number];

// ---------------------------------------------------------------------------
// CliOperationId — union of all CLI operation IDs
// ---------------------------------------------------------------------------

export type DocBackedCliOpId = `doc.${CliExposedOperationId}`;
type CliOnlyOpId = `doc.${CliOnlyOperation}`;

export type CliOperationId = DocBackedCliOpId | CliOnlyOpId;

/** All CLI operation IDs as an array. */
export const CLI_OPERATION_IDS: readonly CliOperationId[] = [
  ...CLI_DOC_OPERATIONS.map((id) => `doc.${id}` as CliOperationId),
  ...CLI_ONLY_OPERATIONS.map((id) => `doc.${id}` as CliOperationId),
];

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

/** Strips the `doc.` prefix and returns the document-api OperationId, or null for CLI-only ops. */
export function toDocApiId(cliOpId: string): OperationId | null {
  if (!cliOpId.startsWith('doc.')) return null;
  const stripped = cliOpId.slice(4);
  return isOperationId(stripped) ? stripped : null;
}

/** Returns true if the CLI operation is backed by a document-api operation. */
export function isDocBackedOperation(cliOpId: string): boolean {
  return toDocApiId(cliOpId) !== null;
}

// ---------------------------------------------------------------------------
// Category derivation
// ---------------------------------------------------------------------------

export type CliCategory =
  | 'query'
  | 'mutation'
  | 'format'
  | 'create'
  | 'lists'
  | 'comments'
  | 'trackChanges'
  | 'capabilities'
  | 'lifecycle'
  | 'session'
  | 'introspection';

const CLI_ONLY_CATEGORIES: Record<CliOnlyOperation, CliCategory> = {
  open: 'lifecycle',
  save: 'lifecycle',
  close: 'lifecycle',
  status: 'introspection',
  describe: 'introspection',
  describeCommand: 'introspection',
  'session.list': 'session',
  'session.save': 'session',
  'session.close': 'session',
  'session.setDefault': 'session',
};

const REFERENCE_GROUP_BY_OP = new Map<string, ReferenceGroupKey>();
for (const group of REFERENCE_OPERATION_GROUPS) {
  for (const opId of group.operations) {
    REFERENCE_GROUP_BY_OP.set(opId, group.key);
  }
}

function deriveCategoryFromDocApi(docApiId: OperationId): CliCategory {
  const group = REFERENCE_GROUP_BY_OP.get(docApiId);
  if (!group) return 'query';

  if (group === 'core') {
    return COMMAND_CATALOG[docApiId].mutates ? 'mutation' : 'query';
  }

  return group as CliCategory;
}

export function cliCategory(cliOpId: CliOperationId): CliCategory {
  const docApiId = toDocApiId(cliOpId);
  if (docApiId) return deriveCategoryFromDocApi(docApiId);

  const stripped = cliOpId.slice(4) as CliOnlyOperation;
  return CLI_ONLY_CATEGORIES[stripped] ?? 'introspection';
}

// ---------------------------------------------------------------------------
// Description + requiresDocumentContext accessors
// ---------------------------------------------------------------------------

const CLI_ONLY_DESCRIPTIONS: Record<CliOnlyOperation, string> = {
  open: 'Open a document and create a persistent editing session.',
  save: 'Save the current session to the original file or a new path.',
  close: 'Close the active editing session and clean up resources.',
  status: 'Show the current session status and document metadata.',
  describe: 'List all available CLI operations and contract metadata.',
  describeCommand: 'Show detailed metadata for a single CLI operation.',
  'session.list': 'List all active editing sessions.',
  'session.save': 'Persist the current session state.',
  'session.close': 'Close a specific editing session by ID.',
  'session.setDefault': 'Set the default session for subsequent commands.',
};

const CLI_ONLY_REQUIRES_DOCUMENT: Record<CliOnlyOperation, boolean> = {
  open: false,
  save: false,
  close: false,
  status: false,
  describe: false,
  describeCommand: false,
  'session.list': false,
  'session.save': false,
  'session.close': false,
  'session.setDefault': false,
};

export function cliDescription(cliOpId: CliOperationId): string {
  const docApiId = toDocApiId(cliOpId);
  if (docApiId) return OPERATION_DESCRIPTION_MAP[docApiId];

  const stripped = cliOpId.slice(4) as CliOnlyOperation;
  return CLI_ONLY_DESCRIPTIONS[stripped] ?? '';
}

export function cliRequiresDocumentContext(cliOpId: CliOperationId): boolean {
  const docApiId = toDocApiId(cliOpId);
  if (docApiId) return OPERATION_REQUIRES_DOCUMENT_CONTEXT_MAP[docApiId];

  const stripped = cliOpId.slice(4) as CliOnlyOperation;
  return CLI_ONLY_REQUIRES_DOCUMENT[stripped] ?? false;
}

// ---------------------------------------------------------------------------
// Command token derivation
// ---------------------------------------------------------------------------

/**
 * Derives CLI command tokens from a doc-api member path.
 * E.g. "comments.add" → ["comments", "add"], "find" → ["find"]
 *
 * For CLI-only ops, converts camelCase to kebab-case:
 * E.g. "session.setDefault" → ["session", "set-default"]
 */
function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
}

/**
 * Explicit command token overrides for CLI-only operations whose
 * algorithmic derivation doesn't match the expected CLI surface.
 */
const CLI_ONLY_TOKEN_OVERRIDES: Partial<Record<CliOnlyOperation, readonly string[]>> = {
  describeCommand: ['describe', 'command'],
};

export function cliCommandTokens(cliOpId: CliOperationId): readonly string[] {
  const docApiId = toDocApiId(cliOpId);
  if (docApiId) {
    const memberPath = OPERATION_MEMBER_PATH_MAP[docApiId];
    return memberPath.split('.').map(camelToKebab);
  }

  const stripped = cliOpId.slice(4) as CliOnlyOperation;
  const override = CLI_ONLY_TOKEN_OVERRIDES[stripped];
  if (override) return override;

  return stripped.split('.').map(camelToKebab);
}
