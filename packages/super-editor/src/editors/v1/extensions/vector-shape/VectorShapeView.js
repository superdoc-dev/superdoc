// @ts-expect-error - preset-geometry package may not have type definitions
import { getPresetShapeSvg } from '@superdoc/preset-geometry';
import { inchesToPixels } from '@converter/helpers.js';
import { OOXML_Z_INDEX_BASE } from '@extensions/shared/constants.js';
import {
  createGradient,
  createTextElement,
  applyGradientToSVG,
  applyAlphaToSVG,
  generateTransforms,
  applyNonScalingStrokeToConnector,
  createConnectorPresetSvg,
  createLineEndMarker,
  formatSvgNumber,
  isConnectorPresetShape,
} from '../shared/svg-utils.js';

export class VectorShapeView {
  node;

  view;

  getPos;

  decorations;

  innerDecorations;

  editor;

  extension;

  htmlAttributes;

  root;

  constructor(props) {
    this.node = props.node;
    this.view = props.editor.view;
    this.getPos = props.getPos;
    this.decorations = props.decorations;
    this.innerDecorations = props.innerDecorations;
    this.editor = props.editor;
    this.extension = props.extension;
    this.htmlAttributes = props.htmlAttributes;

    this.mount();
  }

  mount() {
    this.buildView();
    // For absolutely positioned vector shapes, ensure parent paragraph is positioned
    // so it becomes the containing block for CSS absolute positioning
    this.#ensureParentPositioned();
  }

  /**
   * Ensures the parent paragraph element is positioned for absolute-positioned vector shapes.
   *
   * For vector shapes with wrap type 'None' (absolutely positioned), the parent paragraph
   * element must have `position: relative` to establish a containing block for CSS absolute
   * positioning. This allows the vector shape's `top` and `left` offsets to position correctly
   * relative to the paragraph.
   *
   * Uses requestAnimationFrame to defer the DOM manipulation until after the element is fully
   * mounted in the DOM tree. This prevents race conditions where the parent element might not
   * yet be available during the initial render phase.
   *
   * Only applies to wrap type 'None' - inline and floated elements do not require this setup.
   */
  #ensureParentPositioned() {
    const wrapType = this.node.attrs.wrap?.type;
    if (wrapType !== 'None') return;

    // Use requestAnimationFrame to ensure the element is in the DOM
    if (typeof globalThis !== 'undefined' && globalThis.requestAnimationFrame) {
      globalThis.requestAnimationFrame(() => {
        try {
          const parent = this.root?.parentElement;
          if (parent && parent.tagName === 'P') {
            // Set parent paragraph as positioned so vector shape positions relative to it
            parent.style.position = 'relative';
          }
        } catch (error) {
          // Silently handle DOM manipulation errors (e.g., detached node, read-only style)
          // These are edge cases that should not break rendering
          console.warn('Failed to position parent element for vector shape:', error);
        }
      });
    }
  }

  get dom() {
    return this.root;
  }

  get contentDOM() {
    return null;
  }

  createElement() {
    const attrs = this.node.attrs;

    const element = document.createElement('span');
    element.classList.add('sd-vector-shape');
    element.setAttribute('data-vector-shape', '');

    const effectExtent = attrs.effectExtent || null;
    const extentLeft = effectExtent?.left ?? 0;
    const extentTop = effectExtent?.top ?? 0;
    const extentRight = effectExtent?.right ?? 0;
    const extentBottom = effectExtent?.bottom ?? 0;
    const baseWidth = attrs.width ?? 0;
    const baseHeight = attrs.height ?? 0;
    const outerWidth = baseWidth + extentLeft + extentRight;
    const outerHeight = baseHeight + extentTop + extentBottom;

    element.style.width = `${outerWidth}px`;
    element.style.height = `${outerHeight}px`;

    // Apply anchor positioning styles
    const positioningStyle = this.getPositioningStyle(attrs);
    if (positioningStyle) {
      element.style.cssText += positioningStyle;
    }

    if (effectExtent && (!element.style.position || element.style.position === 'static')) {
      element.style.position = 'relative';
    }

    // Combine positioning transforms (from getPositioningStyle) with shape transforms (rotation, flip)
    // Transform order matters: positioning transforms are applied first, then shape transforms
    const transforms = this.generateTransform();
    const positioningTransform = element.style.transform;
    const combinedTransforms = [];

    // Handle edge case: empty or whitespace-only positioning transform
    if (positioningTransform && positioningTransform.trim() !== '') {
      combinedTransforms.push(positioningTransform.trim());
    }

    // Handle edge case: validate transforms array and filter out invalid values
    if (Array.isArray(transforms) && transforms.length > 0) {
      const validTransforms = transforms.filter(
        (t) => t !== null && t !== undefined && typeof t === 'string' && t.trim() !== '',
      );
      if (validTransforms.length > 0) {
        combinedTransforms.push(...validTransforms);
      }
    }

    // Only apply combined transform if we have valid transforms
    if (combinedTransforms.length > 0) {
      element.style.transform = combinedTransforms.join(' ');
    }

    // Create SVG directly with proper dimensions
    const svg = this.createSVGElement(attrs);
    if (svg) {
      if (effectExtent) {
        svg.style.position = 'absolute';
        svg.style.left = `${extentLeft}px`;
        svg.style.top = `${extentTop}px`;
      }
      this.applyLineEnds(svg, attrs);
      element.appendChild(svg);

      // Add text content if present
      if (attrs.textContent && attrs.textContent.parts) {
        const pageNumber = this.editor?.options?.currentPageNumber;
        const pageNumberText = this.editor?.options?.currentPageNumberText;
        const pageNumberDisplayNumber = this.editor?.options?.currentPageDisplayNumber;
        const pageNumberChapterText = this.editor?.options?.currentPageChapterNumberText;
        const pageNumberChapterSeparator = this.editor?.options?.currentPageChapterSeparator;
        const totalPages = this.editor?.options?.totalPageCount;
        const sectionPageCount = this.editor?.options?.sectionPageCount;
        const textElement = this.createTextElement(attrs.textContent, attrs.textAlign, attrs.width, attrs.height, {
          textVerticalAlign: attrs.textVerticalAlign,
          textInsets: attrs.textInsets,
          pageNumber,
          pageNumberText,
          pageNumberDisplayNumber,
          pageNumberChapterText,
          pageNumberChapterSeparator,
          totalPages,
          sectionPageCount,
        });
        if (textElement) {
          svg.appendChild(textElement);
        }
      }
    }

    return { element };
  }

  getPositioningStyle(attrs) {
    const { anchorData, marginOffset, wrap, originalAttributes } = attrs;

    if (!anchorData && !marginOffset?.horizontal && !marginOffset?.top) {
      return '';
    }

    let style = '';
    const margin = { left: 0, right: 0, top: 0, bottom: 0 };
    let centered = false;
    let floatRight = false;
    let baseHorizontal = marginOffset?.horizontal || 0;

    // Handle wrap type and z-index
    if (wrap?.type === 'None') {
      style += 'position: absolute;';
      // Use relativeHeight from OOXML for proper z-ordering of overlapping elements
      const relativeHeight = originalAttributes?.relativeHeight;
      if (relativeHeight != null) {
        const zIndex = Math.max(0, relativeHeight - OOXML_Z_INDEX_BASE);
        style += `z-index: ${zIndex};`;
      } else if (wrap?.attrs?.behindDoc) {
        style += 'z-index: -1;';
      } else {
        style += 'z-index: 1;';
      }
    }

    // Handle anchor positioning
    if (anchorData) {
      switch (anchorData.hRelativeFrom) {
        case 'page':
          const pageStyles =
            this.editor?.converter?.pageStyles || this.editor?.options?.parentEditor?.converter?.pageStyles;
          margin.left -= inchesToPixels(pageStyles?.pageMargins?.left) || 0;
          break;
        case 'margin':
          if (anchorData.alignH === 'center') {
            style += 'position: absolute; left: 50%; transform: translateX(-50%);';
          }
          if (anchorData.alignH === 'left' || anchorData.alignH === 'right') {
            style += `position: absolute; ${anchorData.alignH}: 0;`;
          }
          break;
        case 'column':
          if (anchorData.alignH === 'center') {
            centered = true;
          } else if (anchorData.alignH === 'right') {
            floatRight = true;
            if (!style.includes('float: right;')) {
              style += 'float: right;';
            }
          } else if (anchorData.alignH === 'left') {
            if (!style.includes('float: left;')) {
              style += 'float: left;';
            }
          } else if (!anchorData.alignH && marginOffset?.horizontal != null) {
            const isAbsolutelyPositioned = style.includes('position: absolute;');
            if (isAbsolutelyPositioned) {
              style += `left: ${baseHorizontal}px;`;
              baseHorizontal = 0;
            }
          }
          break;
        default:
          break;
      }
    }

    // Apply position offsets
    // For absolutely positioned elements, use top/left per OOXML spec
    // For floated elements, use margins
    const isAbsolutelyPositioned = style.includes('position: absolute;');

    if (anchorData || marginOffset?.horizontal != null || marginOffset?.top != null) {
      const horizontal = baseHorizontal;
      const top = marginOffset?.top ?? 0;

      if (isAbsolutelyPositioned) {
        // Use CSS top/left for absolute positioning per OOXML spec
        if (horizontal && !style.includes('left:')) {
          style += `left: ${horizontal}px;`;
        }
        if (top != null) {
          style += `top: ${top}px;`;
        }
      } else {
        // Use margins for floated/inline elements
        if (horizontal) {
          if (floatRight) {
            margin.right += horizontal;
          } else {
            margin.left += horizontal;
          }
        }
        if (top > 0) {
          margin.top += top;
        }
      }
    }

    // Apply margins to style (for non-absolute positioning)
    if (centered) {
      style += 'margin-left: auto; margin-right: auto;';
    } else if (!isAbsolutelyPositioned) {
      if (margin.left) style += `margin-left: ${margin.left}px;`;
      if (margin.right) style += `margin-right: ${margin.right}px;`;
    }
    if (!isAbsolutelyPositioned && margin.top) style += `margin-top: ${margin.top}px;`;
    if (margin.bottom) style += `margin-bottom: ${margin.bottom}px;`;

    return style;
  }

  generateTransform() {
    return generateTransforms(this.node.attrs);
  }

  createSVGElement(attrs) {
    const { kind, fillColor, strokeColor, strokeWidth, width, height } = attrs;

    // Create SVG with proper dimensions (no viewBox distortion)
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width.toString());
    svg.setAttribute('height', height.toString());
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;
    svg.style.display = 'block';

    // Create defs for gradients if needed
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.appendChild(defs);

    // Determine fill value
    let fill = 'none';
    let fillOpacity = 1;

    if (fillColor) {
      if (typeof fillColor === 'object') {
        if (fillColor.type === 'gradient') {
          const gradientId = `gradient-${Math.random().toString(36).slice(2, 11)}-${Date.now()}`;
          const gradient = this.createGradient(fillColor, gradientId);
          if (gradient) {
            defs.appendChild(gradient);
            fill = `url(#${gradientId})`;
          }
        } else if (fillColor.type === 'solidWithAlpha') {
          fill = fillColor.color;
          fillOpacity = fillColor.alpha;
        }
      } else {
        fill = fillColor;
      }
    }

    const stroke = strokeColor === null ? 'none' : strokeColor || 'none';
    const strokeW = strokeColor === null ? 0 : strokeColor ? strokeWidth || 1 : 0;

    // Create shape element based on kind
    let shapeElement;

    switch (kind) {
      case 'rect':
        shapeElement = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        shapeElement.setAttribute('x', '0');
        shapeElement.setAttribute('y', '0');
        shapeElement.setAttribute('width', width.toString());
        shapeElement.setAttribute('height', height.toString());
        break;

      case 'roundRect':
        shapeElement = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        shapeElement.setAttribute('x', '0');
        shapeElement.setAttribute('y', '0');
        shapeElement.setAttribute('width', width.toString());
        shapeElement.setAttribute('height', height.toString());
        // Use a reasonable corner radius (5% of smallest dimension)
        const radius = Math.min(width, height) * 0.05;
        shapeElement.setAttribute('rx', radius.toString());
        shapeElement.setAttribute('ry', radius.toString());
        break;

      case 'ellipse':
        shapeElement = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        shapeElement.setAttribute('cx', (width / 2).toString());
        shapeElement.setAttribute('cy', (height / 2).toString());
        shapeElement.setAttribute('rx', (width / 2).toString());
        shapeElement.setAttribute('ry', (height / 2).toString());
        break;

      case 'circle':
        shapeElement = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        shapeElement.setAttribute('cx', (width / 2).toString());
        shapeElement.setAttribute('cy', (height / 2).toString());
        shapeElement.setAttribute('rx', (width / 2).toString());
        shapeElement.setAttribute('ry', (height / 2).toString());
        break;

      case 'line':
      case 'straightConnector1':
        const isHorizontalLine = height <= 1 && width > height;
        const isVerticalLine = width <= 1 && height > width;
        shapeElement = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        shapeElement.setAttribute('x1', isVerticalLine ? (width / 2).toString() : '0');
        shapeElement.setAttribute('y1', isHorizontalLine ? (height / 2).toString() : '0');
        shapeElement.setAttribute('x2', isVerticalLine ? (width / 2).toString() : width.toString());
        shapeElement.setAttribute('y2', isHorizontalLine ? (height / 2).toString() : height.toString());
        break;

      default:
        // For complex shapes, fall back to preset geometry with proper viewBox
        try {
          const svgTemplate = this.generateSVG({ kind, fillColor, strokeColor, strokeWidth, width, height });
          if (svgTemplate) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = svgTemplate;
            const tempSvg = tempDiv.querySelector('svg');
            if (tempSvg) {
              if (isConnectorPresetShape(kind)) {
                applyNonScalingStrokeToConnector(tempSvg);
              }
              // Preserve the preset viewBox and scale via width/height
              tempSvg.setAttribute('width', width.toString());
              tempSvg.setAttribute('height', height.toString());
              // Use 'none' to allow non-uniform scaling to match Word's behavior
              // Now that we're reading wp:extent correctly, the dimensions are accurate
              tempSvg.setAttribute('preserveAspectRatio', 'none');
              tempSvg.style.width = `${width}px`;
              tempSvg.style.height = `${height}px`;
              tempSvg.style.display = 'block';
              return tempSvg;
            }
          }
        } catch (error) {
          console.warn('Failed to generate SVG for shape:', kind, error);
          return null;
        }
        return null;
    }

    // Apply fill and stroke
    shapeElement.setAttribute('fill', fill);
    if (fillOpacity < 1) {
      shapeElement.setAttribute('fill-opacity', fillOpacity.toString());
    }
    shapeElement.setAttribute('stroke', stroke);
    shapeElement.setAttribute('stroke-width', strokeW.toString());
    if (kind === 'line' || kind === 'straightConnector1') {
      svg.setAttribute('viewBox', `0 0 ${formatSvgNumber(width)} ${formatSvgNumber(height)}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      shapeElement.setAttribute('vector-effect', 'non-scaling-stroke');
    }

    svg.appendChild(shapeElement);
    return svg;
  }

  /**
   * Applies line end markers (arrowheads) to an SVG element.
   * @param {SVGElement} svg - The SVG element to apply markers to
   * @param {Object} attrs - Shape attributes containing lineEnds, strokeColor, strokeWidth
   */
  applyLineEnds(svg, attrs) {
    const lineEnds = attrs.lineEnds;
    if (!lineEnds) return;
    if (attrs.strokeColor === null) return;
    const strokeColor = typeof attrs.strokeColor === 'string' ? attrs.strokeColor : '#000000';
    const strokeWidth = attrs.strokeWidth ?? 1;
    if (strokeWidth <= 0) return;

    const target = svg.querySelector('line') || svg.querySelector('path') || svg.querySelector('polyline');
    if (!target) return;

    const defs =
      svg.querySelector('defs') ||
      svg.insertBefore(document.createElementNS('http://www.w3.org/2000/svg', 'defs'), svg.firstChild);
    const idBase = `line-end-${Math.random().toString(36).slice(2, 8)}-${Date.now()}`;

    if (lineEnds.head) {
      const id = `${idBase}-head`;
      createLineEndMarker(defs, id, lineEnds.head, strokeColor, strokeWidth, true);
      target.setAttribute('marker-start', `url(#${id})`);
    }

    if (lineEnds.tail) {
      const id = `${idBase}-tail`;
      createLineEndMarker(defs, id, lineEnds.tail, strokeColor, strokeWidth, false);
      target.setAttribute('marker-end', `url(#${id})`);
    }
  }

  createGradient(gradientData, gradientId) {
    return createGradient(gradientData, gradientId);
  }

  generateSVG({ kind, fillColor, strokeColor, strokeWidth, width, height }) {
    try {
      if (isConnectorPresetShape(kind)) {
        return createConnectorPresetSvg({ kind, strokeColor, strokeWidth, width, height });
      }

      // For complex fill types (gradients, alpha), use a placeholder or extract the color
      let fill = fillColor || 'none';
      if (fillColor && typeof fillColor === 'object') {
        if (fillColor.type === 'gradient') {
          fill = '#cccccc'; // Placeholder for gradients
        } else if (fillColor.type === 'solidWithAlpha') {
          fill = fillColor.color; // Use the actual color, alpha will be applied separately
        }
      }

      return getPresetShapeSvg({
        preset: kind,
        styleOverrides: {
          fill,
          stroke: strokeColor || 'none',
          strokeWidth: strokeWidth || 0,
        },
        width,
        height,
      });
    } catch {
      return null;
    }
  }

  applyGradientToSVG(svg, gradientData) {
    applyGradientToSVG(svg, gradientData);
  }

  applyAlphaToSVG(svg, alphaData) {
    applyAlphaToSVG(svg, alphaData);
  }

  createTextElement(textContent, textAlign, width, height, options) {
    return createTextElement(textContent, textAlign, width, height, options);
  }

  buildView() {
    const { element } = this.createElement();
    this.root = element;
  }

  update() {
    // Recreate the NodeView.
    return false;
  }
}
