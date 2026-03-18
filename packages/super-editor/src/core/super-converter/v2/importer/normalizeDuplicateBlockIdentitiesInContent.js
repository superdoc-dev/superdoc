const PARAGRAPH_IDENTITY_ATTRS = ['sdBlockId', 'paraId'];
const TABLE_IDENTITY_ATTRS = ['sdBlockId', 'paraId', 'blockId'];
const DEFAULT_BLOCK_IDENTITY_ATTRS = ['sdBlockId', 'blockId', 'paraId'];
const SYNTHETIC_PARA_ID_TYPES = new Set(['paragraph', 'table', 'tableRow', 'tableCell', 'tableHeader']);
const DOCX_ID_LENGTH = 8;
const MAX_DOCX_ID = 0xffffffff;

/** Maps block node types to safe block-identity attribute lookup order. */
const BLOCK_IDENTITY_ATTRS = {
  paragraph: PARAGRAPH_IDENTITY_ATTRS,
  heading: DEFAULT_BLOCK_IDENTITY_ATTRS,
  listItem: DEFAULT_BLOCK_IDENTITY_ATTRS,
  table: TABLE_IDENTITY_ATTRS,
  tableRow: TABLE_IDENTITY_ATTRS,
  tableCell: TABLE_IDENTITY_ATTRS,
  tableHeader: TABLE_IDENTITY_ATTRS,
  sdt: DEFAULT_BLOCK_IDENTITY_ATTRS,
  structuredContentBlock: DEFAULT_BLOCK_IDENTITY_ATTRS,
};

function toIdentityValue(value) {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function resolvePrimaryBlockIdentity(node) {
  if (!node || typeof node !== 'object') return undefined;

  const attrPriority = BLOCK_IDENTITY_ATTRS[node.type];
  if (!attrPriority) return undefined;

  const attrs = typeof node.attrs === 'object' && node.attrs ? node.attrs : {};
  for (const attr of attrPriority) {
    const value = toIdentityValue(attrs[attr]);
    if (value) return { id: value, source: attr };
  }
  return undefined;
}

function shouldSynthesizeParaId(node) {
  return Boolean(node && typeof node === 'object' && SYNTHETIC_PARA_ID_TYPES.has(node.type));
}

function collectExplicitBlockIdentities(node, reservedIds) {
  if (!node || typeof node !== 'object') return;

  const identity = resolvePrimaryBlockIdentity(node);
  if (identity) {
    reservedIds.add(identity.id);
  }

  if (Array.isArray(node.content)) {
    node.content.forEach((child) => collectExplicitBlockIdentities(child, reservedIds));
  }
}

function createDeterministicDocxIdAllocator(reservedIds) {
  let nextValue = 1;

  return () => {
    while (nextValue <= MAX_DOCX_ID) {
      const id = nextValue.toString(16).toUpperCase().padStart(DOCX_ID_LENGTH, '0');
      nextValue += 1;

      if (reservedIds.has(id)) continue;

      reservedIds.add(id);
      return id;
    }

    throw new Error('Unable to allocate a unique synthetic DOCX block id.');
  };
}

function setBlockIdentity(node, attrName, value) {
  node.attrs = { ...(node.attrs ?? {}), [attrName]: value };
}

function normalizeBlockIdentitiesInNode(node, seenIds, allocateDocxId) {
  if (!node || typeof node !== 'object') return;

  const identity = resolvePrimaryBlockIdentity(node);
  if (identity) {
    if (seenIds.has(identity.id)) {
      const replacementId = allocateDocxId();
      setBlockIdentity(node, identity.source, replacementId);
      seenIds.add(replacementId);
    } else {
      seenIds.add(identity.id);
    }
  } else if (shouldSynthesizeParaId(node)) {
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
 * - rewrites duplicate stable IDs while preserving the first explicit occurrence
 * - synthesizes deterministic `paraId` values for paragraph/table-family nodes
 *   that arrive with no stable identity at all
 *
 * Only safe block identity attributes are rewritten or synthesized: sdBlockId,
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
