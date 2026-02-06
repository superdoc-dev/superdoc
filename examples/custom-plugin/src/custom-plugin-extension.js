import { Extensions } from 'superdoc/super-editor';
import { Plugin, PluginKey } from 'prosemirror-state';

const { Extension } = Extensions;

const activeBlockPluginKey = new PluginKey('customPluginActiveBlock');

const ZERO_WIDTH_SPACE = /\u200B/g;

/**
 * Normalise text by stripping zero-width characters and collapsing
 * whitespace so previews are deterministic.
 */
const collapseTextPreview = (text = '') => text.replace(ZERO_WIDTH_SPACE, '').replace(/\s+/g, ' ').trim();

/**
 * Shallow compare two plain objects. Keeps block metadata change checks cheap.
 */
const shallowEqual = (a, b) => {
  if (a === b) {
    return true;
  }

  const aObj = a || {};
  const bObj = b || {};
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  return aKeys.every((key) => aObj[key] === bObj[key]);
};

/**
 * Tracks the block-level node under the user's most recent interaction and
 * emits lightweight metadata so the host app can respond (e.g. by styling it).
 */
export const customPluginExtension = Extension.create({
  name: 'customPluginExtension',

  addPmPlugins() {
    const extension = this;
    // Tracks whether the next transaction originated from an explicit user gesture
    // so we can ignore SuperDoc's bootstrapping transactions.
    let pendingInteraction = false;

    const buildInitialState = (hasInteracted) => ({
      blockInfo: null,
      hasInteracted,
    });

    const emitActiveBlock = (info) => {
      extension.editor?.emit('custom-plugin:active-block', info ?? null);
    };

    return [
      new Plugin({
        key: activeBlockPluginKey,
        state: {
          init() {
            return buildInitialState(false);
          },

          apply(tr, pluginState, _oldState, newState) {
            const interactionMeta = tr.getMeta(activeBlockPluginKey);
            const interactionOccurred = pendingInteraction === true || interactionMeta?.interaction === true;
            const hasInteracted = pluginState.hasInteracted || interactionOccurred;

            pendingInteraction = false;

            const resetState = (hasInteractedFlag) => {
              if (pluginState.blockInfo) {
                emitActiveBlock(null);
              }
              return buildInitialState(hasInteractedFlag);
            };

            if (!hasInteracted) {
              return resetState(false);
            }

            // Bail early unless the document/selection actually changed, or the user explicitly interacted.
            const shouldRecompute =
              interactionOccurred ||
              tr.docChanged ||
              tr.selectionSet ||
              pluginState.blockInfo === null;

            if (!shouldRecompute) {
              return {
                ...pluginState,
                hasInteracted,
              };
            }

            const { selection } = newState;
            const $from = selection?.$from;

            if (!$from) {
              return resetState(hasInteracted);
            }

            let blockDepth = null;

            // Walk from the selection root towards the document root and remember the deepest block node.
            for (let depth = 1; depth <= $from.depth; depth += 1) {
              const candidate = $from.node(depth);
              if (candidate?.isBlock) {
                blockDepth = depth;
              }
            }

            if (blockDepth === null) {
              return resetState(hasInteracted);
            }

            const blockNode = $from.node(blockDepth);
            const blockPos = $from.before(blockDepth);

            if (typeof blockPos !== 'number') {
              return resetState(hasInteracted);
            }

            const blockStart = blockPos;
            const blockEnd = blockStart + blockNode.nodeSize;

            const textPreview = collapseTextPreview(blockNode.textContent).slice(0, 120);

            // Captures the essentials the consuming app might want to render.
            const blockInfo = {
              pos: blockStart,
              end: blockEnd,
              size: blockNode.nodeSize,
              type: blockNode.type.name,
              depth: blockDepth,
              isTextblock: blockNode.isTextblock,
              textPreview,
              attrs: { ...(blockNode.attrs || {}) },
              childCount: blockNode.childCount,
            };

            const blockChanged =
              !pluginState.blockInfo ||
              pluginState.blockInfo.pos !== blockInfo.pos ||
              pluginState.blockInfo.end !== blockInfo.end ||
              pluginState.blockInfo.type !== blockInfo.type ||
              pluginState.blockInfo.textPreview !== blockInfo.textPreview ||
              pluginState.blockInfo.childCount !== blockInfo.childCount ||
              pluginState.blockInfo.size !== blockInfo.size ||
              !shallowEqual(pluginState.blockInfo.attrs, blockInfo.attrs);

            if (blockChanged) {
              emitActiveBlock(blockInfo);
            }

            return {
              blockInfo,
              hasInteracted,
            };

          },
        },
        props: {
          handleDOMEvents: {
            mousedown(view) {
              pendingInteraction = true;
              const tr = view.state.tr.setMeta(activeBlockPluginKey, { interaction: true });
              view.dispatch(tr);
              return false;
            },
            touchstart(view) {
              pendingInteraction = true;
              const tr = view.state.tr.setMeta(activeBlockPluginKey, { interaction: true });
              view.dispatch(tr);
              return false;
            },
            keydown() {
              // Keyboard navigation updates run through the next transaction/selection change.
              pendingInteraction = true;
              return false;
            },
          },
        },
      }),
    ];
  },
});
