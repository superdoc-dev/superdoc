// @ts-nocheck
import { Extension } from '@core/Extension.js';
import { helpers } from '@core/index.js';
import { mergeRanges, clampRange } from '@utils/rangeUtils.js';
import { Plugin, PluginKey } from 'prosemirror-state';
import { ReplaceStep, ReplaceAroundStep, AddMarkStep, RemoveMarkStep } from 'prosemirror-transform';
import { v4 as uuidv4 } from 'uuid';

const { findChildren } = helpers;
const SD_BLOCK_ID_ATTRIBUTE_NAME = 'sdBlockId';
const SD_BLOCK_REV_ATTRIBUTE_NAME = 'sdBlockRev';
export const BlockNodePluginKey = new PluginKey('blockNodePlugin');

/**
 * @typedef {import('prosemirror-model').Node} ProseMirrorNode
 * @typedef {import('prosemirror-state').Transaction} Transaction
 */

/**
 * Block node information object
 * @typedef {Object} BlockNodeInfo
 * @property {ProseMirrorNode} node - The block node
 * @property {number} pos - Position in the document
 */

/**
 * Configuration options for BlockNode
 * @typedef {Object} BlockNodeOptions
 * @category Options
 */

/**
 * Attributes for block nodes
 * @typedef {Object} BlockNodeAttributes
 * @category Attributes
 * @property {string} [sdBlockId] @internal Unique identifier for the block
 */

/**
 * @module BlockNode
 * @sidebarTitle Block Node
 * @snippetPath /snippets/extensions/block-node.mdx
 */
export const BlockNode = Extension.create({
  name: 'blockNode',

  addCommands() {
    return {
      /**
       * Replace a block node by its ID with new content
       * @category Command
       * @param {string} id - The sdBlockId of the node to replace
       * @param {ProseMirrorNode} contentNode - The replacement ProseMirror node
       * @example
       * const newParagraph = editor.schema.nodes.paragraph.create({}, editor.schema.text('New content'))
       * editor.commands.replaceBlockNodeById('block-123', newParagraph)
       * @note The replacement node should have the same type as the original
       */
      replaceBlockNodeById:
        (id, contentNode) =>
        ({ dispatch, tr }) => {
          const blockNode = this.editor.helpers.blockNode.getBlockNodeById(id);
          if (!blockNode || blockNode.length > 1) {
            return false;
          }

          if (dispatch) {
            let { pos, node } = blockNode[0];
            let newPosFrom = tr.mapping.map(pos);
            let newPosTo = tr.mapping.map(pos + node.nodeSize);

            let currentNode = tr.doc.nodeAt(newPosFrom);
            if (node.eq(currentNode)) {
              tr.replaceWith(newPosFrom, newPosTo, contentNode);
            }
          }

          return true;
        },

      /**
       * Delete a block node by its ID
       * @category Command
       * @param {string} id - The sdBlockId of the node to delete
       * @example
       * editor.commands.deleteBlockNodeById('block-123')
       * @note Completely removes the node from the document
       */
      deleteBlockNodeById:
        (id) =>
        ({ dispatch, tr }) => {
          const blockNode = this.editor.helpers.blockNode.getBlockNodeById(id);
          if (!blockNode || blockNode.length > 1) {
            return false;
          }

          if (dispatch) {
            let { pos, node } = blockNode[0];
            let newPosFrom = tr.mapping.map(pos);
            let newPosTo = tr.mapping.map(pos + node.nodeSize);

            let currentNode = tr.doc.nodeAt(newPosFrom);
            if (node.eq(currentNode)) {
              tr.delete(newPosFrom, newPosTo);
            }
          }

          return true;
        },

      /**
       * Update attributes of a block node by its ID
       * @category Command
       * @param {string} id - The sdBlockId of the node to update
       * @param {Object} attrs - Attributes to update
       * @example
       * editor.commands.updateBlockNodeAttributes('block-123', { textAlign: 'center' })
       * @example
       * editor.commands.updateBlockNodeAttributes('block-123', { indent: { left: 20 } })
       * @note Merges new attributes with existing ones
       */
      updateBlockNodeAttributes:
        (id, attrs = {}) =>
        ({ dispatch, tr }) => {
          const blockNode = this.editor.helpers.blockNode.getBlockNodeById(id);
          if (!blockNode || blockNode.length > 1) {
            return false;
          }
          if (dispatch) {
            let { pos, node } = blockNode[0];
            let newPos = tr.mapping.map(pos);
            let currentNode = tr.doc.nodeAt(newPos);
            if (node.eq(currentNode)) {
              tr.setNodeMarkup(newPos, undefined, {
                ...node.attrs,
                ...attrs,
              });
            }

            return true;
          }
        },
    };
  },

  addHelpers() {
    return {
      /**
       * Get all block nodes in the document
       * @category Helper
       * @returns {Array<BlockNodeInfo>} Array of block node info objects
       * @example
       * const blocks = editor.helpers.blockNode.getBlockNodes()
       * console.log(`Found ${blocks.length} block nodes`)
       */
      getBlockNodes: () => {
        return findChildren(this.editor.state.doc, (node) => nodeAllowsSdBlockIdAttr(node));
      },

      /**
       * Get a specific block node by its ID
       * @category Helper
       * @param {string} id - The sdBlockId to search for
       * @returns {Array<BlockNodeInfo>} Array containing the matching node (or empty)
       * @example
       * const block = editor.helpers.blockNode.getBlockNodeById('block-123')
       * if (block.length) console.log('Found:', block[0].node.type.name)
       */
      getBlockNodeById: (id) => {
        return findChildren(this.editor.state.doc, (node) => node.attrs.sdBlockId === id);
      },

      /**
       * Get all block nodes of a specific type
       * @category Helper
       * @param {string} type - The node type name (e.g., 'paragraph', 'heading')
       * @returns {Array<BlockNodeInfo>} Array of matching block nodes
       * @example
       * const paragraphs = editor.helpers.blockNode.getBlockNodesByType('paragraph')
       * const headings = editor.helpers.blockNode.getBlockNodesByType('heading')
       */
      getBlockNodesByType: (type) => {
        return findChildren(this.editor.state.doc, (node) => node.type.name === type);
      },

      /**
       * Get all block nodes within a position range
       * @category Helper
       * @param {number} from - Start position
       * @param {number} to - End position
       * @returns {Array<BlockNodeInfo>} Array of block nodes in the range
       * @example
       * const selection = editor.state.selection
       * const blocksInSelection = editor.helpers.blockNode.getBlockNodesInRange(
       *   selection.from,
       *   selection.to
       * )
       */
      getBlockNodesInRange: (from, to) => {
        let blockNodes = [];

        this.editor.state.doc.nodesBetween(from, to, (node, pos) => {
          if (nodeAllowsSdBlockIdAttr(node)) {
            blockNodes.push({
              node,
              pos,
            });
          }
        });

        return blockNodes;
      },
    };
  },

  addPmPlugins() {
    let hasInitialized = false;

    /**
     * Assigns a new sdBlockId attribute to a block node.
     * @param {import('prosemirror-state').Transaction} tr - Current transaction being updated.
     * @param {import('prosemirror-model').Node} node - Node that needs the identifier.
     * @param {number} pos - Document position of the node.
     */
    const getNextBlockRev = (node) => {
      const current = node?.attrs?.[SD_BLOCK_REV_ATTRIBUTE_NAME];
      if (typeof current === 'number' && Number.isFinite(current)) return current + 1;
      const parsed = Number.parseInt(current, 10);
      if (Number.isFinite(parsed)) return parsed + 1;
      return 1;
    };

    const ensureBlockRev = (node) => {
      const current = node?.attrs?.[SD_BLOCK_REV_ATTRIBUTE_NAME];
      if (typeof current === 'number' && Number.isFinite(current)) return current;
      const parsed = Number.parseInt(current, 10);
      if (Number.isFinite(parsed)) return parsed;
      return 0;
    };

    const applyNodeAttrs = (tr, node, pos, nextAttrs) => {
      tr.setNodeMarkup(pos, undefined, nextAttrs, node.marks);
    };

    /**
     * Ensures a block node has a unique sdBlockId, assigning a new UUID if the
     * current ID is missing or already seen. Tracks seen IDs in the provided Set
     * to detect duplicates (e.g., when tr.split() copies the original paragraph's ID).
     * @param {ProseMirrorNode} node - The node to check.
     * @param {Object} nextAttrs - Mutable attrs object to update.
     * @param {Set<string>} seenIds - Set of IDs already encountered in this traversal.
     * @returns {boolean} True if the sdBlockId was changed.
     */
    const ensureUniqueSdBlockId = (node, nextAttrs, seenIds) => {
      const currentId = node.attrs?.sdBlockId;
      let changed = false;
      if (nodeAllowsSdBlockIdAttr(node) && (nodeNeedsSdBlockId(node) || seenIds.has(currentId))) {
        nextAttrs.sdBlockId = uuidv4();
        changed = true;
      }
      if (currentId) seenIds.add(currentId);
      return changed;
    };

    return [
      new Plugin({
        key: BlockNodePluginKey,
        appendTransaction: (transactions, oldState, newState) => {
          const docChanges = transactions.some((tr) => tr.docChanged) && !oldState.doc.eq(newState.doc);

          if (hasInitialized && !docChanges) {
            return;
          }

          const { tr } = newState;
          let changed = false;
          const updatedPositions = new Set();

          if (!hasInitialized) {
            // Initial pass: assign IDs to all block nodes in document
            const seenIds = new Set();
            newState.doc.descendants((node, pos) => {
              if (!nodeAllowsSdBlockIdAttr(node) && !nodeAllowsSdBlockRevAttr(node)) return;
              const nextAttrs = { ...node.attrs };
              let nodeChanged = ensureUniqueSdBlockId(node, nextAttrs, seenIds);
              if (nodeAllowsSdBlockRevAttr(node)) {
                const rev = ensureBlockRev(node);
                if (nextAttrs.sdBlockRev !== rev) {
                  nextAttrs.sdBlockRev = rev;
                  nodeChanged = true;
                }
              }
              if (nodeChanged) {
                applyNodeAttrs(tr, node, pos, nextAttrs);
                changed = true;
              }
            });
          } else {
            // Subsequent updates: only check affected ranges
            const rangesToCheck = [];
            let shouldFallbackToFullTraversal = false;

            transactions.forEach((transaction, txIndex) => {
              transaction.steps.forEach((step, stepIndex) => {
                const stepRanges = [];
                if (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) {
                  const stepMap = step.getMap();
                  stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
                    if (newEnd <= newStart) {
                      // Deletions often yield zero-length ranges; still update the surrounding block.
                      stepRanges.push({ from: newStart, to: newStart + 1 });
                      return;
                    }
                    stepRanges.push({ from: newStart, to: newEnd });
                  });
                } else if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
                  if (step.to > step.from) {
                    stepRanges.push({ from: step.from, to: step.to });
                  }
                }

                stepRanges.forEach(({ from: rangeStartRaw, to: rangeEndRaw }) => {
                  let rangeStart = rangeStartRaw;
                  let rangeEnd = rangeEndRaw;

                  // Map through remaining steps in the current transaction
                  for (let i = stepIndex + 1; i < transaction.steps.length; i++) {
                    const laterStepMap = transaction.steps[i].getMap();
                    rangeStart = laterStepMap.map(rangeStart, -1);
                    rangeEnd = laterStepMap.map(rangeEnd, 1);
                  }

                  // Map through later transactions in the appendTransaction batch
                  for (let i = txIndex + 1; i < transactions.length; i++) {
                    const laterTx = transactions[i];
                    rangeStart = laterTx.mapping.map(rangeStart, -1);
                    rangeEnd = laterTx.mapping.map(rangeEnd, 1);
                  }

                  if (rangeEnd <= rangeStart) {
                    rangeEnd = rangeStart + 1;
                  }

                  rangesToCheck.push({ from: rangeStart, to: rangeEnd });
                });
              });
            });

            const docSize = newState.doc.content.size;
            const mergedRanges = mergeRanges(rangesToCheck, docSize);
            // Track seen sdBlockIds across all ranges to detect duplicates
            // (e.g., when tr.split() copies the original paragraph's sdBlockId to the new one).
            const seenBlockIds = new Set();

            for (const { from, to } of mergedRanges) {
              const clampedRange = clampRange(from, to, docSize);

              if (!clampedRange) {
                continue;
              }

              const { start: safeStart, end: safeEnd } = clampedRange;

              try {
                newState.doc.nodesBetween(safeStart, safeEnd, (node, pos) => {
                  if (!nodeAllowsSdBlockIdAttr(node) && !nodeAllowsSdBlockRevAttr(node)) return;
                  if (updatedPositions.has(pos)) return;
                  const nextAttrs = { ...node.attrs };
                  let nodeChanged = ensureUniqueSdBlockId(node, nextAttrs, seenBlockIds);
                  if (nodeAllowsSdBlockRevAttr(node)) {
                    nextAttrs.sdBlockRev = getNextBlockRev(node);
                    nodeChanged = true;
                  }
                  if (nodeChanged) {
                    applyNodeAttrs(tr, node, pos, nextAttrs);
                    updatedPositions.add(pos);
                    changed = true;
                  }
                });
              } catch (error) {
                console.warn('Block node plugin: nodesBetween failed, falling back to full traversal', error);
                shouldFallbackToFullTraversal = true;
                break;
              }
            }

            if (shouldFallbackToFullTraversal) {
              const fallbackSeenIds = new Set();
              newState.doc.descendants((node, pos) => {
                if (!nodeAllowsSdBlockIdAttr(node) && !nodeAllowsSdBlockRevAttr(node)) return;
                const nextAttrs = { ...node.attrs };
                let nodeChanged = ensureUniqueSdBlockId(node, nextAttrs, fallbackSeenIds);
                if (nodeAllowsSdBlockRevAttr(node)) {
                  nextAttrs.sdBlockRev = getNextBlockRev(node);
                  nodeChanged = true;
                }
                if (nodeChanged) {
                  applyNodeAttrs(tr, node, pos, nextAttrs);
                  changed = true;
                }
              });
            }
          }

          if (changed && !hasInitialized) {
            hasInitialized = true;
            tr.setMeta('blockNodeInitialUpdate', true);
          }

          // Restore marks since setNodeMarkup resets them
          tr.setStoredMarks(newState.tr.storedMarks);

          return changed ? tr : null;
        },
      }),
    ];
  },
});

/**
 * Check if a node allows sdBlockId attribute
 * @param {ProseMirrorNode} node - The ProseMirror node to check
 * @returns {boolean} True if the node type supports sdBlockId attribute
 */
export const nodeAllowsSdBlockIdAttr = (node) => {
  return !!(node?.isBlock && node?.type?.spec?.attrs?.[SD_BLOCK_ID_ATTRIBUTE_NAME]);
};

export const nodeAllowsSdBlockRevAttr = (node) => {
  return !!(node?.isBlock && node?.type?.spec?.attrs?.[SD_BLOCK_REV_ATTRIBUTE_NAME]);
};

/**
 * Check if a node needs an sdBlockId (doesn't have one or has null/empty value)
 * @param {ProseMirrorNode} node - The ProseMirror node to check
 * @returns {boolean} True if the node needs an sdBlockId assigned
 */
export const nodeNeedsSdBlockId = (node) => {
  const currentId = node?.attrs?.[SD_BLOCK_ID_ATTRIBUTE_NAME];
  return !currentId;
};

/**
 * Check for new block nodes in ProseMirror transactions.
 * Iterate through the list of transactions, and in each tr check if there are any new block nodes.
 * @param {Transaction[]} transactions - The ProseMirror transactions to check
 * @returns {boolean} True if new block nodes are found, false otherwise
 */
export const checkForNewBlockNodesInTrs = (transactions) => {
  return Array.from(transactions).some((tr) => {
    return tr.steps.some((step) => {
      if (!(step instanceof ReplaceStep)) return false;
      const hasValidSdBlockNodes = step.slice?.content?.content?.some((node) => nodeAllowsSdBlockIdAttr(node));
      return hasValidSdBlockNodes;
    });
  });
};
