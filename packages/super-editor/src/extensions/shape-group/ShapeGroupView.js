// @ts-expect-error - preset-geometry package may not have type definitions
import { getPresetShapeSvg } from '@superdoc/preset-geometry';
import { createGradient, createTextElement } from '../shared/svg-utils.js';

export class ShapeGroupView {
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
    // For absolutely positioned shape groups, ensure parent paragraph is positioned
    // so it becomes the containing block for CSS absolute positioning
    this.#ensureParentPositioned();
  }

  /**
   * Ensures the parent paragraph element is positioned for absolute-positioned shape groups.
   *
   * For shape groups with wrap type 'None' (absolutely positioned), the parent paragraph
   * element must have `position: relative` to establish a containing block for CSS absolute
   * positioning. This allows the shape group's `top` and `left` offsets to position correctly
   * relative to the paragraph.
   *
   * Uses requestAnimationFrame to defer the DOM manipulation until after the element is fully
   * mounted in the DOM tree. This prevents race conditions where the parent element might not
   * yet be available during the initial render phase.
   *
   * Only applies to wrap type 'None' - inline and floated elements do not require this setup.
   */
  #ensureParentPositioned() {
    const wrapType = this.node.attrs.wrap?.type || 'Inline';
    if (wrapType !== 'None') return;

    // Use requestAnimationFrame to ensure the element is in the DOM
    if (typeof globalThis !== 'undefined' && globalThis.requestAnimationFrame) {
      globalThis.requestAnimationFrame(() => {
        try {
          const parent = this.root?.parentElement;
          if (parent && parent.tagName === 'P') {
            // Set parent paragraph as positioned so shape group positions relative to it
            parent.style.position = 'relative';
          }
        } catch (error) {
          // Silently handle DOM manipulation errors (e.g., detached node, read-only style)
          // These are edge cases that should not break rendering
          console.warn('Failed to position parent element for shape group:', error);
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
    const { groupTransform, shapes, size, marginOffset, originalAttributes, wrap, anchorData } = attrs;

    const container = document.createElement('div');
    container.classList.add('sd-shape-group');
    container.setAttribute('data-shape-group', '');

    // Use size from attrs if available, otherwise calculate from group transform
    const width = size?.width || groupTransform?.width || 300;
    const height = size?.height || groupTransform?.height || 200;

    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    container.style.position = 'relative';
    container.style.display = 'inline-block';

    // Handle wrapping and positioning based on wrap type
    const wrapType = wrap?.type || 'Inline';

    if (wrapType === 'None') {
      // Absolutely positioned, floats above content
      container.style.position = 'absolute';

      // Per OOXML spec, all relativeFrom values (page, margin, column, paragraph)
      // position relative to the top-left edge of the reference element.
      // Use CSS top/left for absolute positioning from containing block.
      if (marginOffset?.horizontal != null) {
        container.style.left = `${marginOffset.horizontal}px`;
      }

      // For column-relative positioning with posOffset, override max-width to allow extending into margins
      const isColumnRelative = anchorData?.hRelativeFrom === 'column';
      if (isColumnRelative && !anchorData?.alignH && marginOffset?.horizontal != null) {
        container.style.maxWidth = 'none';
      }
      if (marginOffset?.top != null) {
        container.style.top = `${marginOffset.top}px`;
      }

      // Use relativeHeight from OOXML for proper z-ordering of overlapping elements
      const relativeHeight = originalAttributes?.relativeHeight;
      if (relativeHeight != null) {
        const zIndex = Math.floor(relativeHeight / 1000000);
        container.style.zIndex = zIndex.toString();
      } else {
        container.style.zIndex = '1';
      }
    } else if (wrapType === 'Square') {
      // Float element so text wraps around it
      container.style.float = 'left';
      container.style.clear = 'both';

      // Apply margins for positioning and spacing
      if (marginOffset?.horizontal != null) {
        container.style.marginLeft = `${marginOffset.horizontal}px`;
      }
      if (marginOffset?.top != null) {
        container.style.marginTop = `${marginOffset.top}px`;
      }

      // Add wrap distance margins if available
      if (wrap?.attrs?.distLeft) {
        container.style.marginLeft = `${(marginOffset?.horizontal || 0) + wrap.attrs.distLeft}px`;
      }
      if (wrap?.attrs?.distRight) {
        container.style.marginRight = `${wrap.attrs.distRight}px`;
      }
      if (wrap?.attrs?.distTop) {
        container.style.marginTop = `${(marginOffset?.top || 0) + wrap.attrs.distTop}px`;
      }
      if (wrap?.attrs?.distBottom) {
        container.style.marginBottom = `${wrap.attrs.distBottom}px`;
      }
    } else {
      // Inline or other wrap types - keep in flow
      if (marginOffset?.horizontal != null) {
        container.style.marginLeft = `${marginOffset.horizontal}px`;
      }
      if (marginOffset?.top != null) {
        container.style.marginTop = `${marginOffset.top}px`;
      }
    }

    // Create SVG container for the group
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('version', '1.1');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('width', width.toString());
    svg.setAttribute('height', height.toString());
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.display = 'block';

    // Create defs section for gradients
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.appendChild(defs);

    // Render each shape in the group
    if (shapes && Array.isArray(shapes)) {
      shapes.forEach((shape, index) => {
        if (shape.shapeType === 'vectorShape') {
          const shapeElement = this.createShapeElement(shape, groupTransform, defs, index);
          if (shapeElement) {
            svg.appendChild(shapeElement);
          }
        } else if (shape.shapeType === 'image') {
          const imageElement = this.createImageElement(shape, groupTransform);
          if (imageElement) {
            svg.appendChild(imageElement);
          }
        }
      });
    }

    container.appendChild(svg);

    return { element: container };
  }

  createShapeElement(shape, groupTransform, defs, shapeIndex) {
    const attrs = shape.attrs;
    if (!attrs) return null;

    // Calculate position relative to group
    const x = attrs.x ?? 0;
    const y = attrs.y ?? 0;
    const width = attrs.width ?? 100;
    const height = attrs.height ?? 100;

    // Create a group element for the shape
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    // Apply transformations
    const transforms = [];
    transforms.push(`translate(${x}, ${y})`);

    if (attrs.rotation !== 0) {
      transforms.push(`rotate(${attrs.rotation} ${width / 2} ${height / 2})`);
    }

    if (attrs.flipH) {
      transforms.push(`scale(-1, 1) translate(${-width}, 0)`);
    }

    if (attrs.flipV) {
      transforms.push(`scale(1, -1) translate(0, ${-height})`);
    }

    if (transforms.length > 0) {
      g.setAttribute('transform', transforms.join(' '));
    }

    // Generate the shape based on its kind
    const shapeKind = attrs.kind || 'rect';
    // Preserve null (from <a:noFill/>), but provide default for undefined
    const fillColor = attrs.fillColor === null ? null : (attrs.fillColor ?? '#5b9bd5');
    // Use null-coalescing to preserve null (from <a:noFill/>), but provide default for undefined
    const strokeColor = attrs.strokeColor === null ? null : (attrs.strokeColor ?? '#000000');
    const strokeWidth = attrs.strokeWidth ?? 1;
    const lineEnds = attrs.lineEnds;

    // Handle gradient fills
    let fillValue = fillColor;
    if (fillColor && typeof fillColor === 'object' && fillColor.type === 'gradient') {
      const gradientId = `gradient-${shapeIndex}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
      const gradient = this.createGradient(fillColor, gradientId);
      defs.appendChild(gradient);
      fillValue = `url(#${gradientId})`;
    } else if (fillColor === null) {
      fillValue = 'none'; // Transparent
    } else if (typeof fillColor === 'string') {
      fillValue = fillColor;
    }

    // Special case: handle line shapes directly since getPresetShapeSvg doesn't support them
    if (shapeKind === 'line') {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '0');
      line.setAttribute('y1', '0');
      // For horizontal lines (height=0), draw from (0,0) to (width,0)
      // For vertical lines (width=0), draw from (0,0) to (0,height)
      // For diagonal lines, draw from (0,0) to (width,height)
      line.setAttribute('x2', width.toString());
      line.setAttribute('y2', height.toString());
      line.setAttribute('stroke', strokeColor === null ? 'none' : strokeColor);
      line.setAttribute('stroke-width', (strokeColor === null ? 0 : strokeWidth).toString());
      if (lineEnds && strokeColor !== null) {
        const markerBase = `line-end-${shapeIndex}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
        this.applyLineEndsToTarget(line, lineEnds, strokeColor, strokeWidth, defs, markerBase);
      }
      g.appendChild(line);

      // Add text content if present
      if (attrs.textContent && attrs.textContent.parts) {
        const pageNumber = this.editor?.options?.currentPageNumber;
        const totalPages = this.editor?.options?.totalPageCount;
        const textGroup = this.createTextElement(attrs.textContent, attrs.textAlign, width, height, {
          textVerticalAlign: attrs.textVerticalAlign,
          textInsets: attrs.textInsets,
          pageNumber,
          totalPages,
        });
        if (textGroup) {
          g.appendChild(textGroup);
        }
      }

      return g;
    }

    try {
      const svgContent = getPresetShapeSvg({
        preset: shapeKind,
        styleOverrides: {
          fill: fillValue || 'none',
          stroke: strokeColor === null ? 'none' : strokeColor,
          strokeWidth: strokeColor === null ? 0 : strokeWidth,
        },
        width,
        height,
      });

      if (svgContent) {
        // Parse the SVG string and extract the path/shape element
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = svgContent;
        const svgElement = tempDiv.querySelector('svg');

        if (svgElement) {
          const markerBase = lineEnds
            ? `line-end-${shapeIndex}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
            : null;
          let lineEndsApplied = false;
          // Copy all child elements from the generated SVG into our group
          Array.from(svgElement.children).forEach((child) => {
            const clonedChild = child.cloneNode(true);

            // For elements with viewBox-based paths (like ellipse, circle, etc.),
            // we need to scale them to match the actual width and height
            if (clonedChild.tagName === 'ellipse') {
              // Update ellipse radii to match the actual dimensions
              clonedChild.setAttribute('cx', (width / 2).toString());
              clonedChild.setAttribute('cy', (height / 2).toString());
              clonedChild.setAttribute('rx', (width / 2).toString());
              clonedChild.setAttribute('ry', (height / 2).toString());
            } else if (clonedChild.tagName === 'circle') {
              // Convert circle to ellipse if width !== height
              if (width !== height) {
                const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
                ellipse.setAttribute('cx', (width / 2).toString());
                ellipse.setAttribute('cy', (height / 2).toString());
                ellipse.setAttribute('rx', (width / 2).toString());
                ellipse.setAttribute('ry', (height / 2).toString());
                // Copy attributes
                Array.from(clonedChild.attributes).forEach((attr) => {
                  if (!['cx', 'cy', 'r'].includes(attr.name)) {
                    ellipse.setAttribute(attr.name, attr.value);
                  }
                });
                g.appendChild(ellipse);
                return;
              } else {
                clonedChild.setAttribute('cx', (width / 2).toString());
                clonedChild.setAttribute('cy', (height / 2).toString());
                clonedChild.setAttribute('r', (width / 2).toString());
              }
            } else if (clonedChild.tagName === 'rect') {
              clonedChild.setAttribute('width', width.toString());
              clonedChild.setAttribute('height', height.toString());
            } else if (clonedChild.tagName === 'path' && svgElement.hasAttribute('viewBox')) {
              // For path elements, we need to scale based on viewBox
              const viewBox = svgElement.getAttribute('viewBox').split(' ').map(Number);
              if (viewBox.length === 4) {
                const [, , vbWidth, vbHeight] = viewBox;
                const scaleX = width / vbWidth;
                const scaleY = height / vbHeight;
                if (scaleX !== 1 || scaleY !== 1) {
                  const pathTransform = `scale(${scaleX}, ${scaleY})`;
                  const existingTransform = clonedChild.getAttribute('transform');
                  clonedChild.setAttribute(
                    'transform',
                    existingTransform ? `${existingTransform} ${pathTransform}` : pathTransform,
                  );
                }
              }
            } else if (clonedChild.hasAttribute('width')) {
              clonedChild.setAttribute('width', width.toString());
            }

            if (clonedChild.hasAttribute('height') && clonedChild.tagName !== 'ellipse') {
              clonedChild.setAttribute('height', height.toString());
            }

            if (
              lineEnds &&
              !lineEndsApplied &&
              (clonedChild.tagName === 'path' || clonedChild.tagName === 'line' || clonedChild.tagName === 'polyline')
            ) {
              this.applyLineEndsToTarget(clonedChild, lineEnds, strokeColor, strokeWidth, defs, markerBase);
              lineEndsApplied = true;
            }

            g.appendChild(clonedChild);
          });
        }
      }
    } catch (error) {
      console.warn('Failed to generate shape SVG:', error);
      // Fallback to a simple rectangle
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('width', width.toString());
      rect.setAttribute('height', height.toString());
      rect.setAttribute('fill', fillColor === null ? 'none' : typeof fillColor === 'string' ? fillColor : '#cccccc');
      rect.setAttribute('stroke', strokeColor === null ? 'none' : strokeColor);
      rect.setAttribute('stroke-width', strokeColor === null ? '0' : strokeWidth.toString());
      g.appendChild(rect);
    }

    // Add text content if present
    if (attrs.textContent && attrs.textContent.parts) {
      const pageNumber = this.editor?.options?.currentPageNumber;
      const totalPages = this.editor?.options?.totalPageCount;
      const textGroup = this.createTextElement(attrs.textContent, attrs.textAlign, width, height, {
        textVerticalAlign: attrs.textVerticalAlign,
        textInsets: attrs.textInsets,
        pageNumber,
        totalPages,
      });
      if (textGroup) {
        g.appendChild(textGroup);
      }
    }

    return g;
  }

  createTextElement(textContent, textAlign, width, height, options) {
    return createTextElement(textContent, textAlign, width, height, options);
  }

  /**
   * Applies line end markers (arrowheads) to a target SVG element.
   * @param {SVGElement} target - The SVG element to apply markers to
   * @param {Object} lineEnds - Line ends configuration with head/tail
   * @param {string|null} strokeColor - Stroke color, or null if no stroke
   * @param {number} strokeWidth - Stroke width in pixels
   * @param {SVGDefsElement} defs - The defs element to append markers to
   * @param {string} markerBase - Base ID for generating unique marker IDs
   */
  applyLineEndsToTarget(target, lineEnds, strokeColor, strokeWidth, defs, markerBase) {
    if (!lineEnds || strokeColor === null || strokeWidth <= 0) return;

    if (lineEnds.tail) {
      const id = `${markerBase}-tail`;
      this.createLineEndMarker(defs, id, lineEnds.tail, strokeColor, strokeWidth, true, null);
      target.setAttribute('marker-start', `url(#${id})`);
    }

    if (lineEnds.head) {
      const id = `${markerBase}-head`;
      this.createLineEndMarker(defs, id, lineEnds.head, strokeColor, strokeWidth, false, null);
      target.setAttribute('marker-end', `url(#${id})`);
    }
  }

  /**
   * Creates an SVG marker element for a line end (arrowhead).
   * @param {SVGDefsElement} defs - The defs element to append the marker to
   * @param {string} id - Unique ID for the marker
   * @param {Object} lineEnd - Line end configuration with type, width, length
   * @param {string} strokeColor - Color to use for the marker fill
   * @param {number} _strokeWidth - Stroke width (currently unused, reserved for future scaling)
   * @param {boolean} isStart - Whether this is a start marker (tail) or end marker (head)
   * @param {Object|null} effectExtent - Effect extent for sizing, or null
   */
  createLineEndMarker(defs, id, lineEnd, strokeColor, _strokeWidth, isStart, effectExtent) {
    if (defs.querySelector(`#${id}`)) return;

    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', id);
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('orient', 'auto');

    const sizeScale = (value) => {
      if (value === 'sm') return 0.75;
      if (value === 'lg') return 1.25;
      return 1;
    };
    const effectMax = effectExtent
      ? Math.max(effectExtent.left || 0, effectExtent.right || 0, effectExtent.top || 0, effectExtent.bottom || 0)
      : 0;
    const useEffectExtent = Number.isFinite(effectMax) && effectMax > 0;
    const markerWidth = useEffectExtent ? effectMax * 2 : 4 * sizeScale(lineEnd.length);
    const markerHeight = useEffectExtent ? effectMax * 2 : 4 * sizeScale(lineEnd.width);
    marker.setAttribute('markerUnits', useEffectExtent ? 'userSpaceOnUse' : 'strokeWidth');
    marker.setAttribute('markerWidth', markerWidth.toString());
    marker.setAttribute('markerHeight', markerHeight.toString());
    marker.setAttribute('refX', isStart ? '0' : '10');
    marker.setAttribute('refY', '5');

    const shape = this.createLineEndShape(lineEnd.type || 'triangle', strokeColor, isStart);
    marker.appendChild(shape);
    defs.appendChild(marker);
  }

  /**
   * Creates an SVG shape element for a line end marker.
   * Supports diamond, oval, and triangle (default) shapes.
   * @param {string} type - The shape type ('diamond', 'oval', or 'triangle')
   * @param {string} strokeColor - Color to fill the shape with
   * @param {boolean} isStart - Whether this is a start marker (affects triangle orientation)
   * @returns {SVGElement} The created SVG shape element
   */
  createLineEndShape(type, strokeColor, isStart) {
    const normalized = type.toLowerCase();
    if (normalized === 'diamond') {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M 0 5 L 5 0 L 10 5 L 5 10 Z');
      path.setAttribute('fill', strokeColor);
      path.setAttribute('stroke', 'none');
      return path;
    }
    if (normalized === 'oval') {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', '5');
      circle.setAttribute('cy', '5');
      circle.setAttribute('r', '5');
      circle.setAttribute('fill', strokeColor);
      circle.setAttribute('stroke', 'none');
      return circle;
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = isStart ? 'M 10 0 L 0 5 L 10 10 Z' : 'M 0 0 L 10 5 L 0 10 Z';
    path.setAttribute('d', d);
    path.setAttribute('fill', strokeColor);
    path.setAttribute('stroke', 'none');
    return path;
  }

  createGradient(gradientData, gradientId) {
    return createGradient(gradientData, gradientId);
  }

  createImageElement(shape, _groupTransform) {
    const attrs = shape.attrs;
    if (!attrs) return null;

    // Get image position and size
    const x = attrs.x || 0;
    const y = attrs.y || 0;
    const width = attrs.width || 100;
    const height = attrs.height || 100;

    // Create SVG image element
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('x', x.toString());
    image.setAttribute('y', y.toString());
    image.setAttribute('width', width.toString());
    image.setAttribute('height', height.toString());

    // Get image source from editor's media storage or use the path directly
    const src = this.editor?.storage?.image?.media?.[attrs.src] ?? attrs.src;
    image.setAttribute('href', src);
    image.setAttribute('preserveAspectRatio', 'none'); // Stretch to fill

    return image;
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
