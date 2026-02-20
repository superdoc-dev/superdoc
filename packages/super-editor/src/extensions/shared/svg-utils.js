/**
 * Shared utility functions for SVG shape rendering
 * Used by VectorShapeView and ShapeGroupView
 */

/**
 * Creates an SVG gradient element (linear or radial)
 * @param {Object} gradientData - The gradient configuration
 * @param {string} gradientData.gradientType - 'linear' or 'radial'
 * @param {Array} gradientData.stops - Array of gradient stops
 * @param {number} gradientData.angle - Angle for linear gradients (in degrees)
 * @param {string} gradientId - Unique identifier for the gradient
 * @returns {SVGGradientElement|null} The created gradient element or null
 */
export function createGradient(gradientData, gradientId) {
  const { gradientType, stops, angle } = gradientData;

  // Ensure we have stops
  if (!stops || stops.length === 0) {
    return null;
  }

  let gradient;

  if (gradientType === 'linear') {
    gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    gradient.setAttribute('id', gradientId);

    // Convert angle to x1, y1, x2, y2 coordinates
    // OOXML angle is in degrees, 0 = left to right, 90 = bottom to top
    const radians = (angle * Math.PI) / 180;
    const x1 = 50 - 50 * Math.cos(radians);
    const y1 = 50 + 50 * Math.sin(radians);
    const x2 = 50 + 50 * Math.cos(radians);
    const y2 = 50 - 50 * Math.sin(radians);

    gradient.setAttribute('x1', `${x1}%`);
    gradient.setAttribute('y1', `${y1}%`);
    gradient.setAttribute('x2', `${x2}%`);
    gradient.setAttribute('y2', `${y2}%`);
  } else {
    gradient = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
    gradient.setAttribute('id', gradientId);
    gradient.setAttribute('cx', '50%');
    gradient.setAttribute('cy', '50%');
    gradient.setAttribute('r', '50%');
  }

  // Add gradient stops
  stops.forEach((stop) => {
    const stopElement = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stopElement.setAttribute('offset', `${stop.position * 100}%`);
    stopElement.setAttribute('stop-color', stop.color);
    if (stop.alpha != null && stop.alpha < 1) {
      stopElement.setAttribute('stop-opacity', stop.alpha.toString());
    }
    gradient.appendChild(stopElement);
  });

  return gradient;
}

/**
 * Creates an SVG foreignObject with formatted text content.
 *
 * @param {Object} textContent - The text content with parts and formatting
 * @param {Array<Object>} textContent.parts - Array of text parts with formatting
 * @param {string} textContent.parts[].text - The text content
 * @param {Object} [textContent.parts[].formatting] - Formatting options (bold, italic, color, fontSize, fontFamily)
 * @param {'PAGE'|'NUMPAGES'} [textContent.parts[].fieldType] - Field type for dynamic content resolution
 * @param {boolean} [textContent.parts[].isLineBreak] - Whether this part represents a line break
 * @param {boolean} [textContent.parts[].isEmptyParagraph] - Whether this line break follows an empty paragraph
 * @param {string} textAlign - Text alignment ('left', 'center', 'right', 'r')
 * @param {number} width - Width of the text area in pixels
 * @param {number} height - Height of the text area in pixels
 * @param {Object} [options={}] - Additional rendering options
 * @param {{ top: number, right: number, bottom: number, left: number }} [options.textInsets] - Text padding insets in pixels
 * @param {'top'|'center'|'bottom'} [options.textVerticalAlign] - Vertical alignment of text content
 * @param {number} [options.pageNumber] - Current page number for PAGE field resolution
 * @param {number} [options.totalPages] - Total page count for NUMPAGES field resolution
 * @returns {SVGForeignObjectElement} The created foreignObject element containing the formatted text
 */
export function createTextElement(textContent, textAlign, width, height, options = {}) {
  const { textInsets, textVerticalAlign, pageNumber, totalPages } = options;
  // Use foreignObject with HTML for proper text wrapping
  const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
  foreignObject.setAttribute('x', '0');
  foreignObject.setAttribute('y', '0');
  foreignObject.setAttribute('width', width.toString());
  foreignObject.setAttribute('height', height.toString());

  // Create HTML div for text content
  const div = document.createElement('div');
  div.style.width = '100%';
  div.style.height = '100%';
  div.style.display = 'flex';
  div.style.flexDirection = 'column';
  const verticalAlign = textVerticalAlign || 'center';
  if (verticalAlign === 'top') {
    div.style.justifyContent = 'flex-start';
  } else if (verticalAlign === 'bottom') {
    div.style.justifyContent = 'flex-end';
  } else {
    div.style.justifyContent = 'center';
  }
  if (textInsets) {
    div.style.padding = `${textInsets.top}px ${textInsets.right}px ${textInsets.bottom}px ${textInsets.left}px`;
  } else {
    div.style.padding = '10px';
  }
  div.style.boxSizing = 'border-box';
  div.style.wordWrap = 'break-word';
  div.style.overflowWrap = 'break-word';
  // Set explicit base font-size to prevent CSS inheritance from parent editor
  // Default to 12px which is a reasonable base; individual spans will override with their own sizes
  div.style.fontSize = '12px';
  div.style.lineHeight = '1.2';

  // Set text alignment (horizontal alignment for each paragraph)
  if (textAlign === 'center') {
    div.style.textAlign = 'center';
  } else if (textAlign === 'right' || textAlign === 'r') {
    div.style.textAlign = 'right';
  } else {
    div.style.textAlign = 'left';
  }

  // Create paragraphs by splitting on line breaks
  let currentParagraph = document.createElement('div');

  const resolveFieldText = (part) => {
    if (part.fieldType === 'PAGE') {
      return pageNumber != null ? String(pageNumber) : '1';
    }
    if (part.fieldType === 'NUMPAGES') {
      return totalPages != null ? String(totalPages) : '1';
    }
    return part.text;
  };

  // Add text content with formatting
  textContent.parts.forEach((part) => {
    if (part.isLineBreak) {
      // Finish current paragraph and start a new one
      div.appendChild(currentParagraph);
      currentParagraph = document.createElement('div');
      // Empty paragraphs create extra spacing (blank line)
      if (part.isEmptyParagraph) {
        currentParagraph.style.minHeight = '1em';
      }
    } else {
      const span = document.createElement('span');
      span.textContent = resolveFieldText(part);

      // Apply formatting
      if (part.formatting) {
        if (part.formatting.bold) {
          span.style.fontWeight = 'bold';
        }
        if (part.formatting.italic) {
          span.style.fontStyle = 'italic';
        }
        if (part.formatting.fontFamily) {
          span.style.fontFamily = part.formatting.fontFamily;
        }
        if (part.formatting.color) {
          span.style.color = `#${part.formatting.color}`;
        }
        if (part.formatting.fontSize) {
          span.style.fontSize = `${part.formatting.fontSize}px`;
        }
      }

      currentParagraph.appendChild(span);
    }
  });

  // Add the final paragraph
  div.appendChild(currentParagraph);
  foreignObject.appendChild(div);

  return foreignObject;
}

/**
 * Applies a gradient to all filled elements in an SVG
 * @param {SVGElement} svg - The SVG element to apply gradient to
 * @param {Object} gradientData - The gradient configuration
 * @param {string} gradientData.gradientType - 'linear' or 'radial'
 * @param {Array} gradientData.stops - Array of gradient stops
 * @param {number} gradientData.angle - Angle for linear gradients (in degrees)
 */
export function applyGradientToSVG(svg, gradientData) {
  const { gradientType, stops, angle } = gradientData;
  const gradientId = `gradient-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

  // Create defs if it doesn't exist
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }

  // Create gradient element
  let gradient;

  if (gradientType === 'linear') {
    gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    gradient.setAttribute('id', gradientId);

    // Convert angle to x1, y1, x2, y2 coordinates
    // OOXML angle is in degrees, 0 = left to right, 90 = bottom to top
    const radians = (angle * Math.PI) / 180;
    const x1 = 50 - 50 * Math.cos(radians);
    const y1 = 50 + 50 * Math.sin(radians);
    const x2 = 50 + 50 * Math.cos(radians);
    const y2 = 50 - 50 * Math.sin(radians);

    gradient.setAttribute('x1', `${x1}%`);
    gradient.setAttribute('y1', `${y1}%`);
    gradient.setAttribute('x2', `${x2}%`);
    gradient.setAttribute('y2', `${y2}%`);
  } else {
    gradient = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
    gradient.setAttribute('id', gradientId);
    gradient.setAttribute('cx', '50%');
    gradient.setAttribute('cy', '50%');
    gradient.setAttribute('r', '50%');
  }

  // Add gradient stops
  stops.forEach((stop) => {
    const stopElement = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stopElement.setAttribute('offset', `${stop.position * 100}%`);
    stopElement.setAttribute('stop-color', stop.color);
    if (stop.alpha != null && stop.alpha < 1) {
      stopElement.setAttribute('stop-opacity', stop.alpha.toString());
    }
    gradient.appendChild(stopElement);
  });

  defs.appendChild(gradient);

  // Apply gradient to all filled elements
  const filledElements = svg.querySelectorAll('[fill]:not([fill="none"])');
  filledElements.forEach((el) => {
    el.setAttribute('fill', `url(#${gradientId})`);
  });
}

/**
 * Applies alpha transparency to all filled elements in an SVG
 * @param {SVGElement} svg - The SVG element to apply alpha to
 * @param {Object} alphaData - The alpha configuration
 * @param {string} alphaData.color - The fill color
 * @param {number} alphaData.alpha - The alpha value (0-1)
 */
export function applyAlphaToSVG(svg, alphaData) {
  const { color, alpha } = alphaData;

  // Apply color with opacity to all filled elements
  const filledElements = svg.querySelectorAll('[fill]:not([fill="none"])');
  filledElements.forEach((el) => {
    el.setAttribute('fill', color);
    el.setAttribute('fill-opacity', alpha.toString());
  });
}

/**
 * Generates transform string from shape attributes
 * @param {Object} attrs - Shape attributes
 * @param {number} attrs.rotation - Rotation angle in degrees
 * @param {boolean} attrs.flipH - Horizontal flip
 * @param {boolean} attrs.flipV - Vertical flip
 * @returns {string[]} Array of transform strings
 */
export function generateTransforms(attrs) {
  const transforms = [];
  if (attrs.rotation != null) {
    transforms.push(`rotate(${attrs.rotation}deg)`);
  }
  if (attrs.flipH) {
    transforms.push(`scaleX(-1)`);
  }
  if (attrs.flipV) {
    transforms.push(`scaleY(-1)`);
  }
  return transforms;
}
