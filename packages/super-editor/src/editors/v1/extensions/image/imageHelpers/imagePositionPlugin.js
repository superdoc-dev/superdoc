// @ts-check
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

/** @typedef {import('prosemirror-transform').Step} PMStep */
/** @typedef {import('prosemirror-transform').ReplaceStep} ReplaceStep */

/**
 * Type guard to narrow ProseMirror steps that carry a slice payload.
 * @param {PMStep} step
 * @returns {step is ReplaceStep}
 */
const stepHasSlice = (step) => 'slice' in step && Boolean(step.slice);

const ImagePositionPluginKey = new PluginKey('ImagePosition');

/**
 * Cache for page break DOM positions to avoid forced reflows.
 * WeakMap ensures automatic garbage collection when DOM nodes are removed.
 * The cache is automatically invalidated when:
 * - Pagination changes (page break DOM nodes are recreated)
 * - DOM nodes are removed (WeakMap automatically garbage collects)
 */
const pageBreakPositionCache = new WeakMap();

/**
 * Creates a ProseMirror plugin for managing anchored image positioning
 * @category Helper
 * @param {Object} params - Plugin parameters
 * @param {Object} params.editor - Editor instance
 * @returns {Plugin} ProseMirror plugin for image positioning
 * @example
 * const plugin = ImagePositionPlugin({ editor });
 * @note Handles anchored images with text wrapping
 * @note Integrates with pagination for proper page positioning
 * @note Creates placeholder decorations for absolute positioned images
 */
export const ImagePositionPlugin = ({ editor }) => {
  const { view } = editor;
  let shouldUpdate = true;
  return new Plugin({
    name: 'ImagePositionPlugin',
    key: ImagePositionPluginKey,

    state: {
      init() {
        return DecorationSet.empty;
      },

      apply(tr, oldDecorationSet, oldState, newState) {
        if (!tr.docChanged && !shouldUpdate) return oldDecorationSet;

        // In headless/Node environments, or when no view/DOM is available, skip DOM-dependent work
        const hasDOM = typeof document !== 'undefined' && !!(document && document.createElement);
        if (!hasDOM || !view || typeof view.domAtPos !== 'function') {
          return oldDecorationSet.map(tr.mapping, tr.doc);
        }

        /*
         * OPTIMIZATION: Check if transaction affects images before regenerating decorations.
         * This prevents unnecessary decoration updates for transactions that don't involve images.
         * If no images are affected, we can simply remap existing decorations to new positions.
         */
        let affectsImages = false;

        tr.steps.forEach((step) => {
          if (stepHasSlice(step)) {
            step.slice.content.descendants((node) => {
              if (node.type.name === 'image' || node.attrs?.anchorData) {
                affectsImages = true;
                return false;
              }
            });
          }
        });

        if (!affectsImages && !shouldUpdate) {
          return oldDecorationSet.map(tr.mapping, tr.doc);
        }

        const decorations = getImagePositionDecorations(newState, view);
        shouldUpdate = false;
        return DecorationSet.create(newState.doc, decorations);
      },
    },

    view: () => {
      return {
        update: (view, lastState) => {
          const hasDOM = typeof document !== 'undefined' && !!(document && document.createElement);
          if (!hasDOM || !view || typeof view.domAtPos !== 'function') return;
          if (shouldUpdate) {
            const decorations = getImagePositionDecorations(lastState, view);
            const updateTransaction = view.state.tr.setMeta(ImagePositionPluginKey, { decorations });
            view.dispatch(updateTransaction);
          }
        },
      };
    },

    props: {
      decorations(state) {
        // Duplicate prosemirror-view installs can make DecorationSet nominally incompatible here.
        return /** @type {any} */ (this.getState(state));
      },
    },
  });
};

/**
 * Generate decorations for anchored images based on their positioning attributes
 * @private
 * @param {Object} state - Editor state
 * @param {Object} view - Editor view
 * @returns {Array} Array of Decoration objects
 * @note Creates inline decorations with positioning styles
 * @note Adds placeholder widgets for absolute positioned images
 * @note Handles float left/right and center alignment
 */
const getImagePositionDecorations = (state, view) => {
  let decorations = [];

  // Guard for non-DOM environments or missing view APIs
  const hasDOM = typeof document !== 'undefined' && !!(document && document.createElement);
  if (!hasDOM || !view || typeof view.domAtPos !== 'function') {
    return decorations;
  }

  /*
   * OPTIMIZATION: Early return if no anchored images exist in the document.
   * This quick check prevents unnecessary DOM operations and calculations
   * for documents without absolute-positioned images.
   */
  let hasAnchoredImages = false;
  state.doc.descendants((node) => {
    if (node.attrs?.anchorData) {
      hasAnchoredImages = true;
      return false;
    }
  });

  if (!hasAnchoredImages) {
    return decorations;
  }

  state.doc.descendants((node, pos) => {
    if (node.attrs.anchorData) {
      let style = '';
      let className = '';
      const { vRelativeFrom, alignH } = node.attrs.anchorData;
      const { size, padding } = node.attrs;

      const pageBreak = findPreviousDomNodeWithClass(view, pos, 'pagination-break-wrapper');
      if (pageBreak && vRelativeFrom === 'margin' && alignH) {
        // Use cached position to avoid forced reflow on every update
        let pageBreakPos = pageBreakPositionCache.get(pageBreak);
        if (!pageBreakPos) {
          pageBreakPos = {
            top: pageBreak.offsetTop,
            height: pageBreak.offsetHeight,
          };
          pageBreakPositionCache.set(pageBreak, pageBreakPos);
        }

        const topPos = pageBreakPos.top + pageBreakPos.height;
        let horizontalAlignment = `${alignH}: 0;`;
        if (alignH === 'center') horizontalAlignment = 'left: 50%; transform: translateX(-50%);';

        style += vRelativeFrom === 'margin' ? `position: absolute; top: ${topPos}px; ${horizontalAlignment}` : '';
        const nextPos = view.posAtDOM(pageBreak, 1);

        if (nextPos < 0) {
          const $pos = view.state.doc.resolve(pos);
          // When no placeholder can be added apply height to the parent node to occupy absolute image size
          decorations.push(
            Decoration.node(pos - 1, pos + $pos.parent.nodeSize - 1, {
              style: `height: ${size.height + parseInt(padding.top) + parseInt(padding.bottom)}px`,
            }),
          );
        }

        const imageBlock = document.createElement('div');
        imageBlock.className = 'anchor-image-placeholder';
        imageBlock.style.float = alignH === 'left' || alignH === 'right' ? alignH : 'none';
        let paddingHorizontal;
        if (alignH === 'center') {
          paddingHorizontal = (parseInt(padding.left) || 0) + (parseInt(padding.right) || 0);
        } else {
          paddingHorizontal = parseInt(padding[alignH]) || 0;
        }
        imageBlock.style.width = size.width + paddingHorizontal + 'px';
        imageBlock.style.height = size.height + parseInt(padding.top) + parseInt(padding.bottom) + 'px';
        decorations.push(Decoration.widget(nextPos, imageBlock, { key: 'stable-key' }));

        decorations.push(Decoration.inline(pos, pos + node.nodeSize, { style, class: className }));
      }
    }
  });
  return decorations;
};

/**
 * Find the previous DOM node with a specific class by walking up the DOM tree
 * @private
 * @param {Object} view - Editor view
 * @param {number} pos - Position in document
 * @param {string} className - Class name to search for
 * @returns {HTMLElement|null} DOM element with the class or null
 * @example
 * const pageBreak = findPreviousDomNodeWithClass(view, pos, 'pagination-break-wrapper');
 * @note Walks backward through siblings and ancestors
 * @note Handles text nodes by starting from their parent
 */
const findPreviousDomNodeWithClass = (view, pos, className) => {
  // Guard for headless environments
  const hasDOM = typeof document !== 'undefined' && !!(document && document.createElement);
  if (!hasDOM || !view || typeof view.domAtPos !== 'function') return null;
  let { node } = view.domAtPos(pos);

  // If you get a text node, go to its parent
  if (node.nodeType === 3) {
    node = node.parentNode;
  }

  // Walk backward over siblings and their ancestors
  while (node) {
    if (node.classList && node.classList.contains(className)) {
      return node;
    }
    if (node.previousSibling) {
      node = node.previousSibling;
      // Dive to the last child if it's an element with children
      while (node && node.lastChild) {
        node = node.lastChild;
      }
    } else {
      node = node.parentNode;
    }
  }

  return null; // Not found
};
