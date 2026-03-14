import { Plugin, PluginKey } from 'prosemirror-state';
import { Extension } from '@core/Extension.js';
import { getSurfaceRelativePoint } from '../../core/helpers/editorSurface.js';

/**
 * Find the nearest ancestor element that creates a containing block for `position: fixed`.
 * This happens when any ancestor has: transform, filter, backdrop-filter, perspective,
 * will-change (transform/perspective), or contain (paint/layout/strict/content).
 *
 * Per CSS Containing Block specification (https://www.w3.org/TR/css-position-3/#containing-block-for-abspos):
 * A positioned element with `position: fixed` is normally positioned relative to the viewport.
 * However, if any ancestor has certain CSS properties, that ancestor becomes the containing
 * block instead, causing `position: fixed` to behave relative to that ancestor rather than
 * the viewport.
 *
 * @param {HTMLElement} element - Starting element to search from
 * @returns {HTMLElement|null} The containing block ancestor, or null if fixed is relative to viewport
 * @throws {Error} Never throws - errors from getComputedStyle are caught and logged
 */
export function findContainingBlockAncestor(element) {
  if (!element) return null;

  let current = element.parentElement;
  while (current && current !== document.body && current !== document.documentElement) {
    try {
      const style = window.getComputedStyle(current);

      // Check for properties that create a containing block for fixed positioning
      const transform = style.transform;
      const filter = style.filter;
      const backdropFilter = style.backdropFilter || style.webkitBackdropFilter;
      const perspective = style.perspective;
      const willChange = style.willChange;
      const contain = style.contain;

      // transform other than 'none'
      if (transform && transform !== 'none') {
        return current;
      }

      // filter other than 'none'
      if (filter && filter !== 'none') {
        return current;
      }

      // backdrop-filter other than 'none'
      if (backdropFilter && backdropFilter !== 'none') {
        return current;
      }

      // perspective other than 'none'
      if (perspective && perspective !== 'none') {
        return current;
      }

      // will-change containing transform or perspective
      // Parse as comma-separated values to avoid substring matching issues
      // (e.g., 'will-transform' should not match 'transform')
      if (willChange && willChange !== 'auto') {
        const values = willChange.split(',').map((v) => v.trim());
        if (values.includes('transform') || values.includes('perspective')) {
          return current;
        }
      }

      // contain with paint, layout, strict, or content
      if (contain && /paint|layout|strict|content/.test(contain)) {
        return current;
      }
    } catch (error) {
      // Element may be detached from DOM or otherwise invalid
      console.warn('ContextMenu: Failed to get computed style for element', current, error);
      // Continue checking parent elements
    }

    current = current.parentElement;
  }

  return null;
}

/**
 * Configuration options for ContextMenu
 * @typedef {Object} ContextMenuOptions
 * @property {boolean} [disabled] - Disable the context menu entirely (inherited from editor.options.disableContextMenu)
 * @property {number} [cooldownMs=5000] - Cooldown duration in milliseconds to prevent rapid re-opening
 * @category Options
 */

/**
 * Plugin state structure for ContextMenu
 * @typedef {Object} ContextMenuState
 * @property {boolean} open - Whether the context menu is currently visible
 * @property {string|null} selected - ID of the currently selected menu item
 * @property {number|null} anchorPos - Document position where the menu was anchored
 * @property {Object|null} menuPosition - CSS positioning {left: string, top: string}
 * @property {string} [menuPosition.left] - Left position in pixels (e.g., "100px")
 * @property {string} [menuPosition.top] - Top position in pixels (e.g., "28px")
 * @property {boolean} disabled - Whether the menu functionality is disabled
 */

/**
 * Transaction metadata for ContextMenu actions
 * @typedef {Object} ContextMenuMeta
 * @property {'open'|'select'|'close'|'updatePosition'} type - Action type
 * @property {number} [pos] - Document position (for 'open' action)
 * @property {number} [clientX] - X coordinate for context menu positioning (for 'open' action)
 * @property {number} [clientY] - Y coordinate for context menu positioning (for 'open' action)
 * @property {string} [id] - Menu item ID (for 'select' action)
 */

export const ContextMenuPluginKey = new PluginKey('contextMenu');

/** @deprecated Use ContextMenuPluginKey instead */
export const SlashMenuPluginKey = ContextMenuPluginKey;

// Menu positioning constants (in pixels)
const MENU_OFFSET_X = 0; // Horizontal offset for slash trigger (aligned with cursor)
const MENU_OFFSET_Y = 28; // Vertical offset for slash trigger
const CONTEXT_MENU_OFFSET_X = 10; // Small offset for right-click
const CONTEXT_MENU_OFFSET_Y = 10; // Small offset for right-click
const SLASH_COOLDOWN_MS = 5000; // Cooldown period to prevent rapid re-opening

/**
 * @module ContextMenu
 * @sidebarTitle Context Menu
 * @snippetPath /snippets/extensions/context-menu.mdx
 *
 * @fires contextMenu:open - Emitted when menu opens, payload: {menuPosition: {left, top}}
 * @fires contextMenu:close - Emitted when menu closes, no payload
 */
export const ContextMenu = Extension.create({
  name: 'contextMenu',

  /**
   * Initialize default options for the ContextMenu extension
   * @returns {ContextMenuOptions} Empty options object (configuration is inherited from editor options)
   */
  addOptions() {
    return {};
  },

  addPmPlugins() {
    const editor = this.editor;
    if (editor.options?.isHeadless) {
      return [];
    }

    // Cooldown flag and timeout for slash trigger
    let slashCooldown = false;
    let slashCooldownTimeout = null;

    /**
     * Check if the context menu is disabled via editor options
     * @returns {boolean} True if menu is disabled
     */
    const isMenuDisabled = () => Boolean(editor.options?.disableContextMenu);

    /**
     * Ensures plugin state has the correct shape with all required properties
     * @param {Partial<ContextMenuState>} [value={}] - Partial state to merge with defaults
     * @returns {ContextMenuState} Complete state object with all properties
     */
    const ensureStateShape = (value = {}) => ({
      open: false,
      selected: null,
      anchorPos: null,
      menuPosition: null,
      disabled: isMenuDisabled(),
      ...value,
    });

    const contextMenuPlugin = new Plugin({
      key: ContextMenuPluginKey,

      state: {
        init: () => ensureStateShape(),

        /**
         * Apply transaction to update plugin state
         * Handles state transitions based on transaction metadata:
         * - 'open': Opens menu at specified position or cursor location
         * - 'select': Updates the selected menu item
         * - 'close': Closes the menu and clears anchor position
         * - 'updatePosition': Triggers menu position recalculation (no-op in apply)
         *
         * @param {import('prosemirror-state').Transaction} tr - The transaction
         * @param {ContextMenuState} value - Previous plugin state
         * @returns {ContextMenuState} New plugin state
         */
        apply(tr, value) {
          const meta = tr.getMeta(ContextMenuPluginKey);
          const disabled = isMenuDisabled();

          if (disabled) {
            if (value.open) {
              editor.emit('contextMenu:close');
            }
            return ensureStateShape({ disabled: true });
          }

          if (!meta) {
            if (value.disabled !== disabled) {
              return ensureStateShape({ ...value, disabled });
            }
            return value;
          }

          switch (meta.type) {
            case 'open': {
              // Validate position
              if (typeof meta.pos !== 'number' || meta.pos < 0 || meta.pos > tr.doc.content.size) {
                console.warn('ContextMenu: Invalid position', meta.pos);
                return ensureStateShape(value);
              }

              // For position: fixed menu, use viewport coordinates directly
              let left = 0;
              let top = 0;
              let isRightClick = false;

              if (typeof meta.clientX === 'number' && typeof meta.clientY === 'number') {
                left = meta.clientX;
                top = meta.clientY;
                isRightClick = true; // Right-click triggered
              } else {
                // Fallback to selection-based positioning (slash trigger)
                const relativePoint = getSurfaceRelativePoint(editor, meta);
                const surface = editor.presentationEditor?.element ?? editor.view?.dom ?? editor.options?.element;
                if (relativePoint && surface) {
                  try {
                    const rect = surface.getBoundingClientRect();
                    left = rect.left + relativePoint.left;
                    top = rect.top + relativePoint.top;
                  } catch (error) {
                    console.warn('ContextMenu: Failed to get surface bounds', error);
                    return ensureStateShape(value);
                  }
                } else if (surface) {
                  // coordsAtPos unavailable (e.g. blank document before first layout).
                  // Position the menu at the top-left of the visible editor surface.
                  try {
                    const rect = surface.getBoundingClientRect();
                    left = rect.left;
                    top = rect.top;
                  } catch (error) {
                    console.warn('ContextMenu: Failed to get surface bounds for fallback', error);
                    return ensureStateShape(value);
                  }
                }
              }

              // Adjust for containing block if any ancestor creates one.
              // Per CSS specification (https://www.w3.org/TR/css-position-3/#containing-block-for-abspos),
              // when an ancestor has transform, filter, backdrop-filter, perspective, will-change,
              // or contain properties, position:fixed becomes relative to that ancestor instead of
              // the viewport. This requires coordinate adjustment:
              //
              // 1. We start with viewport coordinates (left, top from getBoundingClientRect or clientX/Y)
              // 2. If a containing block exists, position:fixed will be relative to it, not viewport
              // 3. We subtract the containing block's viewport position to get coordinates relative to it
              // 4. This ensures the menu appears at the correct visual position regardless of transforms
              //
              // Example: If viewport coords are (200, 150) and containing block is at (50, 30),
              // we need (150, 120) in containing-block-relative coordinates.
              const menuSurface = editor.presentationEditor?.element ?? editor.view?.dom ?? editor.options?.element;
              const containingBlock = findContainingBlockAncestor(menuSurface);
              if (containingBlock) {
                try {
                  const cbRect = containingBlock.getBoundingClientRect();
                  left -= cbRect.left;
                  top -= cbRect.top;

                  /**
                   * Scroll offset adjustment for containing blocks.
                   *
                   * When a containing block is scrollable, position:fixed behaves like position:absolute
                   * relative to the containing block's border box, NOT its scrolled content area.
                   * This means fixed-position elements move with the scroll container's content.
                   *
                   * To position the menu correctly at the visual click location, we must add the
                   * containing block's scroll offsets (scrollLeft and scrollTop) to our calculated
                   * position. This compensates for the content being scrolled away from the border box.
                   *
                   * Example: If the containing block is scrolled 100px to the right (scrollLeft = 100),
                   * and we want the menu at visual position 150px from the left edge of the containing
                   * block, we need to set left = 250px (150 + 100) so that when the content shifts
                   * 100px left due to the scroll, the menu appears at the correct visual position.
                   *
                   * Edge cases handled:
                   * - scrollLeft/scrollTop may be null or undefined on some elements, so we use || 0
                   * - scrollLeft/scrollTop are always 0 for non-scrollable containers
                   */
                  left += containingBlock.scrollLeft || 0;
                  top += containingBlock.scrollTop || 0;
                } catch (error) {
                  console.warn('ContextMenu: Failed to adjust for containing block', error);
                }
              }

              // Use smaller offsets for right-click, larger for slash trigger
              const offsetX = isRightClick ? CONTEXT_MENU_OFFSET_X : MENU_OFFSET_X;
              const offsetY = isRightClick ? CONTEXT_MENU_OFFSET_Y : MENU_OFFSET_Y;

              const menuPosition = {
                left: `${left + offsetX}px`,
                top: `${top + offsetY}px`,
              };

              // Update state
              const newState = {
                ...value,
                open: true,
                anchorPos: meta.pos,
                menuPosition,
              };

              // Emit event after state update
              editor.emit('contextMenu:open', { menuPosition });

              return ensureStateShape(newState);
            }

            case 'select': {
              return ensureStateShape({ ...value, selected: meta.id });
            }

            case 'close': {
              editor.emit('contextMenu:close');
              return ensureStateShape({ ...value, open: false, anchorPos: null });
            }

            default:
              return ensureStateShape({ ...value, disabled });
          }
        },
      },

      /**
       * Create view plugin to handle window event listeners
       * @param {import('prosemirror-view').EditorView} editorView - The ProseMirror editor view
       * @returns {Object} View plugin with destroy method
       */
      view(editorView) {
        /**
         * Update menu position when window scrolls or resizes
         * Dispatches an 'updatePosition' meta action if menu is open
         */
        const updatePosition = () => {
          if (isMenuDisabled()) return;
          const state = ContextMenuPluginKey.getState(editorView.state);
          if (state.open) {
            editorView.dispatch(
              editorView.state.tr.setMeta(ContextMenuPluginKey, {
                type: 'updatePosition',
              }),
            );
          }
        };

        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);

        return {
          destroy() {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
            // Clear cooldown timeout if exists
            if (slashCooldownTimeout) {
              clearTimeout(slashCooldownTimeout);
              slashCooldownTimeout = null;
            }
          },
        };
      },

      props: {
        /**
         * Handle keyboard events to open/close the context menu
         * - '/': Opens menu at cursor if conditions are met (in paragraph, after space/start)
         * - 'Escape' or 'ArrowLeft': Closes menu and restores cursor position
         *
         * @param {import('prosemirror-view').EditorView} view - The ProseMirror editor view
         * @param {KeyboardEvent} event - The keyboard event
         * @returns {boolean} True if the event was handled, false otherwise
         */
        handleKeyDown(view, event) {
          if (isMenuDisabled()) {
            return false;
          }
          const pluginState = this.getState(view.state);

          // If cooldown is active and slash is pressed, allow default behavior
          if (event.key === '/' && slashCooldown) {
            return false; // Let browser handle it
          }

          if (event.key === '/' && !pluginState.open) {
            const { $cursor } = view.state.selection;
            if (!$cursor) return false;

            const isParagraph = $cursor.parent.type.name === 'paragraph';
            if (!isParagraph) return false;

            const textBefore = $cursor.parent.textContent.slice(0, $cursor.parentOffset);
            const isEmptyOrAfterSpace = !textBefore || textBefore.endsWith(' ');
            if (!isEmptyOrAfterSpace) return false;

            event.preventDefault();

            // Set cooldown
            slashCooldown = true;
            if (slashCooldownTimeout) clearTimeout(slashCooldownTimeout);
            slashCooldownTimeout = setTimeout(() => {
              slashCooldown = false;
              slashCooldownTimeout = null;
            }, SLASH_COOLDOWN_MS);

            // Only dispatch state update - event will be emitted in apply()
            view.dispatch(
              view.state.tr.setMeta(ContextMenuPluginKey, {
                type: 'open',
                pos: $cursor.pos,
              }),
            );
            return true;
          }

          if (pluginState.open && (event.key === 'Escape' || event.key === 'ArrowLeft')) {
            // Store current state before closing
            const { anchorPos } = pluginState;

            // Close menu
            view.dispatch(
              view.state.tr.setMeta(ContextMenuPluginKey, {
                type: 'close',
              }),
            );

            // Restore cursor position and focus
            if (anchorPos !== null) {
              const tr = view.state.tr.setSelection(
                view.state.selection.constructor.near(view.state.doc.resolve(anchorPos)),
              );
              view.dispatch(tr);
              view.focus();
            }
            return true;
          }

          return false;
        },
      },
    });

    return [contextMenuPlugin];
  },
});

/** @deprecated Use ContextMenu instead */
export const SlashMenu = ContextMenu;
