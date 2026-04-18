import { Plugin, PluginKey } from 'prosemirror-state';
import { Mapping } from 'prosemirror-transform';
import { ySyncPluginKey } from 'y-prosemirror';
import { Extension } from '@core/Extension.js';
import {
  isReadOnlyProtectionRuntimeEnforced,
  applyEffectiveEditability,
  buildAllowedIdentifierSetFromEditor,
} from '../protection/editability.js';

/**
 * Meta key set by permissionRanges.create / remove / updatePrincipal adapters
 * to signal intentional mutations that should bypass the repair appendTransaction.
 */
export const PERMISSION_MUTATION_META = 'permissionRangeMutation';

const PERMISSION_PLUGIN_KEY = new PluginKey('permissionRanges');
const EVERYONE_GROUP = 'everyone';
const EMPTY_IDENTIFIER_SET = Object.freeze(new Set());

const normalizeIdentifier = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const isEveryoneGroup = (value) => normalizeIdentifier(value) === EVERYONE_GROUP;

const isRangeAllowedForUser = (attrs, allowedIdentifiers) => {
  if (!attrs) return false;
  if (isEveryoneGroup(attrs.edGrp)) return true;
  if (!allowedIdentifiers?.size) return false;
  const normalizedEd = normalizeIdentifier(attrs.ed);
  return normalizedEd && allowedIdentifiers.has(normalizedEd);
};

const getPermissionTypeInfo = (schema) => {
  const startTypes = [];
  const endTypes = [];
  const permStartType = schema?.nodes?.['permStart'];
  const permStartBlockType = schema?.nodes?.['permStartBlock'];
  const permEndType = schema?.nodes?.['permEnd'];
  const permEndBlockType = schema?.nodes?.['permEndBlock'];

  if (permStartType) startTypes.push(permStartType);
  if (permStartBlockType) startTypes.push(permStartBlockType);
  if (permEndType) endTypes.push(permEndType);
  if (permEndBlockType) endTypes.push(permEndBlockType);

  return {
    startTypes,
    endTypes,
    startTypeSet: new Set(startTypes),
    endTypeSet: new Set(endTypes),
    allTypeSet: new Set([...startTypes, ...endTypes]),
  };
};

const getPermissionNodeId = (node, pos, fallbackPrefix) => String(node.attrs?.id ?? `${fallbackPrefix}-${pos}`);

/**
 * Derive the principal model from a permStart node's attrs.
 * @param {Record<string, unknown>} attrs
 * @returns {{ kind: string, id?: string }}
 */
const derivePrincipal = (attrs) => {
  if (isEveryoneGroup(attrs?.edGrp)) return { kind: 'everyone' };
  if (attrs?.ed) return { kind: 'editor', id: String(attrs.ed) };
  return { kind: 'everyone' };
};

/**
 * Parse permStart/permEnd pairs and return both allRanges (unfiltered) and
 * allowedRanges (filtered by current user AND protection enforcement).
 *
 * @param {import('prosemirror-model').Node} doc
 * @param {Set<string>} allowedIdentifiers
 * @param {ReturnType<typeof getPermissionTypeInfo>} permTypes
 * @param {boolean} protectionEnforced - whether readOnly protection is runtime-enforced
 * @returns {{ allRanges: Array, allowedRanges: Array, hasAllowedRanges: boolean }}
 */
const buildPermissionState = (
  doc,
  allowedIdentifiers = EMPTY_IDENTIFIER_SET,
  permTypes,
  protectionEnforced = false,
) => {
  const allRanges = [];
  const allowedRanges = [];
  /** @type {Map<string, { from: number, startPos: number, attrs: Record<string, unknown>, isBlock: boolean }>} */
  const openRanges = new Map();
  const startTypeSet = permTypes?.startTypeSet ?? new Set();
  const endTypeSet = permTypes?.endTypeSet ?? new Set();
  const blockStartType = doc.type.schema?.nodes?.['permStartBlock'];
  const blockEndType = doc.type.schema?.nodes?.['permEndBlock'];

  doc.descendants((node, pos) => {
    if (startTypeSet.has(node.type)) {
      const id = getPermissionNodeId(node, pos, 'permStart');
      openRanges.set(id, {
        from: pos + node.nodeSize,
        startPos: pos,
        attrs: node.attrs ?? {},
        isBlock: node.type === blockStartType,
      });
      return false;
    }

    if (endTypeSet.has(node.type)) {
      const id = getPermissionNodeId(node, pos, 'permEnd');
      const start = openRanges.get(id);
      if (start) {
        const to = Math.max(pos, start.from);
        if (to > start.from) {
          const isBlock = start.isBlock || node.type === blockEndType;
          const entry = {
            id,
            from: start.from,
            to,
            startPos: start.startPos,
            endPos: pos,
            principal: derivePrincipal(start.attrs),
            kind: isBlock ? 'block' : 'inline',
            // Preserve raw attrs for legacy compatibility
            edGrp: start.attrs.edGrp,
            ed: start.attrs.ed,
          };

          allRanges.push(entry);

          // Only add to allowedRanges if protection is enforced AND user matches
          if (protectionEnforced && isRangeAllowedForUser(start.attrs, allowedIdentifiers)) {
            allowedRanges.push(entry);
          }
        }
        openRanges.delete(id);
      }
      return false;
    }
  });

  return {
    allRanges,
    allowedRanges,
    hasAllowedRanges: allowedRanges.length > 0,
    // Legacy compat: `ranges` points to allowedRanges
    ranges: allowedRanges,
  };
};

/**
 * Collects permStart/permEnd tags keyed by id.
 */
const collectPermissionTags = (doc, permStartTypes, permEndTypes) => {
  const tags = new Map();
  const permStartTypeSet = new Set(permStartTypes);
  const permEndTypeSet = new Set(permEndTypes);

  doc.descendants((node, pos) => {
    if (!permStartTypeSet.has(node.type) && !permEndTypeSet.has(node.type)) return;
    const id = node.attrs?.id;
    if (!id) return;

    const entry = tags.get(id) ?? {};
    if (permStartTypeSet.has(node.type)) {
      entry.start = { pos, attrs: node.attrs ?? {}, nodeType: node.type };
    } else if (permEndTypeSet.has(node.type)) {
      entry.end = { pos, attrs: node.attrs ?? {}, nodeType: node.type };
    }
    tags.set(id, entry);
  });

  return tags;
};

const clampPosition = (pos, size) => {
  if (Number.isNaN(pos) || !Number.isFinite(pos)) return 0;
  return Math.max(0, Math.min(pos, size));
};

const trimPermissionTagsFromRange = (doc, range, permTagTypes) => {
  let from = range.from;
  let to = range.to;

  while (from < to) {
    const node = doc.nodeAt(from);
    if (!node || !permTagTypes.has(node.type)) break;
    from += node.nodeSize;
  }

  while (to > from) {
    const $pos = doc.resolve(to);
    const nodeBefore = $pos.nodeBefore;
    if (!nodeBefore || !permTagTypes.has(nodeBefore.type)) break;
    to -= nodeBefore.nodeSize;
  }

  return { from, to };
};

const collectChangedRanges = (tr) => {
  const ranges = [];
  tr.mapping.maps.forEach((map) => {
    map.forEach((oldStart, oldEnd) => {
      const from = Math.min(oldStart, oldEnd);
      const to = Math.max(oldStart, oldEnd);
      ranges.push({ from, to });
    });
  });
  return ranges;
};

const isRangeAllowed = (range, allowedRanges) => {
  if (!allowedRanges?.length) return false;
  return allowedRanges.some((allowed) => range.from >= allowed.from && range.to <= allowed.to);
};

/**
 * @module PermissionRanges
 * Extension that manages permission range editability.
 *
 * When read-only protection is runtime-enforced, content within allowed
 * permission ranges (matching the current user) becomes editable.
 * When protection is not enforced, permission ranges are preserved but inactive.
 */
export const PermissionRanges = Extension.create({
  name: 'permissionRanges',

  addStorage() {
    return {
      /** @type {Array} All permission ranges in the document (unfiltered). Used by document-api adapters. */
      allRanges: [],
      /** @type {Array} Ranges allowed for the current user when protection is enforced. Used by edit enforcement. */
      allowedRanges: [],
      /** Whether allowedRanges is non-empty. */
      hasAllowedRanges: false,
      /** @deprecated Legacy alias for allowedRanges. */
      ranges: [],
    };
  },

  addPmPlugins() {
    const editor = this.editor;
    const storage = this.storage;
    const getAllowedIdentifiers = () => buildAllowedIdentifierSetFromEditor(editor);

    return [
      new Plugin({
        key: PERMISSION_PLUGIN_KEY,
        state: {
          init(_, state) {
            const permissionTypeInfo = getPermissionTypeInfo(state.schema);
            const protectionEnforced = isReadOnlyProtectionRuntimeEnforced(editor);
            const permissionState = buildPermissionState(
              state.doc,
              getAllowedIdentifiers(),
              permissionTypeInfo,
              protectionEnforced,
            );

            storage.allRanges = permissionState.allRanges;
            storage.allowedRanges = permissionState.allowedRanges;
            storage.hasAllowedRanges = permissionState.hasAllowedRanges;
            storage.ranges = permissionState.ranges;

            // Apply editability through the single-owner helper
            applyEffectiveEditability(editor, { refilterRanges: false });

            return permissionState;
          },

          apply(tr, value, _oldState, newState) {
            if (!tr.docChanged) return value;

            const permissionTypeInfo = getPermissionTypeInfo(newState.schema);
            const protectionEnforced = isReadOnlyProtectionRuntimeEnforced(editor);
            const permissionState = buildPermissionState(
              newState.doc,
              getAllowedIdentifiers(),
              permissionTypeInfo,
              protectionEnforced,
            );

            storage.allRanges = permissionState.allRanges;
            storage.allowedRanges = permissionState.allowedRanges;
            storage.hasAllowedRanges = permissionState.hasAllowedRanges;
            storage.ranges = permissionState.ranges;

            // Apply editability (skip refilter since we just computed ranges)
            applyEffectiveEditability(editor, { refilterRanges: false });

            return permissionState;
          },
        },

        appendTransaction(transactions, oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;

          // Skip repair for intentional permission-range mutations
          if (transactions.some((tr) => tr.getMeta?.(PERMISSION_MUTATION_META))) return null;

          // Skip repair for y-prosemirror collaborative syncs
          if (transactions.some((tr) => tr.getMeta?.(ySyncPluginKey))) return null;

          const permTypes = getPermissionTypeInfo(newState.schema);
          if (!permTypes.startTypes.length || !permTypes.endTypes.length) return null;

          const oldTags = collectPermissionTags(oldState.doc, permTypes.startTypes, permTypes.endTypes);
          if (!oldTags.size) return null;
          const newTags = collectPermissionTags(newState.doc, permTypes.startTypes, permTypes.endTypes);

          const mappingToNew = new Mapping();
          transactions.forEach((tr) => {
            mappingToNew.appendMapping(tr.mapping);
          });

          const pendingInsertions = [];

          oldTags.forEach((tag, id) => {
            const current = newTags.get(id);
            if (tag.start && !current?.start) {
              const mapped = mappingToNew.mapResult(tag.start.pos, -1);
              pendingInsertions.push({
                pos: mapped.pos,
                nodeType: tag.start.nodeType,
                attrs: tag.start.attrs,
                priority: 0,
              });
            }
            if (tag.end && !current?.end) {
              const mapped = mappingToNew.mapResult(tag.end.pos, 1);
              pendingInsertions.push({
                pos: mapped.pos,
                nodeType: tag.end.nodeType,
                attrs: tag.end.attrs,
                priority: 1,
              });
            }
          });

          if (!pendingInsertions.length) return null;

          pendingInsertions.sort((a, b) => {
            if (a.pos === b.pos) return a.priority - b.priority;
            return a.pos - b.pos;
          });

          const tr = newState.tr;
          let offset = 0;
          pendingInsertions.forEach((item) => {
            if (!item.nodeType) return;
            const node = item.nodeType.create(item.attrs);
            const insertPos = clampPosition(item.pos + offset, tr.doc.content.size);
            tr.insert(insertPos, node);
            offset += node.nodeSize;
          });

          return tr.docChanged ? tr : null;
        },

        // Gate edits on protection state, not documentMode
        filterTransaction(tr, state) {
          if (!tr.docChanged) return true;
          if (tr.getMeta?.(ySyncPluginKey)) return true;
          if (tr.getMeta?.(PERMISSION_MUTATION_META)) return true;
          if (!editor) return true;

          // Only filter when read-only protection is runtime-enforced
          if (!isReadOnlyProtectionRuntimeEnforced(editor)) return true;

          // Read from extension storage (kept up-to-date by applyEffectiveEditability)
          // rather than PM plugin state which may be stale after protection changes.
          const activeRanges = storage.allowedRanges ?? storage.ranges;
          if (!activeRanges?.length) {
            // No allowed ranges — block all doc-changing transactions
            return false;
          }

          const changedRanges = collectChangedRanges(tr);
          if (!changedRanges.length) return true;

          const permTypes = getPermissionTypeInfo(state.schema);
          if (!permTypes.startTypes.length || !permTypes.endTypes.length) return true;

          return changedRanges.every((range) => {
            const trimmed = trimPermissionTagsFromRange(state.doc, range, permTypes.allTypeSet);
            return isRangeAllowed(trimmed, activeRanges);
          });
        },
      }),
    ];
  },
});
