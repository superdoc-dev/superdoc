import { Plugin, PluginKey } from 'prosemirror-state';
import { Mapping } from 'prosemirror-transform';
import { Extension } from '@core/Extension.js';

const PERMISSION_PLUGIN_KEY = new PluginKey('permissionRanges');
const EVERYONE_GROUP = 'everyone';
const EMPTY_IDENTIFIER_SET = Object.freeze(new Set());

const normalizeIdentifier = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const buildAllowedIdentifierSet = (editor) => {
  const email = normalizeIdentifier(editor?.options?.user?.email);
  if (!email) {
    return EMPTY_IDENTIFIER_SET;
  }
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) {
    return EMPTY_IDENTIFIER_SET;
  }
  const formatted = `${domain}\\${localPart}`;
  return formatted ? new Set([formatted]) : EMPTY_IDENTIFIER_SET;
};

const isEveryoneGroup = (value) => normalizeIdentifier(value) === EVERYONE_GROUP;

const isRangeAllowedForUser = (attrs, allowedIdentifiers) => {
  if (!attrs) return false;
  if (isEveryoneGroup(attrs.edGrp)) {
    return true;
  }
  if (!allowedIdentifiers?.size) {
    return false;
  }
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

/**
 * Generates the identifier used to match permStart/permEnd pairs.
 * @param {import('prosemirror-model').Node} node
 * @param {number} pos
 * @param {string} fallbackPrefix
 * @returns {string}
 */
const getPermissionNodeId = (node, pos, fallbackPrefix) => String(node.attrs?.id ?? `${fallbackPrefix}-${pos}`);
/**
 * Parse permStart/permEnd pairs and return ranges.
 * @param {import('prosemirror-model').Node} doc
 * @param {{ startTypeSet: Set<import('prosemirror-model').NodeType>, endTypeSet: Set<import('prosemirror-model').NodeType> }} permTypes
 * @returns {{ ranges: Array<{ id: string, from: number, to: number }>, hasAllowedRanges: boolean }}
 */
const buildPermissionState = (doc, allowedIdentifiers = EMPTY_IDENTIFIER_SET, permTypes) => {
  const ranges = [];
  /** @type {Map<string, { from: number, attrs: any }>} */
  const openRanges = new Map();
  const startTypeSet = permTypes?.startTypeSet ?? new Set();
  const endTypeSet = permTypes?.endTypeSet ?? new Set();

  doc.descendants((node, pos) => {
    if (startTypeSet.has(node.type)) {
      const id = getPermissionNodeId(node, pos, 'permStart');
      openRanges.set(id, {
        from: pos + node.nodeSize,
        attrs: node.attrs ?? {},
      });
      return false;
    }

    if (endTypeSet.has(node.type)) {
      const id = getPermissionNodeId(node, pos, 'permEnd');
      const start = openRanges.get(id);
      if (start && isRangeAllowedForUser(start.attrs, allowedIdentifiers)) {
        const to = Math.max(pos, start.from);
        if (to > start.from) {
          ranges.push({
            id,
            from: start.from,
            to,
          });
        }
      }
      if (start) {
        openRanges.delete(id);
      }
      return false;
    }
  });

  return {
    ranges,
    hasAllowedRanges: ranges.length > 0,
  };
};

/**
 * Collects permStart/permEnd tags keyed by id.
 * @param {import('prosemirror-model').Node} doc
 * @param {import('prosemirror-model').NodeType[]} permStartTypes
 * @param {import('prosemirror-model').NodeType[]} permEndTypes
 * @returns {Map<string, { start?: { pos: number, attrs: any, nodeType: import('prosemirror-model').NodeType }, end?: { pos: number, attrs: any, nodeType: import('prosemirror-model').NodeType } }>}
 */
const collectPermissionTags = (doc, permStartTypes, permEndTypes) => {
  /** @type {Map<string, { start?: { pos: number, attrs: any, nodeType: import('prosemirror-model').NodeType }, end?: { pos: number, attrs: any, nodeType: import('prosemirror-model').NodeType } }>} */
  const tags = new Map();
  const permStartTypeSet = new Set(permStartTypes);
  const permEndTypeSet = new Set(permEndTypes);

  doc.descendants((node, pos) => {
    if (!permStartTypeSet.has(node.type) && !permEndTypeSet.has(node.type)) {
      return;
    }
    const id = node.attrs?.id;
    if (!id) {
      return;
    }

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
  if (Number.isNaN(pos) || !Number.isFinite(pos)) {
    return 0;
  }
  return Math.max(0, Math.min(pos, size));
};

/**
 * Removes leading/trailing perm tags from a changed range so edits that touch
 * permStart/permEnd boundaries can still be evaluated against allowed content.
 * @param {import('prosemirror-model').Node} doc
 * @param {{ from: number, to: number }} range
 * @param {Set<import('prosemirror-model').NodeType>} permTagTypes
 * @returns {{ from: number, to: number }}
 */
const trimPermissionTagsFromRange = (doc, range, permTagTypes) => {
  let from = range.from;
  let to = range.to;

  while (from < to) {
    const node = doc.nodeAt(from);
    if (!node || !permTagTypes.has(node.type)) {
      break;
    }
    from += node.nodeSize;
  }

  while (to > from) {
    const $pos = doc.resolve(to);
    const nodeBefore = $pos.nodeBefore;
    if (!nodeBefore || !permTagTypes.has(nodeBefore.type)) {
      break;
    }
    to -= nodeBefore.nodeSize;
  }

  return { from, to };
};

/**
 * Collects the ranges affected by a transaction, based on the document BEFORE the change.
 * @param {import('prosemirror-state').Transaction} tr
 * @returns {Array<{ from: number, to: number }>}
 */
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

/**
 * Checks if affected range is entirely within an allowed permission range.
 * @param {{ from: number, to: number }} range
 * @param {Array<{ from: number, to: number }>} allowedRanges
 */
const isRangeAllowed = (range, allowedRanges) => {
  if (!allowedRanges?.length) return false;
  return allowedRanges.some((allowed) => range.from >= allowed.from && range.to <= allowed.to);
};

/**
 * @module PermissionRanges
 * A helper extension that ensures content wrapped with w:permStart/w:permEnd and `edGrp="everyone"`
 * stays editable even when the document is in viewing mode.
 */
export const PermissionRanges = Extension.create({
  name: 'permissionRanges',

  addStorage() {
    return {
      ranges: [],
      hasAllowedRanges: false,
    };
  },

  addPmPlugins() {
    const editor = this.editor;
    const storage = this.storage;
    let originalSetDocumentMode = null;
    const getAllowedIdentifiers = () => buildAllowedIdentifierSet(editor);

    const toggleEditableIfAllowed = (hasAllowedRanges) => {
      if (!editor || editor.isDestroyed) return;
      if (editor.options.documentMode !== 'viewing') return;
      if (hasAllowedRanges && !editor.isEditable) {
        editor.setEditable(true, false);
      } else if (!hasAllowedRanges && editor.isEditable) {
        editor.setEditable(false, false);
      }
    };
    const updateEditableState = (hasAllowedRanges) => {
      const nextValue = Boolean(hasAllowedRanges);
      const previousValue = storage.hasAllowedRanges;
      storage.hasAllowedRanges = nextValue;
      if (previousValue === nextValue) {
        return;
      }
      toggleEditableIfAllowed(nextValue);
    };

    if (editor && typeof editor.setDocumentMode === 'function') {
      originalSetDocumentMode = editor.setDocumentMode.bind(editor);
      editor.setDocumentMode = (mode, caller) => {
        originalSetDocumentMode(mode, caller);
        const state = editor.state;
        if (!state) return;
        const pluginState = PERMISSION_PLUGIN_KEY.getState(state);
        if (pluginState) {
          toggleEditableIfAllowed(pluginState.hasAllowedRanges);
        }
      };
    }

    return [
      new Plugin({
        key: PERMISSION_PLUGIN_KEY,
        state: {
          init(_, state) {
            const permissionTypeInfo = getPermissionTypeInfo(state.schema);
            const permissionState = buildPermissionState(state.doc, getAllowedIdentifiers(), permissionTypeInfo);
            storage.ranges = permissionState.ranges;
            updateEditableState(permissionState.hasAllowedRanges);
            return permissionState;
          },

          apply(tr, value, _oldState, newState) {
            let permissionState = value;
            if (tr.docChanged) {
              const permissionTypeInfo = getPermissionTypeInfo(newState.schema);
              permissionState = buildPermissionState(newState.doc, getAllowedIdentifiers(), permissionTypeInfo);
              storage.ranges = permissionState.ranges;
              updateEditableState(permissionState.hasAllowedRanges);
            }
            return permissionState;
          },
        },

        view() {
          return {
            destroy() {
              if (editor && originalSetDocumentMode) {
                editor.setDocumentMode = originalSetDocumentMode;
              }
            },
          };
        },

        // Appends transactions to the document to ensure permission ranges are updated.
        appendTransaction(transactions, oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;

          const permTypes = getPermissionTypeInfo(newState.schema);
          if (!permTypes.startTypes.length || !permTypes.endTypes.length) return null;

          const oldTags = collectPermissionTags(oldState.doc, permTypes.startTypes, permTypes.endTypes);
          if (!oldTags.size) {
            return null;
          }
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

          if (!pendingInsertions.length) {
            return null;
          }

          pendingInsertions.sort((a, b) => {
            if (a.pos === b.pos) {
              return a.priority - b.priority;
            }
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

        // Filters transactions to ensure only allowed edits are applied.
        filterTransaction(tr, state) {
          if (!tr.docChanged) return true;
          if (!editor || editor.options.documentMode !== 'viewing') return true;
          const pluginState = PERMISSION_PLUGIN_KEY.getState(state);
          if (!pluginState?.hasAllowedRanges) {
            return true;
          }
          const changedRanges = collectChangedRanges(tr);
          if (!changedRanges.length) return true;
          const permTypes = getPermissionTypeInfo(state.schema);
          if (!permTypes.startTypes.length || !permTypes.endTypes.length) return true;

          const allRangesAllowed = changedRanges.every((range) => {
            const trimmed = trimPermissionTagsFromRange(state.doc, range, permTypes.allTypeSet);
            return isRangeAllowed(trimmed, pluginState.ranges);
          });

          return allRangesAllowed;
        },
      }),
    ];
  },
});
