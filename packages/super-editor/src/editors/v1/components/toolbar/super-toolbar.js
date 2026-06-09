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
  composeToolbarFontOptions,
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
import { insertTableOfContentsAtSelection } from '@extensions/table-of-contents/table-of-contents-insertion.js';

/**
 * @typedef {function(CommandItem): void} CommandCallback
 * A callback function that's executed when a toolbar button is clicked
 * @param {CommandItem} params - Command parameters
 * @param {ToolbarItem} params.item - An instance of the useToolbarItem composable
 * @param {unknown} [params.argument] - The argument passed to the command
 */

/**
 * @typedef {Object} ToolbarConfig
 * @property {string | null} [selector] - CSS selector for the toolbar container, or `null` to skip mounting
 * @property {string[]} [toolbarGroups=['left', 'center', 'right']] - Groups to organize toolbar items
 * @property {string} [role='editor'] - Role of the toolbar ('editor' or 'viewer')
 * @property {object} [icons] - Custom icons for toolbar items
 * @property {object} [texts] - Custom texts for toolbar items
 * @property {import('../../core/types/EditorConfig.js').FontConfig[] | null} [fonts] - Font options for the font picker dropdown
 * @property {boolean} [hideButtons=true] - Whether to hide buttons when the editor is not focused
 * @property {boolean} [pagination=false] - Whether to show pagination controls
 * @property {string} [mode='docx'] - Editor mode
 * @property {string[]} [excludeItems=[]] - Items to exclude from the toolbar
 * @property {Record<string, string[]>} [groups] - Custom groups configuration
 * @property {object} [editor=null] - The editor instance
 * @property {string} [aiApiKey] - API key for AI integration
 * @property {string} [aiEndpoint] - Endpoint for AI integration
 * @property {Array<Record<string, unknown>> | ToolbarItem[]} [customButtons=[]] - Custom buttons to add to the toolbar. SuperDoc forwards the structural `Array<Record<string, unknown>>` shape from `Modules.toolbar.customButtons`; the runtime wraps each entry into a full `ToolbarItem` via `useToolbarItem`.
 * @property {boolean} [showFormattingMarksButton=false] - Show the formatting marks (pilcrow) button in the toolbar. Distinct from `layoutEngineOptions.showFormattingMarks`, which controls whether the marks render in the document.
 * @property {boolean} [showTableOfContentsButton=false] - Show the table of contents insert button in the toolbar. Off by default until the feature is generally available.
 * @property {boolean} [isDev] - Dev-mode flag forwarded from `SuperDoc.isDev`; gates debug tooltips and overlays.
 * @property {object} [superdoc] - The owning SuperDoc instance. Set by SuperDoc when constructing the toolbar; the toolbar uses it to dispatch commands back through the parent.
 * @property {boolean} [responsiveToContainer=false] - When `true`, the toolbar measures the container width instead of the document width when deciding which items to collapse.
 * @property {string} [uiDisplayFallbackFont] - Forwarded from `Config.uiDisplayFallbackFont`; used as the default font for the toolbar's font picker when no explicit font is selected.
 * @property {string} [documentMode] - Forwarded from `Config.documentMode`. Currently unused inside SuperToolbar (the toolbar reads the live mode via the `documentMode` toolbar item); kept on the type so SuperDoc's pass-through compiles cleanly.
 */

/**
 * @typedef {Object} ToolbarItem
 *
 * Reactive toolbar item wrapper produced by `useToolbarItem`. Each
 * field is a Vue `Ref`-shaped container with a `.value`. The `.value`
 * types are tightened here (was `*` / `any`) so consumers configuring
 * custom toolbar buttons get real IntelliSense on the values they
 * pass through.
 *
 * @property {{ value: string }} id - The unique ID of the toolbar item
 * @property {{ value: string }} name - The name of the toolbar item
 * @property {string} type - The type of toolbar item (button, options, separator, dropdown, overflow)
 * @property {{ value: string }} group - The group the item belongs to
 * @property {string|CommandCallback} command - The command to execute
 * @property {string} [noArgumentCommand] - The command to execute when no argument is provided
 * @property {{ value: string | undefined }} icon - The icon for the item (icon-name string)
 * @property {{ value: string | undefined }} tooltip - The tooltip text
 * @property {boolean} [restoreEditorFocus] - Whether to restore editor focus after command execution
 * @property {{ value: Record<string, unknown> }} attributes - Additional attributes for the item
 * @property {{ value: boolean }} disabled - Whether the item is disabled
 * @property {{ value: boolean }} active - Whether the item is active
 * @property {{ value: boolean }} expand - Whether the item is expanded
 * @property {{ value: ToolbarItem[] }} nestedOptions - Nested options for the item
 * @property {{ value: Record<string, string | number> | undefined }} style - Custom style for the item
 * @property {{ value: boolean }} isNarrow - Whether the item has narrow styling
 * @property {{ value: boolean }} isWide - Whether the item has wide styling
 * @property {{ value: number | string | undefined }} minWidth - Minimum width of the item
 *
 * `argument.value` and `selectedValue.value` are intentionally
 * `unknown` (not `any`): consumers pass arbitrary data through these
 * to their custom command callbacks, so the toolbar cannot promise a
 * narrower shape without becoming wrong. `unknown` forces the
 * consumer to narrow at the call site they own.
 *
 * @property {{ value: unknown }} argument - The argument to pass to the command (consumer-typed)
 * @property {{ value: ToolbarItem | undefined }} parentItem - The parent of this item if nested
 * @property {{ value: ToolbarItem | undefined }} childItem - The child of this item if it has one
 * @property {{ value: string | undefined }} iconColor - The color of the icon (CSS color)
 * @property {{ value: boolean }} hasCaret - Whether the item has a dropdown caret
 * @property {{ value: Record<string, string | number> | undefined }} dropdownStyles - Custom styles for the dropdown
 * @property {{ value: boolean }} tooltipVisible - Whether the tooltip is visible
 * @property {{ value: number | undefined }} tooltipTimeout - Timeout for the tooltip (ms)
 * @property {{ value: string | undefined }} defaultLabel - The default label for the item
 * @property {{ value: string | undefined }} label - The label for the item
 * @property {{ value: boolean }} hideLabel - Whether to hide the label
 * @property {{ value: boolean }} inlineTextInputVisible - Whether inline text input is visible
 * @property {{ value: boolean }} hasInlineTextInput - Whether the item has inline text input
 * @property {{ value: string | undefined }} markName - The name of the mark (e.g. 'bold')
 * @property {{ value: string | undefined }} labelAttr - The attribute for the label
 * @property {{ value: boolean }} allowWithoutEditor - Whether the item can be used without an editor
 * @property {{ value: string | undefined }} dropdownValueKey - The key for dropdown value
 * @property {{ value: unknown }} selectedValue - The selected value (consumer-typed)
 * @property {{ value: HTMLInputElement | null }} inputRef - Reference to an input element
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
 * @property {unknown} [argument] - The argument to pass to the command (consumer-typed)
 * @property {unknown} [option] - The selected nested option for option-style commands (consumer-typed)
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
    showFormattingMarksButton: false,
    showTableOfContentsButton: false,
  };

  /**
   * Visible toolbar items in their resolved order. Populated by
   * `#initToolbarItems` after `useToolbarItem` builds the reactive
   * wrappers; mutated when items move to overflow on resize.
   * @type {ToolbarItem[]}
   */
  toolbarItems = [];

  /**
   * Items moved into the overflow menu when the container is narrower
   * than the toolbar's natural width.
   * @type {ToolbarItem[]}
   */
  overflowItems = [];

  /**
   * Dev mode flag forwarded from `SuperDoc`'s config. Enables extra
   * dropdowns (e.g. extension picker) used only by internal tooling.
   * @type {boolean}
   */
  isDev = false;

  /**
   * Role propagated from the parent `SuperDoc` (typically `'editor'`
   * or `'viewer'`); drives feature gating in the toolbar items.
   * @type {string}
   */
  role = 'editor';

  /**
   * Back-reference to the owning `SuperDoc` instance. Marked private
   * because it exposes the full SuperDoc internal graph and should
   * not be part of the toolbar's public TypeScript surface. Internal
   * paths that need a method on the parent SuperDoc reach for it
   * through this field.
   * @type {unknown}
   * @private
   */
  superdoc;

  /**
   * Mounted toolbar container element, set after `render()`. Null
   * before the first render or after `destroy()`.
   * @type {HTMLElement | null}
   */
  toolbarContainer = null;

  /**
   * Mounted Vue component instance from `this.app.mount(...)`. Not
   * consumer API: zero docs/examples reference `superdoc.toolbar.toolbar`,
   * and no .ts or .js cross-file reader exists. The wrapper
   * `SuperDoc.toolbar` (this class) is the documented public surface;
   * this nested `.toolbar` field is the internal Vue mount handle.
   *
   * Same SD-3213f-style TS surface hide as `commentsList` and
   * `SuperDoc.app`; not runtime privacy.
   *
   * @type {import('vue').ComponentPublicInstance | null}
   * @private
   */
  toolbar = null;

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
     * @type {{transaction: Function|null, selectionUpdate: Function|null, focus: Function|null, fontsChanged: Function|null}}
     * @private
     */
    this._boundEditorHandlers = {
      transaction: null,
      selectionUpdate: null,
      focus: null,
      fontsChanged: null,
    };

    /**
     * Signature of the last-built document font options. Fonts resolve in several steps after a document
     * opens, so `fonts-changed` fires repeatedly; this skips rebuilding the dropdown when the options did
     * not actually change.
     * @private
     */
    this._lastFontOptionsSignature = '';

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
   * Detach listeners from the current active editor.
   * @private
   * @returns {void}
   */
  #detachActiveEditorListeners() {
    if (!this.activeEditor || !this._boundEditorHandlers.transaction) return;

    this.activeEditor.off('transaction', this._boundEditorHandlers.transaction);
    this.activeEditor.off('selectionUpdate', this._boundEditorHandlers.selectionUpdate);
    this.activeEditor.off('focus', this._boundEditorHandlers.focus);
    this.activeEditor.off('fonts-changed', this._boundEditorHandlers.fontsChanged);
    this._boundEditorHandlers.transaction = null;
    this._boundEditorHandlers.selectionUpdate = null;
    this._boundEditorHandlers.focus = null;
    this._boundEditorHandlers.fontsChanged = null;
  }

  /**
   * The toolbar expects an active Super Editor instance.
   * Removes listeners from the previous editor (if any) before attaching to the new one.
   * @param {Object|null} editor - The editor instance to attach to the toolbar, or null to detach
   * @returns {void}
   */
  setActiveEditor(editor) {
    const sameEditor = editor === this.activeEditor;
    const alreadyListening = Boolean(this._boundEditorHandlers.transaction);
    if (sameEditor && (!editor || alreadyListening)) {
      this.updateToolbarState();
      return;
    }

    this.#detachActiveEditorListeners();
    this.activeEditor = editor;

    if (editor) {
      this._boundEditorHandlers.transaction = this.onEditorTransaction.bind(this);
      this._boundEditorHandlers.selectionUpdate = this.onEditorSelectionUpdate.bind(this);
      this._boundEditorHandlers.focus = this.onEditorFocus.bind(this);
      // Document fonts resolve asynchronously after load (the report can settle with no transaction), so
      // the font list must rebuild on `fonts-changed`, not only on edits.
      this._boundEditorHandlers.fontsChanged = this.onEditorFontsChanged.bind(this);

      this.activeEditor.on('transaction', this._boundEditorHandlers.transaction);
      this.activeEditor.on('selectionUpdate', this._boundEditorHandlers.selectionUpdate);
      this.activeEditor.on('focus', this._boundEditorHandlers.focus);
      this.activeEditor.on('fonts-changed', this._boundEditorHandlers.fontsChanged);
    }

    // Recompute on active-editor change: the new document has its own fonts, so rebuild the dropdown
    // OPTIONS (updateToolbarState alone only refreshes item state), then refresh state.
    this.#rebuildToolbarItems();
    this._lastFontOptionsSignature = this.#fontOptionsSignature();
    this.updateToolbarState();
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
    return this.#getAllToolbarItems().find((item) => item.name.value === name);
  }

  /**
   * Visible bar + overflow menu items (same object refs; responsive layout moves
   * controls like tableOfContents between the two arrays).
   * @private
   * @returns {ToolbarItem[]}
   */
  #getAllToolbarItems() {
    return [...this.toolbarItems, ...this.overflowItems];
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
      toolbarFonts: this.#resolveToolbarFonts(fonts),
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
   * The font dropdown options. Lifecycle only: get the active document's font options from the read API
   * and hand the composition (dedupe, ordering, preview styling) to the pure
   * {@link composeToolbarFontOptions} seam. A consumer-provided `configFonts` list is returned untouched.
   * @private
   * @param {Array|undefined} configFonts - the consumer's `fonts` config, if any
   * @returns {Array|undefined} the toolbar font options, or undefined to fall back to the bundled defaults
   */
  #resolveToolbarFonts(configFonts) {
    return composeToolbarFontOptions(this.superdoc?.fonts?.getDocumentFontOptions?.() ?? [], configFonts);
  }

  /**
   * Rebuild the toolbar items (and so the font dropdown OPTIONS) from current config + document fonts.
   * `updateToolbarState()` only refreshes existing item state; this re-creates the items, which is what
   * surfaces a newly-resolved document font in the dropdown.
   *
   * `toolbarItems` / `overflowItems` are plain instance fields, not a Vue reactive source, so swapping them
   * is invisible to the mounted `Toolbar.vue` until it re-renders. Emit `toolbar-items-changed` so the view
   * forces that re-render (it bumps its render key). Without it the rebuilt items never reach the DOM and the
   * toolbar keeps showing the previously-built set - e.g. the initial disabled items before an editor attaches.
   * The resize path rebuilds and bumps the key from the view itself, so it does not go through this method.
   * @private
   * @returns {void}
   */
  #rebuildToolbarItems() {
    this.#makeToolbarItems({
      superToolbar: this,
      icons: this.config.icons,
      texts: this.config.texts,
      fonts: this.config.fonts,
      hideButtons: this.config.hideButtons,
      isDev: this.isDev,
    });
    this.emit('toolbar-items-changed');
  }

  /**
   * A stable signature of the active document's font options, to detect when a `fonts-changed` event
   * actually changed the dropdown (vs the same options resolving again).
   * @private
   * @returns {string}
   */
  #fontOptionsSignature() {
    if (this.config.fonts) return 'custom-fonts';
    const options = this.superdoc?.fonts?.getDocumentFontOptions?.() ?? [];
    return JSON.stringify(options.map((option) => [option.logicalFamily, option.previewFamily]));
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
      numberedlist: () => {
        if (commandState?.active) {
          item.activate();
          item.selectedValue.value = commandState.value;
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
      this.#getAllToolbarItems().forEach((item) => {
        if (item.allowWithoutEditor?.value) this.#applyHeadlessState(item);
      });
      return;
    }

    const { state } = this.activeEditor;
    if (!state) {
      this.#deactivateAll();
      return;
    }

    // Overflow items still appear in the overflow popup and need their
    // active-state highlight (e.g., bold pressed, direction matched) to
    // reflect the current selection. Iterating only `toolbarItems` left
    // them frozen in their last-rendered state.
    this.#getAllToolbarItems().forEach((item) => {
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
    this.#getAllToolbarItems().forEach((item) => {
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
   * @param {unknown} [params.argument] - The argument passed to the command
   * @returns {void} All control-flow branches use a bare `return;`; this method
   *   side-effects (emits events, mutates state) and produces no value.
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

    if (command === 'insertTableOfContents' && this.activeEditor) {
      insertTableOfContentsAtSelection(this.activeEditor);
    } else if (this.activeEditor && this.activeEditor.commands && command in this.activeEditor.commands) {
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
   * Rebuild the toolbar (and so the font dropdown) when the active document's font picture resolves.
   * Fonts load asynchronously after a document opens, so document font options can change with no edit.
   * @returns {void}
   */
  onEditorFontsChanged() {
    const signature = this.#fontOptionsSignature();
    if (signature !== this._lastFontOptionsSignature) {
      this._lastFontOptionsSignature = signature;
      this.#rebuildToolbarItems();
    }
    this.updateToolbarState();
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
   * @param {unknown} params.argument
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

    this.#detachActiveEditorListeners();
    this.destroyHeadlessToolbar();
    this.app?.unmount();
  }
}
