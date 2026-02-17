import type { ReceiptFailureCode } from '../types/receipt.js';

export const CONTRACT_VERSION = '0.1.0';

export const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

export const SINGLETON_OPERATION_IDS = [
  'find',
  'getNode',
  'getNodeById',
  'getText',
  'info',
  'insert',
  'replace',
  'delete',
] as const;

export const NAMESPACED_OPERATION_IDS = [
  'format.bold',
  'create.paragraph',
  'lists.list',
  'lists.get',
  'lists.insert',
  'lists.setType',
  'lists.indent',
  'lists.outdent',
  'lists.restart',
  'lists.exit',
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
  'trackChanges.list',
  'trackChanges.get',
  'trackChanges.accept',
  'trackChanges.reject',
  'trackChanges.acceptAll',
  'trackChanges.rejectAll',
  'capabilities.get',
] as const;

export const OPERATION_IDS = [...SINGLETON_OPERATION_IDS, ...NAMESPACED_OPERATION_IDS] as const;

export type OperationId = (typeof OPERATION_IDS)[number];

export const OPERATION_IDEMPOTENCY_VALUES = ['idempotent', 'conditional', 'non-idempotent'] as const;
export type OperationIdempotency = (typeof OPERATION_IDEMPOTENCY_VALUES)[number];

export const PRE_APPLY_THROW_CODES = [
  'TARGET_NOT_FOUND',
  'COMMAND_UNAVAILABLE',
  'TRACK_CHANGE_COMMAND_UNAVAILABLE',
  'CAPABILITY_UNAVAILABLE',
  'INVALID_TARGET',
] as const;

export type PreApplyThrowCode = (typeof PRE_APPLY_THROW_CODES)[number];

export interface CommandThrowPolicy {
  preApply: readonly PreApplyThrowCode[];
  postApplyForbidden: true;
}

export interface CommandStaticMetadata {
  mutates: boolean;
  idempotency: OperationIdempotency;
  supportsDryRun: boolean;
  supportsTrackedMode: boolean;
  possibleFailureCodes: readonly ReceiptFailureCode[];
  throws: CommandThrowPolicy;
  deterministicTargetResolution: boolean;
  remediationHints?: readonly string[];
}

export type CommandCatalog = {
  readonly [K in OperationId]: CommandStaticMetadata;
};

const OPERATION_ID_FORMAT = /^(?:[a-z][a-zA-Z0-9]*|[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*)$/;

/**
 * Checks whether a string matches the syntactic format of an operation ID
 * (`camelCase` or `namespace.camelCase`).
 *
 * @param operationId - The string to validate.
 * @returns `true` if the string matches the expected format.
 */
export function isValidOperationIdFormat(operationId: string): boolean {
  return OPERATION_ID_FORMAT.test(operationId);
}

/**
 * Type-guard that narrows a string to the {@link OperationId} union.
 *
 * @param operationId - The string to check.
 * @returns `true` if the string is a known operation ID.
 */
export function isOperationId(operationId: string): operationId is OperationId {
  return (OPERATION_IDS as readonly string[]).includes(operationId);
}

/**
 * Asserts that a string is a valid, known {@link OperationId}.
 *
 * @param operationId - The string to assert.
 * @throws {Error} If the string is not a recognised operation ID.
 */
export function assertOperationId(operationId: string): asserts operationId is OperationId {
  if (!isValidOperationIdFormat(operationId) || !isOperationId(operationId)) {
    throw new Error(`Unknown operationId "${operationId}".`);
  }
}
