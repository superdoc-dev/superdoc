export function toV2BulkDecisionEvent(documentId, fact) {
  if (fact?.schemaVersion !== 1 || (fact.decision !== 'accept' && fact.decision !== 'reject')) {
    return null;
  }

  return {
    documentId: typeof documentId === 'string' ? documentId : null,
    decision: fact.decision,
    requestedCount: fact.requestedCount,
    successfulCount: fact.appliedCount,
    permissionDeniedCount: fact.deniedCount,
  };
}
