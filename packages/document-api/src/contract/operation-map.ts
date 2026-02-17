import { OPERATION_IDS, type OperationId } from './types.js';

/**
 * Overrides for operation IDs whose public DocumentApi member path
 * differs from the canonical operation ID.
 */
const MEMBER_PATH_OVERRIDES: Partial<Record<OperationId, string>> = {
  // capabilities() is exposed as a top-level getter-like method on DocumentApi.
  // The canonical operationId remains capabilities.get for catalog consistency.
  'capabilities.get': 'capabilities',
};

export function memberPathForOperation(operationId: OperationId): string {
  return MEMBER_PATH_OVERRIDES[operationId] ?? operationId;
}

export const DOCUMENT_API_MEMBER_PATHS = [...new Set(OPERATION_IDS.map(memberPathForOperation))] as const;

export type DocumentApiMemberPath = (typeof DOCUMENT_API_MEMBER_PATHS)[number];
