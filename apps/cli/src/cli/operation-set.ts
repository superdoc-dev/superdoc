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

import { CLI_ONLY_OPERATION_DEFINITIONS } from './cli-only-operation-definitions';

export { CLI_ONLY_OPERATIONS, type CliCategory, type CliOnlyOperation } from './types';
import { CLI_ONLY_OPERATIONS, type CliCategory, type CliOnlyOperation } from './types';

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
  return CLI_ONLY_OPERATION_DEFINITIONS[stripped].category;
}

// ---------------------------------------------------------------------------
// Description + requiresDocumentContext accessors
// ---------------------------------------------------------------------------

export function cliDescription(cliOpId: CliOperationId): string {
  const docApiId = toDocApiId(cliOpId);
  if (docApiId) return OPERATION_DESCRIPTION_MAP[docApiId];

  const stripped = cliOpId.slice(4) as CliOnlyOperation;
  return CLI_ONLY_OPERATION_DEFINITIONS[stripped].description;
}

export function cliRequiresDocumentContext(cliOpId: CliOperationId): boolean {
  const docApiId = toDocApiId(cliOpId);
  if (docApiId) return OPERATION_REQUIRES_DOCUMENT_CONTEXT_MAP[docApiId];

  const stripped = cliOpId.slice(4) as CliOnlyOperation;
  return CLI_ONLY_OPERATION_DEFINITIONS[stripped].requiresDocumentContext;
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

export function cliCommandTokens(cliOpId: CliOperationId): readonly string[] {
  const docApiId = toDocApiId(cliOpId);
  if (docApiId) {
    const memberPath = OPERATION_MEMBER_PATH_MAP[docApiId];
    return memberPath.split('.').map(camelToKebab);
  }

  const stripped = cliOpId.slice(4) as CliOnlyOperation;
  const override = CLI_ONLY_OPERATION_DEFINITIONS[stripped].tokenOverride;
  if (override) return override;

  return stripped.split('.').map(camelToKebab);
}
