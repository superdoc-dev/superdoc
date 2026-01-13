import { createApp } from 'vue';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Extension } from '@core/Extension.js';
import tippy from 'tippy.js';
import { applyStyleIsolationClass } from '@utils/styleIsolation.js';

import Mentions from '@components/popovers/Mentions.vue';

/**
 * Configuration options for PopoverPlugin
 * @typedef {Object} PopoverPluginOptions
 * @category Options
 */

const popoverPluginKey = new PluginKey('popoverPlugin');

/**
 * @module PopoverPlugin
 * @sidebarTitle Popover Plugin
 * @snippetPath /snippets/extensions/popover-plugin.mdx
 */
export const PopoverPlugin = Extension.create({
  name: 'popoverPlugin',

  addOptions() {
    return {};
  },

  addPmPlugins() {
    const popover = new Plugin({
      key: popoverPluginKey,
      state: {
        init: () => {
          return {};
        },
        apply: (tr, value) => {
          const newValue = { ...value };

          // Only update popover when selection or document changes
          if (tr.docChanged || tr.selectionSet) {
            newValue.shouldUpdate = true;
          } else {
            newValue.shouldUpdate = false;
          }

          return newValue;
        },
      },
      view: (view) => {
        const popover = new Popover(view, this.editor);
        return {
          update: (view, lastState) => {
            const pluginState = popoverPluginKey.getState(view.state);
            if (!pluginState.shouldUpdate) return;
            popover.update(view, lastState);
          },
          destroy: () => {
            popover.destroy();
          },
        };
      },
    });
    return [popover];
  },
});

class Popover {
  constructor(view, editor) {
    this.editor = editor;
    this.view = view;
    this.popover = document.createElement('div');
    this.popover.className = 'sd-editor-popover';
    applyStyleIsolationClass(this.popover);
    document.body.appendChild(this.popover);

    this.tippyInstance = tippy(this.popover, {
      trigger: 'manual',
      placement: 'bottom-start',
      interactive: true,
      appendTo: document.body,
      arrow: false,
      onShow: (instance) => {
        instance.setProps({ getReferenceClientRect: () => this.popoverRect });
        this.bindKeyDownEvents();
      },
      onHide: () => {
        this.unbindKeyDownEvents();
      },
      theme: 'sd-editor-popover',
    });
  }

  bindKeyDownEvents() {
    this.view.dom.addEventListener('keydown', this.handleKeyDown);
  }

  unbindKeyDownEvents() {
    this.view.dom.removeEventListener('keydown', this.handleKeyDown);
  }

  handleKeyDown = (event) => {
    const isArrow = event.key === 'ArrowDown' || event.key === 'ArrowUp';
    if (this.tippyInstance.state.isVisible && isArrow) {
      event.preventDefault();
      this.popover.firstChild.focus();
    }
  };

  mountVueComponent(component, props = {}) {
    if (this.app) this.app.unmount();
    this.app = createApp(component, props);
    this.app.mount(this.popover);
    this.tippyInstance.setContent(this.popover);
  }

  update(view) {
    this.state = view.state;
    const showPopover = this.isShowMentions;

    let popoverContent = { component: null, props: null };
    if (this.isShowMentions) {
      const { from } = this.state.selection;
      const atMention = this.getMentionText(from);
      popoverContent = {
        component: Mentions,
        props: {
          users: this.editor.users,
          mention: atMention,
          inserMention: (user) => {
            // Use fresh state from the view, not the stale captured state
            const currentState = this.editor.view.state;
            const { $from } = currentState.selection;
            const length = atMention.length;
            const attributes = { ...user };
            const mentionNode = this.editor.schema.nodes.mention.create(attributes);
            const tr = currentState.tr.replaceWith($from.pos - length, $from.pos, mentionNode);
            this.editor.view.dispatch(tr);
            this.editor.view.focus();
          },
        },
      };
    }

    if (showPopover && popoverContent.component) {
      const { to } = this.state.selection;
      const { component, props } = popoverContent;
      this.mountVueComponent(component, props);
      this.showPopoverAtPosition(to);
    } else this.tippyInstance.hide();
  }

  showPopoverAtPosition(pos) {
    let left = 0;
    let top = 0;
    let source = 'fallback';

    // In presentation mode, find position using DOM elements in painterHost
    const presentationEditor = this.editor.presentationEditor;
    if (presentationEditor) {
      const result = this.getViewportCoordsFromPainterHost(presentationEditor, pos);
      if (result) {
        left = result.left;
        top = result.bottom;
        source = 'painterHost DOM';
      }
    }

    // Fallback to view.coordsAtPos for non-presentation mode
    if (source === 'fallback') {
      const coords = this.view.coordsAtPos(pos);
      left = coords.left;
      top = coords.bottom;
    }

    this.popoverRect = {
      width: 0,
      height: 0,
      top: top,
      left: left,
      bottom: top,
      right: left,
    };

    this.tippyInstance.show();
  }

  /**
   * Get viewport coordinates by finding the DOM element in the painted content.
   * This works in presentation mode where the actual DOM is off-screen but
   * painted elements exist in the painterHost.
   */
  getViewportCoordsFromPainterHost(presentationEditor, pos) {
    // Access painterHost through the DOM - it's a private field but we can find it by class
    const visibleHost = presentationEditor.element;
    if (!visibleHost) return null;

    // painterHost has class 'presentation-editor__pages'
    const painterHost = visibleHost.querySelector('.presentation-editor__pages');
    if (!painterHost) return null;

    // Find all page elements
    const pageEls = painterHost.querySelectorAll('.superdoc-page[data-page-index]');
    if (!pageEls.length) return null;

    // Search through pages for a span containing this position
    for (const pageEl of pageEls) {
      const spanEls = pageEl.querySelectorAll('span[data-pm-start][data-pm-end]');
      for (const spanEl of spanEls) {
        const pmStart = Number(spanEl.dataset.pmStart);
        const pmEnd = Number(spanEl.dataset.pmEnd);

        if (pos >= pmStart && pos <= pmEnd && spanEl.firstChild?.nodeType === Node.TEXT_NODE) {
          const textNode = spanEl.firstChild;
          const charIndex = Math.min(pos - pmStart, textNode.length);

          const range = document.createRange();
          range.setStart(textNode, charIndex);
          range.setEnd(textNode, charIndex);

          const rect = range.getBoundingClientRect();

          return {
            left: rect.left,
            top: rect.top,
            bottom: rect.bottom,
          };
        }
      }
    }

    return null;
  }

  getMentionText(from) {
    const maxLookBehind = 20;
    const startPos = Math.max(0, from - maxLookBehind);
    const textBefore = this.state.doc.textBetween(startPos, from, '\n', '\0');

    // Return only the text after the last @
    const atIndex = textBefore.lastIndexOf('@');
    if (atIndex !== -1) return textBefore.substring(atIndex);

    return '';
  }

  get isShowMentions() {
    const { from } = this.state.selection;

    // Ensure we're not out of bounds
    if (from < 1) return false;

    const textBefore = this.getMentionText(from);

    // Use regex to match "@" followed by word characters and no space
    const mentionPattern = /(?:^|\s)@[\w]*$/;
    const match = textBefore.match(mentionPattern);

    return match && this.state.selection.empty;
  }

  destroy() {
    this.tippyInstance.destroy();
    this.popover.remove();
  }
}
