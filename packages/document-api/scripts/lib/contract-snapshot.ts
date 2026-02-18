import {
  COMMAND_CATALOG,
  CONTRACT_VERSION,
  JSON_SCHEMA_DIALECT,
  OPERATION_IDS,
  OPERATION_MEMBER_PATH_MAP,
  buildInternalContractSchemas,
  type OperationId,
} from '../../src/index.js';
import { sha256 } from './generation-utils.js';

export interface ContractOperationSnapshot {
  operationId: OperationId;
  memberPath: string;
  metadata: (typeof COMMAND_CATALOG)[keyof typeof COMMAND_CATALOG];
  schemas: ReturnType<typeof buildInternalContractSchemas>['operations'][keyof ReturnType<
    typeof buildInternalContractSchemas
  >['operations']];
}

export interface ContractSnapshot {
  contractVersion: string;
  schemaDialect: string;
  sourceHash: string;
  operations: ContractOperationSnapshot[];
}

let cached: ContractSnapshot | null = null;

export function buildContractSnapshot(): ContractSnapshot {
  if (cached) return cached;

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
    schemas: internalSchemas.operations,
  };

  cached = {
    contractVersion: CONTRACT_VERSION,
    schemaDialect: JSON_SCHEMA_DIALECT,
    sourceHash: sha256(sourcePayload),
    operations,
  };

  return cached;
}
