import { flattenPoints } from './helpers/flattenPoints';
import { getRandomId } from './helpers/getRandomId';
import { createTextarea } from './helpers/createTextarea';

/**
 * @typedef {{ width: number, height: number, originalWidth?: number, originalHeight?: number }} WhiteboardPageSize
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{ points: number[][], color?: string, width?: number, type?: 'draw'|'erase' }} WhiteboardStroke
 * @typedef {{ id?: string|number, x: number, y: number, content: string, fontSize?: number, width?: number }} WhiteboardTextItem
 * @typedef {{ id?: string|number, stickerId?: string, x: number, y: number, src: string, width?: number, height?: number, type?: string }} WhiteboardImageItem
 * @typedef {{
 *  pageIndex: number,
 *  enabled: boolean,
 *  Renderer: any,
 *  onChange?: () => void,
 *  onToolChange?: (tool: string) => void,
 * }} WhiteboardPageInit
 */

/**
 * Per-page whiteboard renderer/controller.
 */
export class WhiteboardPage {
  /** @type {number|null} */
  pageIndex = null;

  /** @type {WhiteboardStroke[]} */
  strokes = [];

  /** @type {WhiteboardTextItem[]} */
  text = [];

  /** @type {WhiteboardImageItem[]} */
  images = [];

  /** @type {WhiteboardPageSize|null} */
  size = null;

  /** @type {{ width: number|null, height: number|null }|null} */
  originalSize = null;

  #Renderer = null;

  #stage = null;

  #layer = null;

  #strokesLayer = null;

  #transformer = null;

  #containerEl = null;

  #isDrawing = false;

  #currentLine = null;

  #currentPoints = [];

  #currentTool = 'select';

  #enabled = false;

  #selectedNode = null;

  #strokeColor = '#2293fb';

  #strokeWidth = 5;

  #onChange = null;

  #onToolChange = null;

  /**
   * Create a page controller.
   * @param {WhiteboardPageInit} props
   */
  constructor(props) {
    this.#init(props);
  }

  /**
   * @private
   * Initialize internal state.
   * @param {WhiteboardPageInit} props
   */
  #init(props) {
    this.#Renderer = props.Renderer;
    this.#enabled = props.enabled;
    this.pageIndex = props.pageIndex;

    this.#onChange = props.onChange;
    this.#onToolChange = props.onToolChange;
  }

  /**
   * @private
   * Attach Konva stage listeners.
   */
  #attachEventListeners() {
    if (!this.#stage || !this.#layer) {
      return;
    }

    this.#stage.on('mousedown touchstart', (event) => {
      this.#handleDrawStart(event);
    });

    this.#stage.on('mousemove touchmove', (event) => {
      this.#handleDrawMove(event);
    });

    this.#stage.on('mouseup touchend', (event) => {
      this.#handleDrawEnd(event);
    });

    this.#stage.on('click tap', (event) => {
      this.#handleStageClick(event);
    });

    window.addEventListener('keydown', this.#handleKeydown);
  }

  /**
   * Set tool for this page.
   * @param {string} tool
   */
  setTool(tool) {
    this.#currentTool = tool;
    this.#updateStrokesLayerListening();
    this.#clearSelection();
    this.render();
  }

  /**
   * Get current tool for this page.
   * @returns {string}
   */
  getTool() {
    return this.#currentTool;
  }

  /**
   * Enable/disable interactivity for this page.
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.#enabled = Boolean(enabled);
    this.#updateStrokesLayerListening();
    this.#clearSelection();
    this.render();
  }

  /**
   * @returns {boolean}
   */
  isEnabled() {
    return this.#enabled;
  }

  /**
   * Store page size (does not resize canvas).
   * @param {WhiteboardPageSize} size
   */
  setSize(size) {
    if (!size) return;
    const { width, height, originalWidth, originalHeight } = size;
    this.size = { width, height };
    this.originalSize = { width: originalWidth ?? null, height: originalHeight ?? null };
  }

  /**
   * Resize the Konva stage.
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {
    if (!this.#stage) return;
    this.#stage.size({ width, height });
    this.#applyPixelRatio();
  }

  /**
   * Mount Konva stage into a container.
   * @param {HTMLElement} container
   */
  mount(container) {
    if (!container) {
      return;
    }
    if (this.#stage && this.#containerEl === container) {
      return;
    }

    if (this.#stage) {
      this.destroy();
    }

    const width = this.size?.width || container.clientWidth || 1;
    const height = this.size?.height || container.clientHeight || 1;

    this.#containerEl = container;
    this.#stage = new this.#Renderer.Stage({ container, width, height });
    this.#layer = new this.#Renderer.Layer();
    this.#strokesLayer = new this.#Renderer.Layer();
    this.#stage.add(this.#layer);
    this.#stage.add(this.#strokesLayer);
    this.#applyPixelRatio();

    this.#updateStrokesLayerListening();
    this.#attachEventListeners();

    this.render();
  }

  /**
   * Re-render all content for this page.
   */
  render() {
    if (!this.#layer) {
      return;
    }

    if (this.#transformer) {
      this.#transformer.destroy();
      this.#transformer = null;
    }

    const texts = this.#layer.find('.wb-text');
    texts.forEach((node) => node.destroy());
    this.#strokesLayer.destroyChildren();

    this.renderStrokes();
    this.renderText();
    this.renderImages();

    this.#layer.batchDraw();
    this.#strokesLayer.batchDraw();
  }

  /**
   * @private
   * Reduce canvas memory by limiting device pixel ratio.
   */
  #applyPixelRatio() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    if (this.#layer?.getCanvas) {
      this.#layer.getCanvas().setPixelRatio(ratio);
    }
    if (this.#strokesLayer?.getCanvas) {
      this.#strokesLayer.getCanvas().setPixelRatio(ratio);
    }
  }

  /**
   * @private
   * Enable stroke layer hit-testing only in draw/erase.
   * NOTE: If listening is enabled outside draw/erase, strokes can block selecting items beneath.
   */
  #updateStrokesLayerListening() {
    if (!this.#strokesLayer) return;
    const isDrawMode = this.#currentTool === 'draw' || this.#currentTool === 'erase';
    const isListening = Boolean(this.#enabled && isDrawMode);
    this.#strokesLayer.listening(isListening);
  }

  /**
   * Render stroke paths.
   */
  renderStrokes() {
    this.strokes.forEach((stroke) => {
      const line = new this.#Renderer.Line({
        points: flattenPoints(stroke.points || []),
        stroke: stroke.color || this.#strokeColor,
        strokeWidth: stroke.width || this.#strokeWidth,
        lineCap: 'round',
        lineJoin: 'round',
        globalCompositeOperation: stroke.type === 'erase' ? 'destination-out' : 'source-over',
      });
      line.name('wb-stroke');
      this.#strokesLayer.add(line);
    });
  }

  /**
   * Render text nodes.
   */
  renderText() {
    this.text.forEach((item) => {
      const textNode = new this.#Renderer.Text({
        x: item.x,
        y: item.y,
        text: item.content,
        fontSize: item.fontSize ?? 18,
        fontFamily: 'Arial, sans-serif',
        fill: '#2293fb',
        draggable: this.#currentTool === 'select',
        width: item.width ?? undefined,
      });

      textNode.name('wb-text');
      textNode._whiteboardId = item.id;
      this.#attachTextNodeEvents(textNode, item);

      this.#layer.add(textNode);
    });
  }

  /**
   * @private
   * Attach text node events.
   * @param {any} textNode
   * @param {WhiteboardTextItem} item
   */
  #attachTextNodeEvents(textNode, item) {
    textNode.on('click tap', (event) => {
      if (this.#currentTool !== 'select' || !this.#enabled) return;
      event.cancelBubble = true;
      this.#selectNode(textNode);
    });

    textNode.on('dragend', () => {
      item.x = textNode.x();
      item.y = textNode.y();
      this.#triggerChanged();
    });

    textNode.on('transform', () => {
      textNode.scaleY(1);
      textNode.setAttrs({
        width: textNode.width() * textNode.scaleX(),
        scaleX: 1,
      });
    });

    textNode.on('transformend', () => {
      textNode.setAttrs({
        width: Math.max(1, textNode.width() * textNode.scaleX()),
        scaleX: 1,
        scaleY: 1,
      });
      const nextWidth = textNode.width();
      item.width = nextWidth;
      item.x = textNode.x();
      item.y = textNode.y();
      this.#triggerChanged();
    });

    textNode.on('dblclick dbltap', (event) => {
      if (this.#currentTool !== 'select' || !this.#enabled) return;
      event.cancelBubble = true;
      this.#editTextNode(textNode, item);
    });
  }

  /**
   * Render image/sticker nodes.
   * NOTE: Images are reconciled by id to avoid re-creating nodes (prevents flicker).
   * If src changes for an existing id, this path does not reload the image.
   */
  renderImages() {
    const existingNodes = this.#layer?.find('.wb-image') ?? [];
    const existingById = new Map();

    existingNodes.forEach((node) => {
      existingById.set(node._whiteboardId, node);
    });

    const imageIds = new Set(this.images.map((item) => item.id));
    existingNodes.forEach((node) => {
      if (!imageIds.has(node._whiteboardId)) {
        node.destroy();
      }
    });

    const renderImageItem = (item, name) => {
      const existing = existingById.get(item.id);

      if (existing) {
        if (Number.isFinite(item.x)) existing.x(item.x);
        if (Number.isFinite(item.y)) existing.y(item.y);
        if (Number.isFinite(item.width)) existing.width(item.width);
        if (Number.isFinite(item.height)) existing.height(item.height);
        existing.draggable(this.#currentTool === 'select');
        return;
      }

      const imageObj = new window.Image();
      imageObj.crossOrigin = 'Anonymous';
      imageObj.onload = () => {
        const imageNode = new this.#Renderer.Image({
          x: item.x,
          y: item.y,
          image: imageObj,
          width: item.width ?? imageObj.width,
          height: item.height ?? imageObj.height,
          draggable: this.#currentTool === 'select',
        });

        imageNode.name(name);
        imageNode._whiteboardId = item.id;
        this.#attachImageNodeEvents(imageNode, item);

        this.#layer.add(imageNode);
        this.#layer.batchDraw();
      };
      imageObj.src = item.src;
    };

    this.images.forEach((item) => renderImageItem(item, 'wb-image'));
  }

  /**
   * @private
   * Attach image node events.
   * @param {any} imageNode
   * @param {WhiteboardImageItem} item
   */
  #attachImageNodeEvents(imageNode, item) {
    imageNode.on('click tap', (event) => {
      if (this.#currentTool !== 'select' || !this.#enabled) return;
      event.cancelBubble = true;
      this.#selectNode(imageNode);
    });

    imageNode.on('dragend', () => {
      item.x = imageNode.x();
      item.y = imageNode.y();
      this.#triggerChanged();
    });

    imageNode.on('transformend', () => {
      const scaleX = imageNode.scaleX();
      const scaleY = imageNode.scaleY();
      const nextWidth = Math.max(1, imageNode.width() * scaleX);
      const nextHeight = Math.max(1, imageNode.height() * scaleY);
      imageNode.scale({ x: 1, y: 1 });
      imageNode.width(nextWidth);
      imageNode.height(nextHeight);
      item.width = nextWidth;
      item.height = nextHeight;
      item.x = imageNode.x();
      item.y = imageNode.y();
      this.#triggerChanged();
    });
  }

  /**
   * Destroy Konva stage and clean up listeners.
   */
  destroy() {
    if (this.#stage) {
      this.#stage.destroy();
    }

    this.#stage = null;
    this.#layer = null;
    this.#strokesLayer = null;
    this.#containerEl = null;
    this.#isDrawing = false;
    this.#currentLine = null;
    this.#currentPoints = [];
    this.#selectedNode = null;
    this.#transformer = null;

    window.removeEventListener('keydown', this.#handleKeydown);
  }

  /**
   * Serialize page data.
   * @returns {{ strokes: any[], text: any[], stickers: any[] }}
   */
  toJSON() {
    return {
      strokes: this.strokes,
      text: this.text,
      images: this.images,
    };
  }

  /**
   * Apply data to this page and re-render.
   * @param {{ strokes?: any[], text?: any[], images?: any[] }} data
   */
  applyData(data = {}) {
    const strokes = Array.isArray(data.strokes) ? data.strokes : [];
    const text = Array.isArray(data.text) ? data.text : [];
    const images = Array.isArray(data.images) ? data.images : [];

    this.strokes = strokes;
    this.text = text;
    this.images = images;

    this.render();
  }

  /**
   * @private
   * Notify change listeners.
   */
  #triggerChanged() {
    if (this.#onChange) {
      this.#onChange();
    }
  }

  /**
   * Add a stroke to the model.
   * @param {WhiteboardStroke} stroke
   */
  addStroke(stroke) {
    if (!stroke || !Array.isArray(stroke.points)) {
      return;
    }
    this.strokes.push(stroke);
  }

  /**
   * Add a text item to the model.
   * @param {WhiteboardTextItem} item
   */
  addText(item) {
    if (!item || typeof item.content !== 'string') {
      return;
    }

    this.text.push({
      id: item.id ?? getRandomId('text'),
      x: item.x,
      y: item.y,
      content: item.content,
      fontSize: item.fontSize ?? 18,
      width: item.width ?? null,
    });

    this.render();
    this.#triggerChanged();
  }

  /**
   * Add an image/sticker to the model.
   * @param {WhiteboardImageItem} item
   */
  addImage(item) {
    if (!item || !item.src) {
      return;
    }

    const imageItem = {
      id: item.id ?? getRandomId('image'),
      stickerId: item.stickerId ?? (item.type === 'sticker' ? (item.id ?? null) : null),
      x: item.x,
      y: item.y,
      src: item.src,
      width: item.width ?? null,
      height: item.height ?? null,
      type: item.type ?? 'image',
    };
    this.images.push(imageItem);

    this.render();
    this.#triggerChanged();
  }

  /**
   * @private
   * Clear current selection/transformer.
   */
  #clearSelection() {
    if (!this.#transformer) return;
    this.#transformer.destroy();
    this.#transformer = null;
    this.#selectedNode = null;
    this.#layer?.batchDraw();
  }

  /**
   * @private
   * Select a node and attach transformer.
   * @param {any} node
   */
  #selectNode(node) {
    if (!this.#layer) {
      return;
    }

    this.#selectedNode = node;

    const isText = node.name && node.name() === 'wb-text';
    const textAnchors = ['middle-left', 'middle-right'];
    const imageAnchors = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    const anchors = isText ? textAnchors : imageAnchors;

    const boundBoxFunc = (oldBox, newBox) => {
      const min = 20;
      if (newBox.width < min) return oldBox;
      if (isText) {
        return {
          ...newBox,
          height: oldBox.height,
          y: oldBox.y,
        };
      }
      if (newBox.height < min) return oldBox;
      return newBox;
    };

    if (!this.#transformer) {
      this.#transformer = new this.#Renderer.Transformer({
        nodes: [node],
        enabledAnchors: anchors,
        rotateEnabled: false,
        keepRatio: false,
        boundBoxFunc,
      });
      this.#layer.add(this.#transformer);
    } else {
      this.#transformer.nodes([node]);
      this.#transformer.enabledAnchors(anchors);
      this.#transformer.boundBoxFunc(boundBoxFunc);
    }

    this.#layer.batchDraw();
  }

  /**
   * @private
   * Delete currently selected node.
   */
  #deleteSelectedNode() {
    if (!this.#selectedNode) {
      return;
    }

    const node = this.#selectedNode;
    const name = node.name && node.name();

    const deleteHandlers = {
      'wb-text': () => {
        const id = node._whiteboardId;
        this.text = this.text.filter((item) => item.id !== id);
      },
      'wb-image': () => {
        const id = node._whiteboardId;
        this.images = this.images.filter((item) => item.id !== id);
      },
    };
    const handler = deleteHandlers[name];

    if (handler) handler();
    node.destroy();

    this.#clearSelection();
    this.render();
  }

  /**
   * @private
   * Handle keydown for delete/backspace.
   * @param {KeyboardEvent} event
   */
  #handleKeydown = (event) => {
    if (!this.#selectedNode || !this.#enabled || this.#currentTool !== 'select') {
      return;
    }

    const targetTag = event.target?.tagName;
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') {
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      this.#deleteSelectedNode();
      this.#triggerChanged();
    }
  };

  /**
   * @private
   * Handle stage click/tap.
   * @param {any} event
   */
  #handleStageClick(event) {
    if (!this.#enabled || !this.#stage) {
      return;
    }

    const handlers = {
      text: () => {
        const pos = this.#stage.getPointerPosition();
        if (!pos) return;
        this.#startTextInput(pos.x, pos.y);
      },
      select: () => {
        if (event?.target === this.#stage) {
          this.#clearSelection();
        }
      },
    };

    const handler = handlers[this.#currentTool];
    if (handler) handler();
  }

  /**
   * @private
   * Begin drawing/erasing.
   */
  #handleDrawStart() {
    if (!this.#enabled || (this.#currentTool !== 'draw' && this.#currentTool !== 'erase')) {
      return;
    }
    this.#isDrawing = true;
    const pos = this.#stage.getPointerPosition();
    if (!pos) return;
    const isErase = this.#currentTool === 'erase';
    this.#currentPoints = [pos.x, pos.y];
    this.#currentLine = new this.#Renderer.Line({
      points: this.#currentPoints,
      stroke: this.#strokeColor,
      strokeWidth: isErase ? this.#strokeWidth * 3 : this.#strokeWidth,
      lineCap: 'round',
      lineJoin: 'round',
      globalCompositeOperation: isErase ? 'destination-out' : 'source-over',
    });
    this.#strokesLayer.add(this.#currentLine);
  }

  /**
   * @private
   * Continue drawing/erasing.
   */
  #handleDrawMove() {
    if (!this.#enabled || (this.#currentTool !== 'draw' && this.#currentTool !== 'erase')) {
      return;
    }
    if (!this.#isDrawing || !this.#currentLine) {
      return;
    }
    const pos = this.#stage.getPointerPosition();
    if (!pos) return;
    this.#currentPoints.push(pos.x, pos.y);
    this.#currentLine.points(this.#currentPoints);
    this.#strokesLayer.batchDraw();
  }

  /**
   * @private
   * Finish drawing/erasing.
   */
  #handleDrawEnd() {
    if (!this.#enabled || (this.#currentTool !== 'draw' && this.#currentTool !== 'erase')) {
      return;
    }
    if (!this.#isDrawing || !this.#currentLine) {
      return;
    }
    this.#isDrawing = false;
    const pairs = [];
    for (let i = 0; i < this.#currentPoints.length; i += 2) {
      pairs.push([this.#currentPoints[i], this.#currentPoints[i + 1]]);
    }
    const isErase = this.#currentTool === 'erase';
    this.addStroke({
      points: pairs,
      color: this.#strokeColor,
      width: isErase ? this.#strokeWidth * 3 : this.#strokeWidth,
      type: isErase ? 'erase' : 'draw',
    });
    this.#triggerChanged();
    this.#currentLine = null;
    this.#currentPoints = [];
  }

  /**
   * @private
   * Start text input at coordinates.
   * @param {number} x
   * @param {number} y
   * @param {string} [initialValue]
   */
  #startTextInput(x, y) {
    if (!this.#containerEl) {
      return;
    }

    const textarea = createTextarea({
      left: x,
      top: y,
      height: 24,
      background: 'transparent',
      fontSize: 18,
      color: '#2293fb',
    });
    this.#containerEl.append(textarea);

    textarea.focus();
    textarea.select();

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      const text = textarea.value.trim();
      if (text) {
        this.addText({ x, y, content: text });
        if (this.#currentTool === 'text' && this.#onToolChange) {
          this.#onToolChange('select');
        }
      }
      if (textarea.parentNode === this.#containerEl) {
        this.#containerEl.removeChild(textarea);
      }
    };

    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        finish();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        finish();
      }
    });
    textarea.addEventListener('blur', finish);
  }

  /**
   * @private
   * Edit an existing text node.
   * @param {any} textNode
   * @param {WhiteboardTextItem} item
   */
  #editTextNode(textNode, item) {
    if (!this.#containerEl || !this.#stage) {
      return;
    }

    this.#clearSelection();

    const textPosition = textNode.position();
    const textarea = createTextarea({
      value: textNode.text(),
      left: textPosition.x,
      top: textPosition.y,
      width: Math.max(textNode.width(), 120),
      height: Math.max(textNode.height(), 24),
      fontSize: textNode.fontSize(),
      fontFamily: textNode.fontFamily(),
      color: textNode.fill ? textNode.fill() : '#2293fb',
      background: 'white',
      resize: 'both',
    });
    this.#containerEl.appendChild(textarea);

    textarea.focus();
    textarea.select();

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      const value = textarea.value.trim();
      if (value) {
        textNode.text(value);
        item.content = value;
        this.#layer.batchDraw();
        this.#triggerChanged();
      }
      if (textarea.parentNode) {
        textarea.parentNode.removeChild(textarea);
      }
    };

    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        finish();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        finish();
      }
    });
    textarea.addEventListener('blur', finish);
  }
}
