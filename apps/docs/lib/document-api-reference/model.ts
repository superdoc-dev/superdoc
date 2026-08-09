import referenceModel from '@/generated/document-api-reference.json';
import type { DocumentApiReferenceModel, ReferenceGroup, ReferenceOperation, ReferenceOperationSummary } from './types';

const model = referenceModel as DocumentApiReferenceModel;

export function getReferenceModel() {
  return model;
}

export function getReferenceGroup(key: string): ReferenceGroup | undefined {
  return model.groups.find((group) => group.key === key);
}

export function getReferenceOperation(operationId: string): ReferenceOperation | undefined {
  return model.operations[operationId];
}

export function getReferenceExample(operationId: string) {
  return model.examples[operationId];
}

export function getOperationSummaries(): ReferenceOperationSummary[] {
  return Object.values(model.operations)
    .map(({ schemas: _schemas, expectedResult: _expectedResult, ...operation }) => operation)
    .sort(compareOperationIds);
}

export function getGroupOperations(group: ReferenceGroup): ReferenceOperation[] {
  return group.operationIds
    .flatMap((operationId) => {
      const operation = getReferenceOperation(operationId);
      return operation ? [operation] : [];
    })
    .sort(compareOperationIds);
}

function compareOperationIds(
  left: Pick<ReferenceOperationSummary, 'operationId'>,
  right: Pick<ReferenceOperationSummary, 'operationId'>,
) {
  return left.operationId.localeCompare(right.operationId);
}
