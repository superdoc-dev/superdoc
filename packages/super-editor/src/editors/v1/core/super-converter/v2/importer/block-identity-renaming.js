/**
 * Block-identity renaming primitives shared between the import-time JSON pass
 * (`normalizeDuplicateBlockIdentitiesInContent`) and the runtime PM-state pass
 * (`repairDuplicateBlockIdentities` in the plan engine).
 *
 * Both consumers need the same renaming semantics so a document that is
 * deduped at import behaves identically to a document that is deduped at
 * plan-compile time after a collab/Yjs restore.
 *
 * Identity rules (unchanged from the original normalizer):
 * - `PARAGRAPH_IDENTITY_ATTRS` lists the attrs that contribute to a paragraph's
 *   stable identity, in priority order. Paragraphs prefer `sdBlockId` then
 *   `paraId` for the rename target — i.e. whichever provided the value first.
 * - Tables and table descendants also accept the legacy `blockId` attr.
 * - `SYNTHETIC_PARA_ID_TYPES` enumerates block types that get a synthesized
 *   `paraId` when they arrive with no identity at all (paragraph and tableRow).
 * - Replacement IDs are 8-uppercase-hex strings, allocated deterministically
 *   starting at `0x00000001`, skipping any IDs already reserved by the doc.
 */

const PARAGRAPH_IDENTITY_ATTRS = ['sdBlockId', 'paraId'];
const TABLE_IDENTITY_ATTRS = ['sdBlockId', 'paraId', 'blockId'];
const DEFAULT_BLOCK_IDENTITY_ATTRS = ['sdBlockId', 'blockId', 'paraId'];

/** @type {ReadonlySet<string>} */
const SYNTHETIC_PARA_ID_TYPES = new Set(['paragraph', 'tableRow']);

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

/**
 * Coerce a value into a non-empty identity string, or return `undefined`.
 * Mirrors the import-time helper so number-like ids survive the same way.
 *
 * @param {unknown} value
 * @returns {string | undefined}
 */
export function toIdentityValue(value) {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * @param {string | undefined | null} typeName
 * @returns {ReadonlyArray<string>}
 */
export function getBlockIdentityAttrsForType(typeName) {
  if (!typeName) return [];
  return BLOCK_IDENTITY_ATTRS[typeName] ?? [];
}

/**
 * @param {string | undefined | null} typeName
 * @returns {boolean}
 */
export function shouldSynthesizeParaIdForType(typeName) {
  return Boolean(typeName && SYNTHETIC_PARA_ID_TYPES.has(typeName));
}

/**
 * Allocates deterministic 8-hex IDs starting at 0x00000001, skipping any ID
 * already present in `reservedIds`. The allocator mutates `reservedIds` so
 * future calls do not reissue the same value. Throws if every slot up to
 * `0xFFFFFFFF` is taken (effectively unreachable in practice).
 *
 * @param {Set<string>} reservedIds
 * @returns {() => string}
 */
/**
 * @typedef {{ attr: string, value: string }} IdentityEntry
 * @typedef {{ value: string, attrs: string[] }} IdentityGroup
 */

/**
 * Read the explicit identity attrs a block-like node carries, in the priority
 * order declared by `BLOCK_IDENTITY_ATTRS`. The two callers (importer JSON
 * content + runtime PM nodes) derive `attrs` and `typeName` differently but
 * apply the same grouping rule afterwards — this helper centralizes the rule
 * so the two paths cannot drift.
 *
 * @param {Record<string, unknown> | null | undefined} attrs
 * @param {string | null | undefined} typeName
 * @returns {IdentityEntry[]}
 */
export function getExplicitIdentityEntries(attrs, typeName) {
  const attrPriority = getBlockIdentityAttrsForType(typeName);
  if (attrPriority.length === 0) return [];

  const safeAttrs = attrs && typeof attrs === 'object' ? attrs : {};
  const identityEntries = [];
  for (const attr of attrPriority) {
    const value = toIdentityValue(safeAttrs[attr]);
    if (value) {
      identityEntries.push({ attr, value });
    }
  }
  return identityEntries;
}

/**
 * Group identity entries by their value. A single node can supply multiple
 * attrs that all carry the same identity string (e.g. a paragraph whose
 * `paraId` and `sdBlockId` happen to match); those collapse into one group so
 * a rename touches every reference at once.
 *
 * @param {IdentityEntry[]} identityEntries
 * @returns {IdentityGroup[]}
 */
export function groupIdentityEntriesByValue(identityEntries) {
  const groupsByValue = new Map();
  for (const entry of identityEntries) {
    const existingGroup = groupsByValue.get(entry.value);
    if (existingGroup) {
      existingGroup.attrs.push(entry.attr);
      continue;
    }
    groupsByValue.set(entry.value, { value: entry.value, attrs: [entry.attr] });
  }
  return [...groupsByValue.values()];
}

export function createDeterministicDocxIdAllocator(reservedIds) {
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
