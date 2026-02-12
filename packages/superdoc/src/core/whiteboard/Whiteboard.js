import { EventEmitter } from '../EventEmitter';
import { WhiteboardPage } from './WhiteboardPage';

/**
 * @typedef {{ width: number, height: number, originalWidth?: number, originalHeight?: number }} WhiteboardPageSize
 * @typedef {{ strokes?: any[], text?: any[], images?: any[] }} WhiteboardPageData
 * @typedef {{ pages?: Record<string, WhiteboardPageData> }} WhiteboardData
 * @typedef {{
 *  Renderer?: any,
 *  superdoc?: any,
 *  enabled?: boolean,
 *  onChange?: (data: WhiteboardData) => void,
 *  onSetData?: (pages: WhiteboardPage[]) => void,
 *  onEnabledChange?: (enabled: boolean) => void,
 * }} WhiteboardInit
 */

/**
 * Whiteboard manager for multi-page annotations.
 */
export class Whiteboard extends EventEmitter {
  #Renderer = null;

  #superdoc = null;

  #pages = new Map();

  #registry = new Map();

  #currentTool = 'select';

  #enabled = false;

  #opacity = 1;

  #onChange = null;

  #onSetData = null;

  #onEnabledChange = null;

  /**
   * Initialize the whiteboard instance.
   * @param {WhiteboardInit} [props]
   */
  constructor(props = {}) {
    super();
    this.#init(props);
  }

  /**
   * @private
   * @param {WhiteboardInit} props
   */
  #init(props) {
    this.#Renderer = props.Renderer;
    this.#superdoc = props.superdoc;
    this.#enabled = props.enabled;

    this.#onChange = props.onChange;
    this.#onSetData = props.onSetData;
    this.#onEnabledChange = props.onEnabledChange;
  }

  /**
   * Register items for a UI palette type (e.g. stickers, comments).
   * @param {string} type
   * @param {any[]} items
   */
  register(type, items) {
    this.#registry.set(type, items);
  }

  /**
   * Get registered items by type.
   * @param {string} type
   * @returns {any[] | undefined}
   */
  getType(type) {
    return this.#registry.get(type);
  }

  /**
   * Set current tool for all pages.
   * @param {string} tool
   */
  setTool(tool) {
    this.#currentTool = tool;
    this.#pages.forEach((page) => page.setTool(tool));
    this.emit('tool', tool);
  }

  /**
   * Get current tool.
   * @returns {string}
   */
  getTool() {
    return this.#currentTool;
  }

  /**
   * Enable/disable interactivity for all pages.
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.#enabled = enabled;
    this.#pages.forEach((page) => page.setEnabled(this.#enabled));
    this.emit('enabled', this.#enabled);
    if (this.#onEnabledChange) {
      this.#onEnabledChange(this.#enabled);
    }
  }

  /**
   * @returns {boolean}
   */
  isEnabled() {
    return this.#enabled;
  }

  /**
   * Set overlay opacity.
   * @param {number} opacity
   */
  setOpacity(opacity) {
    const value = opacity;
    this.#opacity = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
    this.emit('opacity', this.#opacity);
  }

  /**
   * @returns {number}
   */
  getOpacity() {
    return this.#opacity;
  }

  /**
   * Return all page instances.
   * @returns {WhiteboardPage[]}
   */
  getPages() {
    return Array.from(this.#pages.values());
  }

  /**
   * Set size for a page (creates page if missing).
   * @param {number} pageIndex
   * @param {WhiteboardPageSize} size
   */
  setPageSize(pageIndex, size) {
    const page = this.#createPage(pageIndex);
    page.setSize(size);
  }

  /**
   * @private
   * Create a page if it doesn't exist.
   * @param {number} pageIndex
   * @returns {WhiteboardPage}
   */
  #createPage(pageIndex) {
    const existing = this.#pages.get(pageIndex);
    if (existing) return existing;
    const page = new WhiteboardPage({
      Renderer: this.#Renderer,
      enabled: this.#enabled,
      pageIndex,
      onChange: () => {
        this.#emitChange();
      },
      onToolChange: (tool) => {
        this.setTool(tool);
      },
    });
    page.setTool(this.#currentTool);
    page.setEnabled(this.#enabled);
    this.#pages.set(pageIndex, page);
    return page;
  }

  /**
   * Get a page by index.
   * @param {number} pageIndex
   * @returns {WhiteboardPage}
   */
  getPage(pageIndex) {
    return this.#pages.get(pageIndex);
  }

  /**
   * Serialize whiteboard data.
   * @returns {WhiteboardData}
   */
  getWhiteboardData() {
    const pages = {};
    const pageSizes = {};

    for (const page of this.#pages.values()) {
      pages[page.pageIndex] = page.toJSON();
      if (page.size) {
        pageSizes[page.pageIndex] = {
          width: page.size.width,
          height: page.size.height,
          originalWidth: page.originalSize?.width ?? null,
          originalHeight: page.originalSize?.height ?? null,
        };
      }
    }

    const data = {
      pages,
      meta: { pageSizes },
      version: 1,
    };

    return data;
  }

  /**
   * Load whiteboard data from JSON.
   * @param {WhiteboardData} json
   */
  setWhiteboardData(json) {
    this.#pages.clear();

    const pages = json?.pages || {};
    Object.keys(pages).forEach((key) => {
      const parsedIndex = Number(key);
      const pageIndex = Number.isNaN(parsedIndex) ? key : parsedIndex;
      const page = this.#createPage(pageIndex);
      page.applyData(pages[key]);
    });

    this.emit('setData', this.getPages());
    if (this.#onSetData) {
      this.#onSetData(this.getPages());
    }

    this.#emitChange();
  }

  /**
   * @private
   * Emit change events.
   */
  #emitChange() {
    const data = this.getWhiteboardData();
    this.emit('change', data);
    if (this.#onChange) this.#onChange(data);
  }
}
