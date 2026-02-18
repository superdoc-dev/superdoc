import {
  OPERATION_DEFINITIONS,
  OPERATION_IDS,
  projectFromDefinitions,
  type OperationId,
} from './operation-definitions.js';

export type DocumentApiMemberPath = (typeof OPERATION_DEFINITIONS)[OperationId]['memberPath'];

export function memberPathForOperation(operationId: OperationId): DocumentApiMemberPath {
  return OPERATION_DEFINITIONS[operationId].memberPath;
}

export const OPERATION_MEMBER_PATH_MAP: Record<OperationId, DocumentApiMemberPath> = projectFromDefinitions(
  (_id, entry) => entry.memberPath as DocumentApiMemberPath,
);

export const DOCUMENT_API_MEMBER_PATHS: readonly DocumentApiMemberPath[] = [
  ...new Set(OPERATION_IDS.map((id) => OPERATION_DEFINITIONS[id].memberPath)),
];
