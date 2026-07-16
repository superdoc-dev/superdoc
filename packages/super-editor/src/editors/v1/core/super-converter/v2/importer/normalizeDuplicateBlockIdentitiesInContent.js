import {
  shouldSynthesizeParaIdForType,
  createDeterministicDocxIdAllocator,
  getExplicitIdentityEntries,
  groupIdentityEntriesByValue,
} from './block-identity-renaming.js';

function collectExplicitBlockIdentities(node, reservedIds) {
  if (!node || typeof node !== 'object') return;

  const identityEntries = getExplicitIdentityEntries(node.attrs, node?.type);
  for (const { value } of groupIdentityEntriesByValue(identityEntries)) {
    reservedIds.add(value);
  }

  if (Array.isArray(node.content)) {
    node.content.forEach((child) => collectExplicitBlockIdentities(child, reservedIds));
  }
}

function setBlockIdentity(node, attrName, value) {
  node.attrs = { ...(node.attrs ?? {}), [attrName]: value };
}

function normalizeBlockIdentitiesInNode(node, seenIds, allocateDocxId) {
  if (!node || typeof node !== 'object') return;

  const identityEntries = getExplicitIdentityEntries(node.attrs, node?.type);
  const groupedIdentities = groupIdentityEntriesByValue(identityEntries);

  if (groupedIdentities.length > 0) {
    for (const identityGroup of groupedIdentities) {
      if (seenIds.has(identityGroup.value)) {
        const replacementId = allocateDocxId();
        for (const attr of identityGroup.attrs) {
          setBlockIdentity(node, attr, replacementId);
        }
        seenIds.add(replacementId);
      } else {
        seenIds.add(identityGroup.value);
      }
    }
  } else if (shouldSynthesizeParaIdForType(node?.type)) {
    const syntheticParaId = allocateDocxId();
    setBlockIdentity(node, 'paraId', syntheticParaId);
    seenIds.add(syntheticParaId);
  }

  if (Array.isArray(node.content)) {
    node.content.forEach((child) => normalizeBlockIdentitiesInNode(child, seenIds, allocateDocxId));
  }
}

/**
 * Normalize imported block identities so document-api targeting remains stable.
 *
 * Word files can occasionally contain duplicate stable block IDs across blocks.
 * Some exporters also omit `w14:paraId` entirely, leaving imported blocks with
 * no stable public identity and forcing the adapter layer to fall back to the
 * volatile `sdBlockId` assigned at editor startup.
 *
 * This pass fixes both cases:
 * - rewrites duplicate explicit identity values while preserving the first
 *   explicit occurrence of each value
 * - reserves every explicit identity value up front so synthesized IDs never
 *   collide with a non-primary but still-public identifier such as paragraph
 *   `paraId`
 * - synthesizes deterministic `paraId` values for schema-valid block types
 *   that arrive with no stable identity at all
 *
 * Only block identity attributes are rewritten or synthesized: sdBlockId,
 * paraId, and blockId.
 *
 * @param {Array<{type?: string, attrs?: Record<string, unknown>, content?: unknown[]}>} content
 * @returns {Array<{type?: string, attrs?: Record<string, unknown>, content?: unknown[]}>}
 */
export function normalizeDuplicateBlockIdentitiesInContent(content = []) {
  if (!Array.isArray(content) || content.length === 0) return content;

  const reservedIds = new Set();
  content.forEach((node) => collectExplicitBlockIdentities(node, reservedIds));

  const allocateDocxId = createDeterministicDocxIdAllocator(reservedIds);
  const seenIds = new Set();
  content.forEach((node) => normalizeBlockIdentitiesInNode(node, seenIds, allocateDocxId));

  return content;
}
