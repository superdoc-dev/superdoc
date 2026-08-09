/**
 * Classify the tracked-change identities carried by a v2 mutation event.
 *
 * Receipt entities are the durable invalidation contract between the document
 * kernel and derived review UI. Consumers apply removals/remaps locally; the
 * next committed window supplies surviving or restored rows. History follows
 * the same bounded path and never enumerates invisible review identities.
 */
export function getV2TrackedChangeMutationImpact(event) {
  if (event?.type !== 'mutation:committed') return null;
  const payload = event.origin === 'history' ? event.result : event.receipt;
  if (!payload || typeof payload !== 'object') return null;

  const upsertIds = new Set();
  const removedIds = new Set();
  /** @type {Array<{ from: string, to: string }>} */
  const remappedPairs = [];
  const collectEntity = (entry, into) => {
    if (entry?.kind !== 'entity' || entry.entityType !== 'trackedChange') return;
    if (typeof entry.entityId === 'string' && entry.entityId.length > 0) into.add(entry.entityId);
  };
  const readEntityId = (entry) => {
    if (entry?.kind !== 'entity' || entry.entityType !== 'trackedChange') return null;
    return typeof entry.entityId === 'string' && entry.entityId.length > 0 ? entry.entityId : null;
  };

  if (Array.isArray(payload.inserted)) payload.inserted.forEach((entry) => collectEntity(entry, upsertIds));
  if (Array.isArray(payload.updated)) payload.updated.forEach((entry) => collectEntity(entry, upsertIds));
  // Structural host receipts keep their block delta in the legacy top-level
  // `inserted`/`removed` slots for narrow projection invalidation. Preserve the
  // Document API's explicit tracked-change refs alongside that shape so review
  // rows can still reconcile narrowly instead of waiting for a full-list idle
  // refresh.
  if (Array.isArray(payload.trackedChangeRefs)) {
    payload.trackedChangeRefs.forEach((entry) => collectEntity(entry, upsertIds));
  }
  if (Array.isArray(payload.removed)) payload.removed.forEach((entry) => collectEntity(entry, removedIds));
  if (Array.isArray(payload.invalidatedRefs)) {
    payload.invalidatedRefs.forEach((entry) => collectEntity(entry, removedIds));
  }
  if (Array.isArray(payload.remappedRefs)) {
    for (const mapping of payload.remappedRefs) {
      const fromId = readEntityId(mapping?.from);
      const toId = readEntityId(mapping?.to);
      if (fromId) removedIds.add(fromId);
      if (toId) upsertIds.add(toId);
      if (fromId && toId && fromId !== toId) {
        remappedPairs.push({ from: fromId, to: toId });
      }
    }
  }

  for (const id of removedIds) upsertIds.delete(id);
  const allResolved = readAllResolvedFact(event, payload);
  if (upsertIds.size === 0 && removedIds.size === 0 && !allResolved) return null;
  return {
    upsertIds,
    removedIds,
    remappedPairs,
    reconcileMode: 'targeted',
    ...(allResolved ? { allResolved } : {}),
  };
}

function readAllResolvedFact(event, receipt) {
  const fact = event?.trackedChangeAllResolved;
  if (
    event?.origin === 'history' ||
    !fact ||
    fact.schemaVersion !== 1 ||
    fact.targetKind !== 'all' ||
    (fact.decision !== 'accept' && fact.decision !== 'reject') ||
    fact.remainingLogicalCount !== 0 ||
    typeof fact.catalogRevision !== 'string' ||
    !fact.catalogRevision ||
    typeof fact.sourceCoverageRevision !== 'string' ||
    !fact.sourceCoverageRevision ||
    !Number.isSafeInteger(fact.logicalTargetCount) ||
    fact.logicalTargetCount <= 0 ||
    !Number.isSafeInteger(fact.physicalCarrierCount) ||
    fact.physicalCarrierCount < fact.logicalTargetCount ||
    typeof fact.txId !== 'string' ||
    fact.txId !== receipt.txId ||
    typeof fact.documentEpoch !== 'string' ||
    !Number.isSafeInteger(fact.commitSequence) ||
    typeof fact.packagePreviousRevision !== 'string' ||
    typeof fact.packageNextRevision !== 'string' ||
    fact.packagePreviousRevision === fact.packageNextRevision
  )
    return null;
  return fact;
}
