import { generateDocxRandomId } from '@core/helpers/generateDocxRandomId.js';

const PARAGRAPH_IDENTITY_ATTRS = ['sdBlockId', 'paraId'];
const TABLE_IDENTITY_ATTRS = ['sdBlockId', 'paraId', 'blockId'];
const DEFAULT_BLOCK_IDENTITY_ATTRS = ['sdBlockId', 'blockId', 'paraId'];

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

function nextUniqueDocxId(usedIds) {
  let id = generateDocxRandomId();
  while (usedIds.has(id)) {
    id = generateDocxRandomId();
  }
  return id;
}

function dedupeBlockIdentitiesInNode(node, usedIds) {
  if (!node || typeof node !== 'object') return;

  const identity = resolvePrimaryBlockIdentity(node);
  if (identity) {
    if (usedIds.has(identity.id)) {
      const replacementId = nextUniqueDocxId(usedIds);
      node.attrs = { ...node.attrs, [identity.source]: replacementId };
      usedIds.add(replacementId);
    } else {
      usedIds.add(identity.id);
    }
  }

  if (Array.isArray(node.content)) {
    node.content.forEach((child) => dedupeBlockIdentitiesInNode(child, usedIds));
  }
}

/**
 * Deduplicate block identities during import so document-api targeting remains stable.
 *
 * Word files can occasionally contain duplicate stable block IDs across blocks.
 * Since stable IDs are used for deterministic targeting in the adapters,
 * duplicates break deterministic targeting and mutations.
 *
 * Only safe block identity attributes are rewritten: sdBlockId, paraId, and blockId.
 *
 * @param {Array<{type?: string, attrs?: Record<string, unknown>, content?: unknown[]}>} content
 * @returns {Array<{type?: string, attrs?: Record<string, unknown>, content?: unknown[]}>}
 */
export function normalizeDuplicateBlockIdentitiesInContent(content = []) {
  if (!Array.isArray(content) || content.length === 0) return content;

  const usedIds = new Set();
  content.forEach((node) => dedupeBlockIdentitiesInNode(node, usedIds));

  return content;
}
