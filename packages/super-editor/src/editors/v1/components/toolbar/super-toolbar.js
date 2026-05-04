import { EventEmitter } from 'eventemitter3';
import { createApp } from 'vue';
import { makeDefaultItems } from './defaultItems';
import { createHeadlessToolbar } from '../../../../headless-toolbar/create-headless-toolbar.js';
import { getActiveFormatting } from '@core/helpers/getActiveFormatting.js';
import { findParentNode } from '@helpers/index.js';
import { vClickOutside } from '@superdoc/common';
import Toolbar from './Toolbar.vue';
import { toolbarIcons } from './toolbarIcons.js';
import { toolbarTexts } from './toolbarTexts.js';
import {
  HEADLESS_TOOLBAR_COMMANDS,
  HEADLESS_ITEM_MAP,
  HEADLESS_EXECUTE_ITEMS,
  TABLE_ACTION_COMMAND_IDS,
  TABLE_ACTION_COMMAND_MAP,
} from './constants.js';
import { getAvailableColorOptions, makeColorOption, renderColorOptions } from './color-dropdown-helpers.js';
import { useToolbarItem } from '@components/toolbar/use-toolbar-item';
import { calculateResolvedParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';
import { parseSizeUnit } from '@core/utilities';
import { findElementBySelector, getParagraphFontFamilyFromProperties } from './helpers/general.js';
import { markerTextToBulletStyle } from '@helpers/list-numbering-helpers.js';

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
 * @property {import('../../core/types/EditorConfig.js').FontConfig[]} [fonts] - Font options for the font picker dropdown
 * @property {boolean} [hideButtons=true] - Whether to hide buttons when the editor is not focused
 * @property {boolean} [pagination=false] - Whether to show pagination controls
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
 * @property {*} [option] - The selected nested option for option-style commands
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
    this.isDev = config.isDev || false;
    this.superdoc = config.superdoc;
    this.role = config.role || 'editor';
    this.toolbarContainer = null;

    this.controller = null;
    this.snapshot = null;
    this._unsubscribeController = null;

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

    this.toolbarContainer = findElementBySelector(this.config.selector);
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

    this.initHeadlessToolbar();
    this.updateToolbarState();
  }

  createHeadlessToolbar() {
    if (!this.superdoc) return null;

    return createHeadlessToolbar({
      superdoc: this.superdoc,
      commands: HEADLESS_TOOLBAR_COMMANDS,
    });
  }

  initHeadlessToolbar() {
    if (!this.superdoc) return;

    this.destroyHeadlessToolbar();

    this.controller = this.createHeadlessToolbar();
    this.snapshot = this.controller.getSnapshot();

    this._unsubscribeController = this.controller.subscribe(({ snapshot }) => {
      this.snapshot = snapshot;
      this.updateToolbarState();
    });
  }

  destroyHeadlessToolbar() {
    this._unsubscribeController?.();
    this.controller?.destroy();
    this.controller = null;
    this.snapshot = null;
    this._unsubscribeController = null;
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
   * Get the width used for responsive toolbar decisions.
   * @returns {number} Available width in pixels
   */
  getAvailableWidth() {
    const documentWidth = document.documentElement.clientWidth; // take into account the scrollbar
    const containerWidth = this.toolbarContainer?.offsetWidth ?? 0;
    return this.config.responsiveToContainer ? containerWidth : documentWidth;
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
    const availableWidth = this.getAvailableWidth();

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

    const snapshotMode = this.snapshot?.commands?.['document-mode']?.value;
    const mode = (snapshotMode || 'editing').toLowerCase();
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

  // Empty-paragraph fallback kept in the toolbar adapter for now.
  #getFontFamilyFallbackValue() {
    if (!this.activeEditor?.state) return null;

    const { state } = this.activeEditor;
    const selection = state.selection;
    if (!selection?.empty) return null;

    const paragraphParent = findParentNode((n) => n.type.name === 'paragraph')(selection);
    if (!paragraphParent || paragraphParent.node?.content?.size !== 0) return null;

    const paragraphProps = calculateResolvedParagraphProperties(
      this.activeEditor,
      paragraphParent.node,
      state.doc.resolve(paragraphParent.pos),
    );
    const convertedXml = this.activeEditor?.converter?.convertedXml ?? {};
    const fontFamily = getParagraphFontFamilyFromProperties(paragraphProps, convertedXml);
    return fontFamily || null;
  }

  // Headless currently represents mixed font-size selections as active + null value.
  // The built-in toolbar still needs to translate that shape into the legacy isMultiple UI state.
  #isFontSizeMixedState(commandState) {
    return Boolean(commandState?.active) && commandState?.value == null;
  }

  #applyHeadlessState(item) {
    if (item.name.value === 'tableActions') {
      const tableActionStates = TABLE_ACTION_COMMAND_IDS.map((commandId) => this.snapshot?.commands?.[commandId]);
      const hasAnyEnabled = tableActionStates.some((state) => state && !state.disabled);
      item.setDisabled(!hasAnyEnabled);
      return true;
    }

    const commandId = HEADLESS_ITEM_MAP[item.name.value];
    if (!commandId) return false;

    const commandState = this.snapshot?.commands?.[commandId];

    const setDisabled = () => {
      item.setDisabled(Boolean(commandState?.disabled));
    };

    const handlers = {
      textAlign: () => {
        if (commandState?.value) item.activate({ textAlign: commandState.value });
        else item.deactivate();
      },
      lineHeight: () => {
        item.selectedValue.value = commandState?.value != null ? commandState.value : '';
      },
      zoom: () => {
        if (commandState?.value != null) {
          const value = typeof commandState.value === 'number' ? `${commandState.value}%` : String(commandState.value);
          item.onActivate({ zoom: value });
        }
      },
      documentMode: () => {
        this.#syncDocumentModeUi();
      },
      link: () => {
        item.active.value = Boolean(commandState?.active);
        item.attributes.value = commandState?.value ? { href: commandState.value } : {};
      },
      fontFamily: () => {
        if (commandState?.value != null) {
          item.activate({ fontFamily: commandState.value });
          return;
        }

        const fallbackFontFamily = this.#getFontFamilyFallbackValue();
        if (fallbackFontFamily) {
          item.activate({ fontFamily: fallbackFontFamily });
          return;
        }

        item.deactivate();
      },
      fontSize: () => {
        if (commandState?.value != null) {
          item.activate({ fontSize: commandState.value });
          return;
        }
        if (this.#isFontSizeMixedState(commandState)) {
          item.activate({}, true);
          return;
        }
        item.deactivate();
      },
      color: () => {
        if (commandState?.value != null) item.activate({ color: commandState.value });
        else item.deactivate();
      },
      highlight: () => {
        if (commandState?.value != null) item.activate({ color: commandState.value });
        else item.deactivate();
      },
      linkedStyles: () => {
        if (commandState?.value != null) item.activate({ styleId: commandState.value });
        else item.label.value = this.config.texts?.formatText || 'Format text';
      },
      list: () => {
        if (commandState?.active) {
          item.activate();
          item.selectedValue.value = markerTextToBulletStyle(commandState.value);
        } else {
          item.deactivate();
          item.selectedValue.value = null;
        }
      },
      default: () => {
        if (commandState?.active) item.activate();
        else item.deactivate();
      },
    };

    const handler = handlers[item.name.value] ?? handlers.default;

    setDisabled();
    handler();

    return true;
  }

  #executeHeadlessCommand(item, argument) {
    // Note: 'link' is intentionally excluded from this router for now.
    // Its submit/remove execute flow lives in LinkInput.vue as a special-case UI component flow.
    const isTableActions = item?.name?.value === 'tableActions';
    const commandId = isTableActions
      ? TABLE_ACTION_COMMAND_MAP[argument?.command]
      : HEADLESS_ITEM_MAP[item?.name?.value];

    if (!commandId || !this.controller?.execute) return false;

    if (isTableActions) {
      this.controller.execute(commandId);
    } else {
      this.controller.execute(commandId, argument);
    }

    return true;
  }

  /**
   * Update the toolbar state based on the current editor state
   * Updates active/inactive state of all toolbar items
   * @returns {void}
   */
  updateToolbarState() {
    this.#syncDocumentModeUi();
    this.#initDefaultFonts();
    this.#updateHighlightColors();

    // Deactivate toolbar items if no active editor
    // This will skip buttons that are marked as allowWithoutEditor
    const snapshotMode = this.snapshot?.commands?.['document-mode']?.value;
    const currentMode = snapshotMode || 'editing';

    if (!this.activeEditor || currentMode === 'viewing') {
      this.#deactivateAll();
      return;
    }

    const { state } = this.activeEditor;
    if (!state) {
      this.#deactivateAll();
      return;
    }

    this.toolbarItems.forEach((item) => {
      item.resetDisabled();
      this.#applyHeadlessState(item);
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
   * React to editor transactions. Might want to debounce this.
   * @param {Object} params - Transaction parameters
   * @param {Object} params.transaction - The transaction object
   * @returns {void}
   */
  onEditorTransaction({ transaction }) {
    if (!transaction.docChanged && !transaction.selectionSet) return;
    this.updateToolbarState();
  }

  #scheduleRestoreEditorFocus() {
    if (!this.activeEditor || this.activeEditor.options.isHeaderOrFooter) return;

    clearTimeout(this._restoreFocusTimeoutId);
    this._restoreFocusTimeoutId = setTimeout(() => {
      this._restoreFocusTimeoutId = null;
      if (!this.activeEditor || this.activeEditor.options.isHeaderOrFooter) return;
      this.activeEditor.focus();
    }, 0);
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

    // Queue unfocused mark toggles only for body editors.
    // Header/footer mark toggles execute immediately to avoid waiting for
    // selectionUpdate and requiring an extra selection change.
    if (!wasFocused && isMarkToggle && !this.activeEditor?.options?.isHeaderOrFooter) {
      this.pendingMarkCommands.push({ command, argument, item });
      const labelAttr = item?.labelAttr?.value;
      if (labelAttr && argument) {
        item?.activate?.({ [labelAttr]: argument });
      } else {
        item?.activate?.();
      }

      if (this.activeEditor && !this.activeEditor.options.isHeaderOrFooter) {
        this.activeEditor.focus();
      }
      return;
    }

    if (this.activeEditor && !this.activeEditor.options.isHeaderOrFooter) {
      this.activeEditor.focus();
    }

    if (!command) return;

    if (item?.name?.value === 'tableActions') {
      const handledByHeadless = this.#executeHeadlessCommand(item, argument);
      if (handledByHeadless) {
        this.updateToolbarState();
        return;
      }
    }

    if (HEADLESS_EXECUTE_ITEMS.has(item?.name?.value)) {
      const handledByHeadless = this.#executeHeadlessCommand(item, argument);
      if (handledByHeadless) {
        if (isMarkToggle) this.#syncStickyMarksFromState();
        this.updateToolbarState();
        if (shouldRestoreFocus) this.#scheduleRestoreEditorFocus();
        return;
      }
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
    if (shouldRestoreFocus) this.#scheduleRestoreEditorFocus();
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
          if (HEADLESS_EXECUTE_ITEMS.has(item?.name?.value)) {
            const handledByHeadless = this.#executeHeadlessCommand(item, argument);
            if (handledByHeadless) {
              this.#ensureStoredMarksForMarkToggle({ command, argument });
              return;
            }
          }

          if (this.activeEditor.commands && command in this.activeEditor.commands) {
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

  /**
   * Cleans up resources when the toolbar is destroyed.
   * Clears any pending timeouts and unmounts the Vue app so the Toolbar
   * component's onBeforeUnmount hook runs and removes its window listeners.
   * @returns {void}
   */
  destroy() {
    if (this._restoreFocusTimeoutId !== null) {
      clearTimeout(this._restoreFocusTimeoutId);
      this._restoreFocusTimeoutId = null;
    }

    this.destroyHeadlessToolbar();
    this.app?.unmount();
  }
}
