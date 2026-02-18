import { EventEmitter } from 'eventemitter3';
import { createApp } from 'vue';
import { undoDepth, redoDepth } from 'prosemirror-history';
import { makeDefaultItems } from './defaultItems';
import { getActiveFormatting } from '@core/helpers/getActiveFormatting.js';
import { findParentNode } from '@helpers/index.js';
import { vClickOutside } from '@superdoc/common';
import Toolbar from './Toolbar.vue';
import {
  checkAndProcessImage,
  replaceSelectionWithImagePlaceholder,
  uploadAndInsertImage,
  getFileOpener,
} from '../../extensions/image/imageHelpers/index.js';
import { toolbarIcons } from './toolbarIcons.js';
import { toolbarTexts } from './toolbarTexts.js';
import { getQuickFormatList } from '@extensions/linked-styles/index.js';
import { getAvailableColorOptions, makeColorOption, renderColorOptions } from './color-dropdown-helpers.js';
import { isInTable } from '@helpers/isInTable.js';
import { useToolbarItem } from '@components/toolbar/use-toolbar-item';
import { yUndoPluginKey } from 'y-prosemirror';
import { isNegatedMark } from './format-negation.js';
import { collectTrackedChanges, isTrackedChangeActionAllowed } from '@extensions/track-changes/permission-helpers.js';
import { isList } from '@core/commands/list-helpers';
import { calculateResolvedParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';
import { twipsToLines } from '@converter/helpers';
import { parseSizeUnit } from '@core/utilities';
import { NodeSelection } from 'prosemirror-state';

/**
 * @typedef {function(CommandItem): void} CommandCallback
 * A callback function that's executed when a toolbar button is clicked
 * @param {CommandItem} params - Command parameters
 * @param {ToolbarItem} params.item - An instance of the useToolbarItem composable
 * @param {*} [params.argument] - The argument passed to the command
 */

/**
 * @typedef {Object} ToolbarConfig
 * @property {string} [selector] - CSS selector for the toolbar container
 * @property {string[]} [toolbarGroups=['left', 'center', 'right']] - Groups to organize toolbar items
 * @property {string} [role='editor'] - Role of the toolbar ('editor' or 'viewer')
 * @property {Object} [icons] - Custom icons for toolbar items
 * @property {Object} [texts] - Custom texts for toolbar items
 * @property {string} [mode='docx'] - Editor mode
 * @property {string[]} [excludeItems=[]] - Items to exclude from the toolbar
 * @property {Object} [groups=null] - Custom groups configuration
 * @property {Object} [editor=null] - The editor instance
 * @property {string} [aiApiKey=null] - API key for AI integration
 * @property {string} [aiEndpoint=null] - Endpoint for AI integration
 * @property {ToolbarItem[]} [customButtons=[]] - Custom buttons to add to the toolbar
 */

/**
 * @typedef {Object} ToolbarItem
 * @property {Object} id - The unique ID of the toolbar item
 * @property {string} id.value - The value of the ID
 * @property {Object} name - The name of the toolbar item
 * @property {string} name.value - The value of the name
 * @property {string} type - The type of toolbar item (button, options, separator, dropdown, overflow)
 * @property {Object} group - The group the item belongs to
 * @property {string} group.value - The value of the group
 * @property {string|CommandCallback} command - The command to execute
 * @property {string} [noArgumentCommand] - The command to execute when no argument is provided
 * @property {Object} icon - The icon for the item
 * @property {*} icon.value - The value of the icon
 * @property {Object} tooltip - The tooltip for the item
 * @property {*} tooltip.value - The value of the tooltip
 * @property {boolean} [restoreEditorFocus] - Whether to restore editor focus after command execution
 * @property {Object} attributes - Additional attributes for the item
 * @property {Object} attributes.value - The value of the attributes
 * @property {Object} disabled - Whether the item is disabled
 * @property {boolean} disabled.value - The value of disabled
 * @property {Object} active - Whether the item is active
 * @property {boolean} active.value - The value of active
 * @property {Object} expand - Whether the item is expanded
 * @property {boolean} expand.value - The value of expand
 * @property {Object} nestedOptions - Nested options for the item
 * @property {Array} nestedOptions.value - The array of nested options
 * @property {Object} style - Custom style for the item
 * @property {*} style.value - The value of the style
 * @property {Object} isNarrow - Whether the item has narrow styling
 * @property {boolean} isNarrow.value - The value of isNarrow
 * @property {Object} isWide - Whether the item has wide styling
 * @property {boolean} isWide.value - The value of isWide
 * @property {Object} minWidth - Minimum width of the item
 * @property {*} minWidth.value - The value of minWidth
 * @property {Object} argument - The argument to pass to the command
 * @property {*} argument.value - The value of the argument
 * @property {Object} parentItem - The parent of this item if nested
 * @property {*} parentItem.value - The value of parentItem
 * @property {Object} childItem - The child of this item if it has one
 * @property {*} childItem.value - The value of childItem
 * @property {Object} iconColor - The color of the icon
 * @property {*} iconColor.value - The value of iconColor
 * @property {Object} hasCaret - Whether the item has a dropdown caret
 * @property {boolean} hasCaret.value - The value of hasCaret
 * @property {Object} dropdownStyles - Custom styles for dropdown
 * @property {*} dropdownStyles.value - The value of dropdownStyles
 * @property {Object} tooltipVisible - Whether the tooltip is visible
 * @property {boolean} tooltipVisible.value - The value of tooltipVisible
 * @property {Object} tooltipTimeout - Timeout for the tooltip
 * @property {*} tooltipTimeout.value - The value of tooltipTimeout
 * @property {Object} defaultLabel - The default label for the item
 * @property {*} defaultLabel.value - The value of the default label
 * @property {Object} label - The label for the item
 * @property {*} label.value - The value of the label
 * @property {Object} hideLabel - Whether to hide the label
 * @property {boolean} hideLabel.value - The value of hideLabel
 * @property {Object} inlineTextInputVisible - Whether inline text input is visible
 * @property {boolean} inlineTextInputVisible.value - The value of inlineTextInputVisible
 * @property {Object} hasInlineTextInput - Whether the item has inline text input
 * @property {boolean} hasInlineTextInput.value - The value of hasInlineTextInput
 * @property {Object} markName - The name of the mark
 * @property {*} markName.value - The value of markName
 * @property {Object} labelAttr - The attribute for the label
 * @property {*} labelAttr.value - The value of labelAttr
 * @property {Object} allowWithoutEditor - Whether the item can be used without an editor
 * @property {boolean} allowWithoutEditor.value - The value of allowWithoutEditor
 * @property {Object} dropdownValueKey - The key for dropdown value
 * @property {*} dropdownValueKey.value - The value of dropdownValueKey
 * @property {Object} selectedValue - The selected value for the item
 * @property {*} selectedValue.value - The value of the selected value
 * @property {Object} inputRef - Reference to an input element
 * @property {*} inputRef.value - The value of inputRef
 * @property {Function} unref - Function to get unreferenced values
 * @property {Function} activate - Function to activate the item
 * @property {Function} deactivate - Function to deactivate the item
 * @property {Function} setDisabled - Function to set the disabled state
 * @property {Function} resetDisabled - Function to reset the disabled state
 * @property {Function} onActivate - Function called when the item is activated
 * @property {Function} onDeactivate - Function called when the item is deactivated
 */

/**
 * @typedef {Object} CommandItem
 * @property {ToolbarItem} item - The toolbar item
 * @property {*} [argument] - The argument to pass to the command
 */

/**
 * A customizable toolbar for the Super Editor
 * @class
 * @extends EventEmitter
 */
export class SuperToolbar extends EventEmitter {
  /**
   * Mark toggle names used to identify mark commands that need special handling
   * when the editor is not focused.
   * @type {Set<string>}
   * @private
   */
  static #MARK_TOGGLE_NAMES = new Set([
    'bold',
    'italic',
    'underline',
    'strike',
    'highlight',
    'color',
    'fontSize',
    'fontFamily',
  ]);

  /**
   * Default configuration for the toolbar
   * @type {ToolbarConfig}
   */
  config = {
    selector: null,
    toolbarGroups: ['left', 'center', 'right'],
    role: 'editor',
    icons: { ...toolbarIcons },
    texts: { ...toolbarTexts },
    fonts: null,
    hideButtons: true,
    responsiveToContainer: false,
    mode: 'docx',
    excludeItems: [],
    groups: null,
    editor: null,
    aiApiKey: null,
    aiEndpoint: null,
    customButtons: [],
  };

  /**
   * Creates a new SuperToolbar instance
   * @param {ToolbarConfig} config - The configuration for the toolbar
   * @returns {void}
   */
  constructor(config) {
    super();

    this.config = { ...this.config, ...config };
    this.toolbarItems = [];
    this.overflowItems = [];
    this.documentMode = config.documentMode || 'editing';
    this.isDev = config.isDev || false;
    this.superdoc = config.superdoc;
    this.role = config.role || 'editor';
    this.toolbarContainer = null;

    if (this.config.editor) {
      this.config.mode = this.config.editor.options.mode;
    }

    this.config.icons = {
      ...toolbarIcons,
      ...config.icons,
    };

    this.config.texts = {
      ...toolbarTexts,
      ...config.texts,
    };

    this.config.hideButtons = config.hideButtons ?? true;
    this.config.responsiveToContainer = config.responsiveToContainer ?? false;

    /**
     * Queue of mark commands to execute when editor regains focus.
     * @type {Array<{command: string, argument: *, item: ToolbarItem}>}
     * @private
     */
    this.pendingMarkCommands = [];

    /**
     * Persisted stored marks to re-apply when the selection is empty and has no formatting.
     * @type {import('prosemirror-model').Mark[]|null}
     * @private
     */
    this.stickyStoredMarks = null;

    /**
     * Bound event handlers stored for proper cleanup when switching editors.
     * @type {{transaction: Function|null, selectionUpdate: Function|null, focus: Function|null}}
     * @private
     */
    this._boundEditorHandlers = {
      transaction: null,
      selectionUpdate: null,
      focus: null,
    };

    /**
     * Timeout ID for restoring editor focus after toolbar command execution.
     * Tracked for cleanup on destroy to prevent callbacks firing after toolbar is unmounted.
     * @type {number|null}
     * @private
     */
    this._restoreFocusTimeoutId = null;

    // Move legacy 'element' to 'selector'
    if (!this.config.selector && this.config.element) {
      this.config.selector = this.config.element;
    }

    this.toolbarContainer = this.findElementBySelector(this.config.selector);
    if (this.toolbarContainer) {
      const uiFontFamily =
        (this.config?.uiDisplayFallbackFont || '').toString().trim() || 'Arial, Helvetica, sans-serif';
      // Set the --sd-ui-font-family CSS variable on the toolbar container.
      // This variable is used throughout the toolbar and its child components
      // to ensure consistent typography across all UI surfaces (dropdowns, tooltips, etc.)
      this.toolbarContainer.style.setProperty('--sd-ui-font-family', uiFontFamily);
    }
    this.#initToolbarGroups();
    this.#makeToolbarItems({
      superToolbar: this,
      icons: this.config.icons,
      texts: this.config.texts,
      fonts: this.config.fonts,
      hideButtons: this.config.hideButtons,
      isDev: config.isDev,
    });

    if (this.config.selector && !this.toolbarContainer) {
      return;
    }

    this.app = createApp(Toolbar);
    this.app.directive('click-outside', vClickOutside);
    this.app.config.globalProperties.$toolbar = this;
    if (this.toolbarContainer) {
      this.toolbar = this.app.mount(this.toolbarContainer);
    }
    this.activeEditor = config.editor || null;
    this.updateToolbarState();
  }

  findElementBySelector(selector) {
    let el = null;

    if (selector) {
      if (selector.startsWith('#') || selector.startsWith('.')) {
        el = document.querySelector(selector);
      } else {
        el = document.getElementById(selector);
      }

      if (!el) {
        return null;
      }
    }

    return el;
  }

  /**
   * Initiate toolbar groups
   * @private
   * @returns {void}
   */
  #initToolbarGroups() {
    // If groups is configured, override toolbarGroups
    if (this.config.groups && !Array.isArray(this.config.groups) && Object.keys(this.config.groups).length) {
      this.config.toolbarGroups = Object.keys(this.config.groups);
    }
  }

  /**
   * Custom commands that override default behavior
   * @private
   * @type {Object.<string, function(CommandItem): void>}
   */
  #interceptedCommands = {
    /**
     * Handles zoom level changes
     * @param {Object} params - Command parameters
     * @param {CommandItem} params.item - The command item
     * @param {string|number} params.argument - The zoom level (percentage)
     * @returns {void}
     */
    setZoom: ({ item, argument }) => {
      // Currently only set up to work with full SuperDoc
      if (!argument) return;
      item.onActivate({ zoom: argument });

      this.emit('superdoc-command', { item, argument });

      // NOTE: Zoom is now handled by PresentationEditor via transform: scale() on #viewportHost.
      // We do NOT apply CSS zoom on .layers anymore because:
      // 1. It causes coordinate system mismatches between zoomed content and overlays
      // 2. PresentationEditor.setGlobalZoom() is called when activeZoom changes (via SuperDoc.vue watcher)
      // 3. Centralizing zoom in PresentationEditor ensures both content and selection overlays scale together

      this.superdoc.superdocStore.activeZoom = parseInt(argument, 10);
    },

    /**
     * Sets the document mode
     * @param {Object} params - Command parameters
     * @param {CommandItem} params.item - The command item
     * @param {string} params.argument - The document mode to set
     * @returns {void}
     */
    setDocumentMode: ({ item, argument }) => {
      if (!argument) return;

      this.emit('superdoc-command', { item, argument });
    },

    /**
     * Sets the font size for text
     * @param {Object} params - Command parameters
     * @param {CommandItem} params.item - The command item
     * @param {string|number} params.argument - The font size to set
     * @returns {void}
     */
    setFontSize: ({ item, argument }) => {
      if (this.#isFieldAnnotationSelection() && argument) {
        this.activeEditor?.commands.setFieldAnnotationsFontSize(argument, true);
        this.updateToolbarState();
        return;
      }

      this.#runCommandWithArgumentOnly({ item, argument }, () => {
        this.activeEditor?.commands.setFieldAnnotationsFontSize(argument, true);
      });
    },

    /**
     * Sets the font family for text
     * @param {Object} params - Command parameters
     * @param {CommandItem} params.item - The command item
     * @param {string} params.argument - The font family to set
     * @returns {void}
     */
    setFontFamily: ({ item, argument }) => {
      if (this.#isFieldAnnotationSelection() && argument) {
        this.activeEditor?.commands.setFieldAnnotationsFontFamily(argument, true);
        this.updateToolbarState();
        return;
      }

      this.#runCommandWithArgumentOnly({ item, argument }, () => {
        this.activeEditor?.commands.setFieldAnnotationsFontFamily(argument, true);
      });
    },

    /**
     * Sets the text color
     * @param {Object} params - Command parameters
     * @param {CommandItem} params.item - The command item
     * @param {string} params.argument - The color to set
     * @returns {void}
     */
    setColor: ({ argument }) => {
      if (!argument || !this.activeEditor) return;
      const isNone = argument === 'none';
      const value = isNone ? 'inherit' : argument;
      // Apply inline color; 'inherit' acts as a cascade-aware negation of style color
      if (this.activeEditor?.commands?.setColor) this.activeEditor.commands.setColor(value);
      // Update annotations color, but use null for none
      const argValue = isNone ? null : argument;
      this.activeEditor?.commands.setFieldAnnotationsTextColor(argValue, true);
      this.updateToolbarState();
    },

    /**
     * Sets the highlight color for text
     * @param {Object} params - Command parameters
     * @param {CommandItem} params.item - The command item
     * @param {string} params.argument - The highlight color to set
     * @returns {void}
     */
    setHighlight: ({ argument }) => {
      if (!argument || !this.activeEditor) return;
      // For cascade-aware negation, keep a highlight mark present using 'transparent'
      const inlineColor = argument !== 'none' ? argument : 'transparent';
      if (this.activeEditor?.commands?.setHighlight) this.activeEditor.commands.setHighlight(inlineColor);
      // Update annotations highlight; 'none' -> null
      const argValue = argument !== 'none' ? argument : null;
      this.activeEditor?.commands.setFieldAnnotationsTextHighlight(argValue, true);
      this.activeEditor?.commands.setCellBackground(argValue);
      this.updateToolbarState();
    },

    /**
     * Toggles the ruler visibility
     * @returns {void}
     */
    toggleRuler: () => {
      this.superdoc.toggleRuler();
      this.updateToolbarState();
    },

    /**
     * Initiates the image upload process
     * @async
     * @returns {Promise<void>}
     */
    startImageUpload: async () => {
      try {
        let open = getFileOpener();
        let result = await open();

        if (!result?.file) {
          return;
        }

        const { size, file } = await checkAndProcessImage({
          file: result.file,
          getMaxContentSize: () => this.activeEditor.getMaxContentSize(),
        });

        if (!file) {
          return;
        }

        const id = {};

        replaceSelectionWithImagePlaceholder({
          view: this.activeEditor.view,
          editorOptions: this.activeEditor.options,
          id,
        });

        await uploadAndInsertImage({
          editor: this.activeEditor,
          view: this.activeEditor.view,
          file,
          size,
          id,
        });
      } catch (error) {
        const err = new Error('[super-toolbar 🎨] Image upload failed');
        this.emit('exception', { error: err, editor: this.activeEditor, originalError: error });
        console.error(err, error);
      }
    },

    /**
     * Increases text indentation or list level
     * @param {Object} params - Command parameters
     * @param {CommandItem} params.item - The command item
     * @param {*} params.argument - Command arguments
     * @returns {void}
     */
    increaseTextIndent: ({ item, argument }) => {
      let command = item.command;

      if (this.activeEditor.commands.increaseListIndent?.()) {
        return true;
      }

      if (command in this.activeEditor.commands) {
        this.activeEditor.commands[command](argument);
      }
    },

    /**
     * Decreases text indentation or list level
     * @param {Object} params - Command parameters
     * @param {CommandItem} params.item - The command item
     * @param {*} params.argument - Command arguments
     * @returns {boolean}
     */
    decreaseTextIndent: ({ item, argument }) => {
      let command = item.command;

      if (this.activeEditor.commands.decreaseListIndent?.()) {
        return true;
      }

      if (command in this.activeEditor.commands) {
        this.activeEditor.commands[command](argument);
      }
    },

    /**
     * Toggles bold formatting for text
     * @param {Object} params - Command parameters
     * @param {CommandItem} params.item - The command item
     * @param {*} params.argument - Command arguments
     * @returns {void}
     */
    toggleBold: ({ item, argument }) => {
      if (this.#isFieldAnnotationSelection()) {
        this.activeEditor?.commands.toggleFieldAnnotationsFormat('bold', true);
        this.updateToolbarState();
        return;
      }

      let command = item.command;
      if (command in this.activeEditor.commands) {
        this.activeEditor.commands[command](argument);
        this.activeEditor.commands.toggleFieldAnnotationsFormat('bold', true);
      }

      this.updateToolbarState();
    },

    /**
     * Toggles italic formatting for text
     * @param {Object} params - Command parameters
     * @param {CommandItem} params.item - The command item
     * @param {*} params.argument - Command arguments
     * @returns {void}
     */
    toggleItalic: ({ item, argument }) => {
      if (this.#isFieldAnnotationSelection()) {
        this.activeEditor?.commands.toggleFieldAnnotationsFormat('italic', true);
        this.updateToolbarState();
        return;
      }

      let command = item.command;
      if (command in this.activeEditor.commands) {
        this.activeEditor.commands[command](argument);
        this.activeEditor.commands.toggleFieldAnnotationsFormat('italic', true);
      }

      this.updateToolbarState();
    },

    /**
     * Toggles underline formatting for text
     * @param {Object} params - Command parameters
     * @param {CommandItem} params.item - The command item
     * @param {*} params.argument - Command arguments
     * @returns {void}
     */
    toggleUnderline: ({ item, argument }) => {
      if (this.#isFieldAnnotationSelection()) {
        this.activeEditor?.commands.toggleFieldAnnotationsFormat('underline', true);
        this.updateToolbarState();
        return;
      }

      let command = item.command;
      if (command in this.activeEditor.commands) {
        this.activeEditor.commands[command](argument);
        this.activeEditor.commands.toggleFieldAnnotationsFormat('underline', true);
      }

      this.updateToolbarState();
    },

    /**
     * Toggles link formatting and updates cursor position
     * @param {Object} params - Command parameters
     * @param {CommandItem} params.item - The command item
     * @param {*} params.argument - Command arguments
     * @returns {void}
     */
    toggleLink: ({ item, argument }) => {
      let command = item.command;

      if (command in this.activeEditor.commands) {
        this.activeEditor.commands[command](argument);

        // move cursor to end
        const { view } = this.activeEditor;
        let { selection } = view.state;
        if (this.activeEditor.options.isHeaderOrFooter) {
          selection = this.activeEditor.options.lastSelection;
        }
        const endPos = selection.$to.pos;

        const newSelection = new TextSelection(view.state.doc.resolve(endPos));
        const tr = view.state.tr.setSelection(newSelection);
        const state = view.state.apply(tr);
        view.updateState(state);

        if (!this.activeEditor.options.isHeaderOrFooter) {
          setTimeout(() => {
            view.focus();
          }, 100);
        }
      }
      this.updateToolbarState();
    },

    /**
     * Inserts a table into the document
     * @param {Object} params - Command parameters
     * @param {CommandItem} params.item - The command item
     * @param {Object} params.argument - Table configuration
     * @returns {void}
     */
    insertTable: ({ item, argument }) => {
      this.#runCommandWithArgumentOnly({ item, argument });
    },

    /**
     * Executes a table-related command
     * @param {Object} params - Command parameters
     * @param {Object} params.argument - The table command and its parameters
     * @param {string} params.argument.command - The specific table command to execute
     * @returns {void}
     */
    executeTableCommand: ({ argument }) => {
      if (!argument) return;

      let command = argument.command;

      if (command in this.activeEditor.commands) {
        this.activeEditor.commands[command](argument);
      }

      this.updateToolbarState();
    },
  };

  /**
   * Log debug information to the console
   * @param {...*} args - Arguments to log
   * @returns {void}
   */
  log(...args) {
    console.debug('[🎨 super-toolbar]', ...args);
  }

  /**
   * Set the zoom level
   * @param {number} percent_int - The zoom percentage as an integer
   * @returns {void}
   */
  setZoom(percent_int) {
    const allItems = [...this.toolbarItems, ...this.overflowItems];
    const item = allItems.find((item) => item.name.value === 'zoom');
    this.#interceptedCommands.setZoom({ item, argument: percent_int });
  }

  /**
   * The toolbar expects an active Super Editor instance.
   * Removes listeners from the previous editor (if any) before attaching to the new one.
   * @param {Object|null} editor - The editor instance to attach to the toolbar, or null to detach
   * @returns {void}
   */
  setActiveEditor(editor) {
    // Remove listeners from previous editor to prevent memory leaks
    if (this.activeEditor && this._boundEditorHandlers.transaction) {
      this.activeEditor.off('transaction', this._boundEditorHandlers.transaction);
      this.activeEditor.off('selectionUpdate', this._boundEditorHandlers.selectionUpdate);
      this.activeEditor.off('focus', this._boundEditorHandlers.focus);
      // Clear bound handlers when removing editor
      this._boundEditorHandlers.transaction = null;
      this._boundEditorHandlers.selectionUpdate = null;
      this._boundEditorHandlers.focus = null;
    }

    this.activeEditor = editor;

    // Only attach listeners if editor is not null
    if (editor) {
      // Create and store bound handlers for later cleanup
      this._boundEditorHandlers.transaction = this.onEditorTransaction.bind(this);
      this._boundEditorHandlers.selectionUpdate = this.onEditorSelectionUpdate.bind(this);
      this._boundEditorHandlers.focus = this.onEditorFocus.bind(this);

      this.activeEditor.on('transaction', this._boundEditorHandlers.transaction);
      this.activeEditor.on('selectionUpdate', this._boundEditorHandlers.selectionUpdate);
      this.activeEditor.on('focus', this._boundEditorHandlers.focus);
    }
  }

  /**
   * Get toolbar items by group name
   * @param {string} groupName - The name of the group
   * @returns {ToolbarItem[]} An array of toolbar items in the specified group
   */
  getToolbarItemByGroup(groupName) {
    return this.toolbarItems.filter((item) => (item.group?.value || 'center') === groupName);
  }

  /**
   * Get a toolbar item by name
   * @param {string} name - The name of the toolbar item
   * @returns {ToolbarItem|undefined} The toolbar item with the specified name or undefined if not found
   */
  getToolbarItemByName(name) {
    return this.toolbarItems.find((item) => item.name.value === name);
  }

  /**
   * Create toolbar items based on configuration
   * @private
   * @param {SuperToolbar} options.superToolbar - The toolbar instance
   * @param {Object} options.icons - Icons to use for toolbar items
   * @param {Object} options.texts - Texts to use for toolbar items
   * @param {Array} options.fonts - Fonts for the toolbar item
   * @param {boolean} options.isDev - Whether in development mode
   * @returns {void}
   */
  #makeToolbarItems({ superToolbar, icons, texts, fonts, hideButtons, isDev = false } = {}) {
    const documentWidth = document.documentElement.clientWidth; // take into account the scrollbar
    const containerWidth = this.toolbarContainer?.offsetWidth ?? 0;
    const availableWidth = this.config.responsiveToContainer ? containerWidth : documentWidth;

    const { defaultItems, overflowItems } = makeDefaultItems({
      superToolbar,
      toolbarIcons: icons,
      toolbarTexts: texts,
      toolbarFonts: fonts,
      hideButtons,
      availableWidth,
      role: this.role,
      isDev,
    });

    const customItems = this.config.customButtons || [];
    if (customItems.length) {
      defaultItems.push(...customItems.map((item) => useToolbarItem({ ...item })));
    }

    let allConfigItems = [
      ...defaultItems.map((item) => item.name.value),
      ...overflowItems.map((item) => item.name.value),
    ];
    if (this.config.groups) allConfigItems = Object.values(this.config.groups).flatMap((item) => item);

    const filteredItems = defaultItems
      .filter((item) => allConfigItems.includes(item.name.value))
      .filter((item) => !this.config.excludeItems.includes(item.name.value));

    this.toolbarItems = filteredItems;
    this.overflowItems = overflowItems.filter((item) => allConfigItems.includes(item.name.value));
  }

  /**
   * Initialize default fonts from the editor
   * @private
   * @returns {void}
   */
  #initDefaultFonts() {
    if (!this.activeEditor || !this.activeEditor.converter) return;
    const { typeface = 'Arial', fontSizePt = 12 } = this.activeEditor.converter.getDocumentDefaultStyles() ?? {};
    const fontSizeItem = this.toolbarItems.find((item) => item.name.value === 'fontSize');
    if (fontSizeItem) fontSizeItem.defaultLabel.value = fontSizePt;

    const fontFamilyItem = this.toolbarItems.find((item) => item.name.value === 'fontFamily');
    if (fontFamilyItem) fontFamilyItem.defaultLabel.value = typeface;
  }

  /**
   * Update highlight color options based on document colors
   * @private
   * @returns {void}
   */
  #updateHighlightColors() {
    if (!this.activeEditor || !this.activeEditor.converter) return;
    if (!this.activeEditor.converter.docHiglightColors.size) return;

    const highlightItem = this.toolbarItems.find((item) => item.name.value === 'highlight');
    if (!highlightItem) return;

    const pickerColorOptions = getAvailableColorOptions();
    const perChunk = 7; // items per chunk

    const result = Array.from(this.activeEditor.converter.docHiglightColors).reduce((resultArray, item, index) => {
      const chunkIndex = Math.floor(index / perChunk);
      if (!resultArray[chunkIndex]) {
        resultArray[chunkIndex] = [];
      }

      if (!pickerColorOptions.includes(item)) resultArray[chunkIndex].push(makeColorOption(item));
      return resultArray;
    }, []);

    const option = {
      key: 'color',
      type: 'render',
      render: () => renderColorOptions(this, highlightItem, result, true),
    };

    highlightItem.nestedOptions.value = [option];
  }

  /**
   * Sync document mode dropdown UI with the current mode.
   * @private
   * @returns {void}
   */
  #syncDocumentModeUi() {
    const documentModeItem = this.getToolbarItemByName('documentMode');
    if (!documentModeItem) return;

    const mode = (this.documentMode || 'editing').toLowerCase();
    const texts = this.config.texts || {};
    const icons = this.config.icons || {};
    const map = {
      editing: {
        label: texts.documentEditingMode || 'Editing',
        icon: icons.documentEditingMode || icons.documentMode,
      },
      suggesting: {
        label: texts.documentSuggestingMode || 'Suggesting',
        icon: icons.documentSuggestingMode || icons.documentMode,
      },
      viewing: {
        label: texts.documentViewingMode || 'Viewing',
        icon: icons.documentViewingMode || icons.documentMode,
      },
    };

    const next = map[mode] || map.editing;
    if (documentModeItem.label?.value !== undefined) {
      documentModeItem.label.value = next.label;
    }
    if (documentModeItem.defaultLabel?.value !== undefined) {
      documentModeItem.defaultLabel.value = next.label;
    }
    if (documentModeItem.icon?.value !== undefined && next.icon) {
      documentModeItem.icon.value = next.icon;
    }
  }

  /**
   * Update the toolbar state based on the current editor state
   * Updates active/inactive state of all toolbar items
   * @returns {void}
   */
  updateToolbarState() {
    this.#syncDocumentModeUi();
    this.#updateToolbarHistory();
    this.#initDefaultFonts();
    this.#updateHighlightColors();

    // Deactivate toolbar items if no active editor
    // This will skip buttons that are marked as allowWithoutEditor
    if (!this.activeEditor || this.documentMode === 'viewing') {
      this.#deactivateAll();
      return;
    }

    const { state } = this.activeEditor;
    if (!state) {
      this.#deactivateAll();
      return;
    }
    const selection = state.selection;
    const selectionTrackedChanges = this.#enrichTrackedChanges(
      collectTrackedChanges({ state, from: selection.from, to: selection.to }),
    );
    const hasTrackedChanges = selectionTrackedChanges.length > 0;
    const hasValidSelection = hasTrackedChanges;
    const canAcceptTrackedChanges =
      hasValidSelection &&
      isTrackedChangeActionAllowed({
        editor: this.activeEditor,
        action: 'accept',
        trackedChanges: selectionTrackedChanges,
      });
    const canRejectTrackedChanges =
      hasValidSelection &&
      isTrackedChangeActionAllowed({
        editor: this.activeEditor,
        action: 'reject',
        trackedChanges: selectionTrackedChanges,
      });

    const marks = getActiveFormatting(this.activeEditor);
    const inTable = isInTable(this.activeEditor.state);
    const paragraphParent = findParentNode((n) => n.type.name === 'paragraph')(selection);
    const paragraphProps = paragraphParent
      ? calculateResolvedParagraphProperties(
          this.activeEditor,
          paragraphParent.node,
          state.doc.resolve(paragraphParent.pos),
        )
      : null;

    this.toolbarItems.forEach((item) => {
      item.resetDisabled();

      if (item.name.value === 'undo') {
        item.setDisabled(this.undoDepth === 0);
      }

      if (item.name.value === 'redo') {
        item.setDisabled(this.redoDepth === 0);
      }

      if (item.name.value === 'acceptTrackedChangeBySelection') {
        item.setDisabled(!canAcceptTrackedChanges);
      }

      if (item.name.value === 'rejectTrackedChangeOnSelection') {
        item.setDisabled(!canRejectTrackedChanges);
      }

      // Linked Styles dropdown behaves a bit different from other buttons.
      // We need to disable it manually if there are no linked styles to show
      if (item.name.value === 'linkedStyles') {
        if (this.activeEditor && !getQuickFormatList(this.activeEditor).length) {
          return item.deactivate();
        } else {
          return item.activate({ styleId: paragraphProps?.styleId || null });
        }
      }

      const rawActiveMark = marks.find((mark) => mark.name === item.name.value);
      const markNegated = rawActiveMark ? isNegatedMark(rawActiveMark.name, rawActiveMark.attrs) : false;
      const activeMark = markNegated ? null : rawActiveMark;

      if (activeMark) {
        if (activeMark.name === 'fontSize') {
          const fontSizes = marks.filter((i) => i.name === 'fontSize').map((i) => i.attrs.fontSize);
          const isMultiple = [...new Set(fontSizes)].length > 1;
          item.activate(activeMark.attrs, isMultiple);
        } else {
          item.activate(activeMark.attrs);
        }
      } else {
        item.deactivate();
      }

      // Activate toolbar items based on linked styles (if there's no active mark to avoid overriding  it)
      if (!activeMark && !markNegated && paragraphParent && paragraphProps?.styleId) {
        const markToStyleMap = {
          fontSize: 'font-size',
          fontFamily: 'font-family',
          bold: 'bold',
        };
        const linkedStyles = this.activeEditor.converter?.linkedStyles.find(
          (style) => style.id === paragraphProps.styleId,
        );
        if (
          linkedStyles &&
          linkedStyles.definition &&
          linkedStyles.definition.styles &&
          markToStyleMap[item.name.value] in linkedStyles.definition.styles
        ) {
          const linkedStylesItem = linkedStyles.definition.styles[markToStyleMap[item.name.value]];
          const value = {
            [item.name.value]: linkedStylesItem,
          };
          item.activate(value);
        }
      }
      if (item.name.value === 'textAlign' && paragraphProps?.justification) {
        item.activate({ textAlign: paragraphProps.justification });
      }

      if (item.name.value === 'lineHeight') {
        if (paragraphProps?.spacing) {
          item.selectedValue.value = twipsToLines(paragraphProps.spacing.line);
        } else {
          item.selectedValue.value = '';
        }
      }

      if (item.name.value === 'tableActions') {
        item.disabled.value = !inTable;
      }

      // Activate list buttons when selections is inside list
      const listParent = isList(paragraphParent?.node) ? paragraphParent.node : null;
      if (listParent) {
        const numberingType = listParent.attrs.listRendering.numberingType;
        if (item.name.value === 'list' && numberingType === 'bullet') {
          item.activate();
        } else if (item.name.value === 'numberedlist' && numberingType !== 'bullet') {
          item.activate();
        }
      }

      // Activate ruler button when rulers are visible
      if (item.name.value === 'ruler') {
        if (this.superdoc?.config?.rulers) {
          item.activate();
        } else {
          item.deactivate();
        }
      }
    });
  }

  /**
   * Handler for toolbar resize events
   * @returns {void}
   */
  onToolbarResize = () => {
    this.#makeToolbarItems({
      superToolbar: this,
      icons: this.config.icons,
      texts: this.config.texts,
      fonts: this.config.fonts,
      hideButtons: this.config.hideButtons,
      isDev: this.isDev,
    });

    if (this.role === 'viewer') {
      this.#deactivateAll();
    }

    this.updateToolbarState();
  };

  /**
   * Deactivate all toolbar items
   * @private
   * @returns {void}
   */
  #deactivateAll() {
    this.activeEditor = null;
    this.toolbarItems.forEach((item) => {
      const { allowWithoutEditor } = item;
      if (allowWithoutEditor.value) return;
      item.setDisabled(true);
    });
  }

  /**
   * Update undo/redo history state in the toolbar
   * @private
   * @returns {void}
   */
  #updateToolbarHistory() {
    if (!this.activeEditor?.state) return;

    try {
      if (this.activeEditor.options.ydoc) {
        const undoManager = yUndoPluginKey.getState(this.activeEditor.state)?.undoManager;
        this.undoDepth = undoManager?.undoStack.length || 0;
        this.redoDepth = undoManager?.redoStack.length || 0;
      } else {
        this.undoDepth = undoDepth(this.activeEditor.state);
        this.redoDepth = redoDepth(this.activeEditor.state);
      }
    } catch {
      // History plugin may not be registered yet during initialization
      this.undoDepth = 0;
      this.redoDepth = 0;
    }
  }

  #enrichTrackedChanges(trackedChanges = []) {
    if (!trackedChanges?.length) return trackedChanges;
    const store = this.superdoc?.commentsStore;
    if (!store?.getComment) return trackedChanges;

    return trackedChanges.map((change) => {
      const commentId = change.id;
      if (!commentId) return change;
      const storeComment = store.getComment(commentId);
      if (!storeComment) return change;
      const comment = typeof storeComment.getValues === 'function' ? storeComment.getValues() : storeComment;
      return { ...change, comment };
    });
  }

  /**
   * React to editor transactions. Might want to debounce this.
   * @param {Object} params - Transaction parameters
   * @param {Object} params.transaction - The transaction object
   * @returns {void}
   */
  onEditorTransaction({ transaction }) {
    if (!transaction.docChanged && !transaction.selectionSet) return;
    this.updateToolbarState();
  }

  /**
   * Main handler for toolbar commands
   * @param {CommandItem} params - Command parameters
   * @param {ToolbarItem} params.item - An instance of the useToolbarItem composable
   * @param {*} [params.argument] - The argument passed to the command
   * @returns {*} The result of the executed command, undefined if no result is returned
   */
  emitCommand({ item, argument, option }) {
    const hasFocusFn = this.activeEditor?.view?.hasFocus;
    const wasFocused = Boolean(typeof hasFocusFn === 'function' && hasFocusFn.call(this.activeEditor.view));
    const { command } = item;
    const isMarkToggle = this.isMarkToggle(item);
    const shouldRestoreFocus = Boolean(item?.restoreEditorFocus);

    const hasArgument = argument !== null && argument !== undefined;
    const isDropdownOpen = item?.type === 'dropdown' && !hasArgument;
    const isFontCommand = item?.command === 'setFontFamily' || item?.command === 'setFontSize';
    if (isDropdownOpen && isFontCommand) {
      // Opening/closing a dropdown should not shift editor focus or alter selection state.
      return;
    }

    // If the editor wasn't focused and this is a mark toggle, queue it and keep the button active
    // until the next selection update (after the user clicks into the editor).
    if (!wasFocused && isMarkToggle) {
      this.pendingMarkCommands.push({ command, argument, item });
      item?.activate?.();
      if (this.activeEditor && !this.activeEditor.options.isHeaderOrFooter) {
        this.activeEditor.focus();
      }
      return;
    }

    if (this.activeEditor && !this.activeEditor.options.isHeaderOrFooter) {
      this.activeEditor.focus();
    }

    if (!command) {
      return;
    }

    // Check if we have a custom or overloaded command defined
    if (command in this.#interceptedCommands) {
      const result = this.#interceptedCommands[command]({ item, argument });
      if (isMarkToggle) this.#syncStickyMarksFromState();
      return result;
    }

    if (this.activeEditor && this.activeEditor.commands && command in this.activeEditor.commands) {
      this.activeEditor.commands[command](argument);
    }

    // If the command is a function, call it with the argument
    else if (typeof command === 'function') {
      command({ item, argument, option });
    }

    // If we don't know what to do with this command, throw an error
    else {
      const error = new Error(`[super-toolbar 🎨] Command not found: ${command}`);
      this.emit('exception', { error, editor: this.activeEditor });

      throw error;
    }

    if (isMarkToggle) this.#syncStickyMarksFromState();
    this.updateToolbarState();

    if (shouldRestoreFocus && this.activeEditor && !this.activeEditor.options.isHeaderOrFooter) {
      this._restoreFocusTimeoutId = setTimeout(() => {
        this._restoreFocusTimeoutId = null;
        if (!this.activeEditor || this.activeEditor.options.isHeaderOrFooter) return;
        this.activeEditor.focus();
      }, 0);
    }
  }

  /**
   * Processes and executes pending mark commands when editor selection updates.
   * This is triggered by the editor's 'selectionUpdate' event after focus is restored.
   * Clears the pending queue after execution.
   * @returns {void}
   */
  onEditorSelectionUpdate() {
    if (!this.activeEditor) return;

    if (this.pendingMarkCommands.length) {
      const pending = this.pendingMarkCommands;
      this.pendingMarkCommands = [];

      pending.forEach(({ command, argument, item }) => {
        if (!command) return;

        try {
          if (command in this.#interceptedCommands) {
            this.#interceptedCommands[command]({ item, argument });
          } else if (this.activeEditor.commands && command in this.activeEditor.commands) {
            this.activeEditor.commands[command](argument);
          }
          this.#ensureStoredMarksForMarkToggle({ command, argument });
        } catch (error) {
          const err = new Error(`[super-toolbar 🎨] Failed to execute pending command: ${command}`);
          this.emit('exception', { error: err, editor: this.activeEditor, originalError: error });
          console.error(err, error);
        }
      });

      this.#syncStickyMarksFromState();
      this.updateToolbarState();
      return;
    }

    const restored = this.#restoreStickyMarksIfNeeded();
    if (restored) this.updateToolbarState();
  }

  /**
   * Handles editor focus events by flushing any pending mark commands.
   * This is triggered by the editor's 'focus' event.
   * @returns {void}
   */
  onEditorFocus() {
    if (this.pendingMarkCommands.length) {
      this.onEditorSelectionUpdate();
      return;
    }

    const restored = this.#restoreStickyMarksIfNeeded();
    if (restored) this.updateToolbarState();
  }

  /**
   * Determines if a toolbar item represents a mark toggle command.
   * Mark toggles include text formatting commands like bold, italic, underline, etc.
   * @param {ToolbarItem} item - The toolbar item to check
   * @returns {boolean} True if the item is a mark toggle, false otherwise
   */
  isMarkToggle(item) {
    const name = item?.name?.value;
    return SuperToolbar.#MARK_TOGGLE_NAMES.has(name);
  }

  /**
   * Run a command that requires an argument
   * @private
   * @param {CommandItem} params - Command parameters
   * @param {ToolbarItem} params.item - The toolbar item
   * @param {*} params.argument - The argument for the command
   * @param {boolean} params.noArgumentCallback - Whether to call callback even if argument === 'none'
   * @param {Function} [callback] - Optional callback to run after the command
   * @returns {void}
   */
  #runCommandWithArgumentOnly({ item, argument, noArgumentCallback = false }, callback) {
    if (!argument || !this.activeEditor) return;

    let command = item.command;
    const noArgumentCommand = item.noArgumentCommand;

    if (
      argument === 'none' &&
      this.activeEditor &&
      this.activeEditor.commands &&
      noArgumentCommand in this.activeEditor.commands
    ) {
      this.activeEditor.commands[noArgumentCommand]();
      if (typeof callback === 'function' && noArgumentCallback) callback(argument);
      this.updateToolbarState();
      return;
    }

    if (this.activeEditor && this.activeEditor.commands && command in this.activeEditor.commands) {
      this.activeEditor.commands[command](argument);
      if (typeof callback === 'function') callback(argument);
      this.updateToolbarState();
    }
  }

  /**
   * Capture stored marks when a mark toggle is used on an empty selection
   * so they can be re-applied after focus/selection changes.
   * @private
   * @returns {void}
   */
  #syncStickyMarksFromState() {
    if (!this.activeEditor) return;
    const { selection, storedMarks } = this.activeEditor.state || {};

    if (!selection?.empty) return;
    this.stickyStoredMarks = storedMarks?.length ? [...storedMarks] : null;
  }

  /**
   * Re-apply stored marks captured from toolbar toggles when the current
   * selection is empty and unformatted.
   * @private
   * @returns {boolean} True if marks were restored
   */
  #restoreStickyMarksIfNeeded() {
    if (!this.activeEditor) return false;
    if (!this.stickyStoredMarks?.length) return false;

    const { state, view } = this.activeEditor;
    const { selection, storedMarks } = state || {};

    if (!selection?.empty) return false;
    if (storedMarks?.length) return false;
    if (!view?.dispatch || !state?.tr) return false;

    const hasActiveMarkToggle = getActiveFormatting(this.activeEditor).some((mark) =>
      SuperToolbar.#MARK_TOGGLE_NAMES.has(mark.name),
    );
    if (hasActiveMarkToggle) return false;

    const tr = state.tr.setStoredMarks(this.stickyStoredMarks);
    view.dispatch(tr);
    return true;
  }

  /**
   * Fallback to ensure stored marks exist for mark toggles when executed off-focus.
   * Helps cases where a command doesn't set storedMarks (e.g., font size from toolbar before focus).
   * @private
   * @param {Object} params
   * @param {string} params.command
   * @param {*} params.argument
   * @returns {void}
   */
  #ensureStoredMarksForMarkToggle({ command, argument }) {
    if (!this.activeEditor) return;
    if (!this.activeEditor.state?.selection?.empty) return;
    if (this.activeEditor.state?.storedMarks?.length) return;

    // Currently only required for fontSize; extend as needed for other toggles.
    if (command !== 'setFontSize') return;

    const { state, view } = this.activeEditor;
    const textStyleMark = state.schema?.marks?.textStyle;
    if (!textStyleMark || !view?.dispatch || !state?.tr) return;

    const [value, unit] = parseSizeUnit(argument ?? '');
    if (Number.isNaN(value)) return;

    const clamped = Math.min(96, Math.max(8, Number(value)));
    const resolvedUnit = unit || 'pt';
    const mark = textStyleMark.create({ fontSize: `${clamped}${resolvedUnit}` });

    const tr = state.tr.setStoredMarks([mark]);
    view.dispatch(tr);
  }

  #isFieldAnnotationSelection() {
    const selection = this.activeEditor?.state?.selection;
    return selection instanceof NodeSelection && selection?.node?.type?.name === 'fieldAnnotation';
  }

  /**
   * Cleans up resources when the toolbar is destroyed.
   * Clears any pending timeouts to prevent callbacks firing after unmount.
   * @returns {void}
   */
  destroy() {
    if (this._restoreFocusTimeoutId !== null) {
      clearTimeout(this._restoreFocusTimeoutId);
      this._restoreFocusTimeoutId = null;
    }
  }
}
