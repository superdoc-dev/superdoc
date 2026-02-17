import type { ReceiptFailureCode } from '../types/receipt.js';
import type { CommandCatalog, CommandStaticMetadata, OperationIdempotency, PreApplyThrowCode } from './types.js';
import { OPERATION_IDS } from './types.js';

const NONE_FAILURES: readonly ReceiptFailureCode[] = [];
const NONE_THROWS: readonly PreApplyThrowCode[] = [];

function readOperation(
  options: {
    idempotency?: OperationIdempotency;
    throws?: readonly PreApplyThrowCode[];
    deterministicTargetResolution?: boolean;
    remediationHints?: readonly string[];
  } = {},
): CommandStaticMetadata {
  return {
    mutates: false,
    idempotency: options.idempotency ?? 'idempotent',
    supportsDryRun: false,
    supportsTrackedMode: false,
    possibleFailureCodes: NONE_FAILURES,
    throws: {
      preApply: options.throws ?? NONE_THROWS,
      postApplyForbidden: true,
    },
    deterministicTargetResolution: options.deterministicTargetResolution ?? true,
    remediationHints: options.remediationHints,
  };
}

function mutationOperation(options: {
  idempotency: OperationIdempotency;
  supportsDryRun: boolean;
  supportsTrackedMode: boolean;
  possibleFailureCodes: readonly ReceiptFailureCode[];
  throws: readonly PreApplyThrowCode[];
  deterministicTargetResolution?: boolean;
  remediationHints?: readonly string[];
}): CommandStaticMetadata {
  return {
    mutates: true,
    idempotency: options.idempotency,
    supportsDryRun: options.supportsDryRun,
    supportsTrackedMode: options.supportsTrackedMode,
    possibleFailureCodes: options.possibleFailureCodes,
    throws: {
      preApply: options.throws,
      postApplyForbidden: true,
    },
    deterministicTargetResolution: options.deterministicTargetResolution ?? true,
    remediationHints: options.remediationHints,
  };
}

const T_NOT_FOUND = ['TARGET_NOT_FOUND'] as const;
const T_COMMAND = ['COMMAND_UNAVAILABLE'] as const;
const T_NOT_FOUND_COMMAND = ['TARGET_NOT_FOUND', 'COMMAND_UNAVAILABLE'] as const;
const T_NOT_FOUND_TRACKED = ['TARGET_NOT_FOUND', 'TRACK_CHANGE_COMMAND_UNAVAILABLE'] as const;
const T_NOT_FOUND_COMMAND_TRACKED = [
  'TARGET_NOT_FOUND',
  'COMMAND_UNAVAILABLE',
  'TRACK_CHANGE_COMMAND_UNAVAILABLE',
] as const;

export const COMMAND_CATALOG: CommandCatalog = {
  find: readOperation({
    idempotency: 'idempotent',
    deterministicTargetResolution: false,
  }),
  getNode: readOperation({
    idempotency: 'idempotent',
    throws: T_NOT_FOUND,
  }),
  getNodeById: readOperation({
    idempotency: 'idempotent',
    throws: T_NOT_FOUND,
  }),
  getText: readOperation(),
  info: readOperation(),

  insert: mutationOperation({
    idempotency: 'non-idempotent',
    supportsDryRun: true,
    supportsTrackedMode: true,
    possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
    throws: T_NOT_FOUND_TRACKED,
  }),
  replace: mutationOperation({
    idempotency: 'conditional',
    supportsDryRun: true,
    supportsTrackedMode: true,
    possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
    throws: T_NOT_FOUND_TRACKED,
  }),
  delete: mutationOperation({
    idempotency: 'conditional',
    supportsDryRun: true,
    supportsTrackedMode: true,
    possibleFailureCodes: ['NO_OP'],
    throws: T_NOT_FOUND_TRACKED,
  }),

  'format.bold': mutationOperation({
    idempotency: 'conditional',
    supportsDryRun: true,
    supportsTrackedMode: true,
    possibleFailureCodes: ['INVALID_TARGET'],
    throws: T_NOT_FOUND_COMMAND_TRACKED,
  }),

  'create.paragraph': mutationOperation({
    idempotency: 'non-idempotent',
    supportsDryRun: true,
    supportsTrackedMode: true,
    possibleFailureCodes: ['INVALID_TARGET'],
    throws: T_NOT_FOUND_COMMAND_TRACKED,
  }),

  'lists.list': readOperation({
    idempotency: 'idempotent',
    throws: T_NOT_FOUND,
  }),
  'lists.get': readOperation({
    idempotency: 'idempotent',
    throws: T_NOT_FOUND,
  }),
  'lists.insert': mutationOperation({
    idempotency: 'non-idempotent',
    supportsDryRun: false,
    supportsTrackedMode: true,
    possibleFailureCodes: ['INVALID_TARGET'],
    throws: T_NOT_FOUND_COMMAND_TRACKED,
  }),
  'lists.setType': mutationOperation({
    idempotency: 'conditional',
    supportsDryRun: false,
    supportsTrackedMode: false,
    possibleFailureCodes: ['NO_OP', 'INVALID_TARGET'],
    throws: T_NOT_FOUND_COMMAND_TRACKED,
  }),
  'lists.indent': mutationOperation({
    idempotency: 'conditional',
    supportsDryRun: false,
    supportsTrackedMode: false,
    possibleFailureCodes: ['NO_OP', 'INVALID_TARGET'],
    throws: T_NOT_FOUND_COMMAND_TRACKED,
  }),
  'lists.outdent': mutationOperation({
    idempotency: 'conditional',
    supportsDryRun: false,
    supportsTrackedMode: false,
    possibleFailureCodes: ['NO_OP', 'INVALID_TARGET'],
    throws: T_NOT_FOUND_COMMAND_TRACKED,
  }),
  'lists.restart': mutationOperation({
    idempotency: 'conditional',
    supportsDryRun: false,
    supportsTrackedMode: false,
    possibleFailureCodes: ['NO_OP', 'INVALID_TARGET'],
    throws: T_NOT_FOUND_COMMAND_TRACKED,
  }),
  'lists.exit': mutationOperation({
    idempotency: 'conditional',
    supportsDryRun: false,
    supportsTrackedMode: false,
    possibleFailureCodes: ['INVALID_TARGET'],
    throws: T_NOT_FOUND_COMMAND_TRACKED,
  }),

  'comments.add': mutationOperation({
    idempotency: 'non-idempotent',
    supportsDryRun: false,
    supportsTrackedMode: false,
    possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
    throws: T_NOT_FOUND_COMMAND,
  }),
  'comments.edit': mutationOperation({
    idempotency: 'conditional',
    supportsDryRun: false,
    supportsTrackedMode: false,
    possibleFailureCodes: ['NO_OP'],
    throws: T_NOT_FOUND_COMMAND,
  }),
  'comments.reply': mutationOperation({
    idempotency: 'non-idempotent',
    supportsDryRun: false,
    supportsTrackedMode: false,
    possibleFailureCodes: ['INVALID_TARGET'],
    throws: T_NOT_FOUND_COMMAND,
  }),
  'comments.move': mutationOperation({
    idempotency: 'conditional',
    supportsDryRun: false,
    supportsTrackedMode: false,
    possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
    throws: T_NOT_FOUND_COMMAND,
  }),
  'comments.resolve': mutationOperation({
    idempotency: 'conditional',
    supportsDryRun: false,
    supportsTrackedMode: false,
    possibleFailureCodes: ['NO_OP'],
    throws: T_NOT_FOUND_COMMAND,
  }),
  'comments.remove': mutationOperation({
    idempotency: 'conditional',
    supportsDryRun: false,
    supportsTrackedMode: false,
    possibleFailureCodes: ['NO_OP'],
    throws: T_NOT_FOUND_COMMAND,
  }),
  'comments.setInternal': mutationOperation({
    idempotency: 'conditional',
    supportsDryRun: false,
    supportsTrackedMode: false,
    possibleFailureCodes: ['NO_OP', 'INVALID_TARGET'],
    throws: T_NOT_FOUND_COMMAND,
  }),
  'comments.setActive': mutationOperation({
    idempotency: 'conditional',
    supportsDryRun: false,
    supportsTrackedMode: false,
    possibleFailureCodes: ['INVALID_TARGET'],
    throws: T_NOT_FOUND_COMMAND,
  }),
  'comments.goTo': readOperation({
    idempotency: 'conditional',
    throws: T_NOT_FOUND_COMMAND,
  }),
  'comments.get': readOperation({
    idempotency: 'idempotent',
    throws: T_NOT_FOUND,
  }),
  'comments.list': readOperation({
    idempotency: 'idempotent',
  }),

  'trackChanges.list': readOperation({
    idempotency: 'idempotent',
  }),
  'trackChanges.get': readOperation({
    idempotency: 'idempotent',
    throws: T_NOT_FOUND,
  }),
  'trackChanges.accept': mutationOperation({
    idempotency: 'conditional',
    supportsDryRun: false,
    supportsTrackedMode: false,
    possibleFailureCodes: ['NO_OP'],
    throws: T_NOT_FOUND_COMMAND,
  }),
  'trackChanges.reject': mutationOperation({
    idempotency: 'conditional',
    supportsDryRun: false,
    supportsTrackedMode: false,
    possibleFailureCodes: ['NO_OP'],
    throws: T_NOT_FOUND_COMMAND,
  }),
  'trackChanges.acceptAll': mutationOperation({
    idempotency: 'conditional',
    supportsDryRun: false,
    supportsTrackedMode: false,
    possibleFailureCodes: ['NO_OP'],
    throws: T_COMMAND,
  }),
  'trackChanges.rejectAll': mutationOperation({
    idempotency: 'conditional',
    supportsDryRun: false,
    supportsTrackedMode: false,
    possibleFailureCodes: ['NO_OP'],
    throws: T_COMMAND,
  }),

  'capabilities.get': readOperation({
    idempotency: 'idempotent',
    throws: NONE_THROWS,
  }),
} as const;

/** Operation IDs whose catalog entry has `mutates: true`. */
export const MUTATING_OPERATION_IDS = OPERATION_IDS.filter((operationId) => COMMAND_CATALOG[operationId].mutates);

/**
 * Returns the static metadata for a given operation.
 *
 * @param operationId - A known operation identifier from the command catalog.
 * @returns The compile-time metadata describing idempotency, failure codes, throw policy, etc.
 */
export function getCommandMetadata(operationId: keyof typeof COMMAND_CATALOG): CommandStaticMetadata {
  return COMMAND_CATALOG[operationId];
}
