/**
 * Handles VML shape elements with v:textpath (text watermarks).
 *
 * This handles the common text watermark pattern where text is placed diagonally
 * across the page in headers using VML:
 * <w:pict>
 *   <v:shape type="#_x0000_t136">
 *     <v:path textpathok="t"/>
 *     <v:textpath on="t" fitshape="t" string="DRAFT MARK"/>
 *     <v:fill opacity="0.5"/>
 *   </v:shape>
 * </w:pict>
 *
 * Converts text watermarks to SVG images so they can be rendered using the
 * existing Image extension, which handles positioning correctly in headers.
 *
 * @param {Object} options
 * @returns {Object|null}
 */
export function handleShapeTextWatermarkImport({ pict }) {
  const shape = pict.elements?.find((el) => el.name === 'v:shape');
  if (!shape) return null;

  const textpath = shape.elements?.find((el) => el.name === 'v:textpath');
  if (!textpath) return null;

  const shapeAttrs = shape.attributes || {};
  const textpathAttrs = textpath.attributes || {};

  // Extract the watermark text
  const watermarkText = textpathAttrs['string'] || '';
  if (!watermarkText) {
    console.warn('v:textpath missing string attribute');
    return null;
  }

  // Parse VML style attribute to extract dimensions and positioning
  const style = shapeAttrs.style || '';
  const styleObj = parseVmlStyle(style);

  // Extract dimensions
  const width = styleObj.width || '481.8pt';
  const height = styleObj.height || '82.8pt';

  // Extract positioning
  const position = {
    type: styleObj.position || 'absolute',
    marginLeft: styleObj['margin-left'] || '0',
    marginTop: styleObj['margin-top'] || '0',
  };

  // Extract rotation (typically 315 degrees for diagonal watermarks)
  const rotation = parseFloat(styleObj.rotation) || 0;

  // Extract positioning attributes
  const hPosition = styleObj['mso-position-horizontal'] || 'center';
  const vPosition = styleObj['mso-position-vertical'] || 'center';
  const hRelativeTo = styleObj['mso-position-horizontal-relative'] || 'margin';
  const vRelativeTo = styleObj['mso-position-vertical-relative'] || 'margin';

  // Extract text anchor
  const textAnchor = styleObj['v-text-anchor'] || 'middle';

  // Extract fill properties
  const fill = shape.elements?.find((el) => el.name === 'v:fill');
  const fillAttrs = fill?.attributes || {};
  const rawFillColor = shapeAttrs.fillcolor || fillAttrs.color || 'silver';
  const rawFillColor2 = fillAttrs.color2 || '#3f3f3f';
  const fillColor = sanitizeColor(rawFillColor, 'silver');
  const fillColor2 = sanitizeColor(rawFillColor2, '#3f3f3f');
  const opacity = fillAttrs.opacity || '0.5';
  const fillType = fillAttrs.type || 'solid';

  // Extract stroke properties
  const stroke = shape.elements?.find((el) => el.name === 'v:stroke');
  const strokeAttrs = stroke?.attributes || {};
  const stroked = shapeAttrs.stroked || 'f';
  const strokeColor = strokeAttrs.color || '#3465a4';
  const strokeJoinstyle = strokeAttrs.joinstyle || 'round';
  const strokeEndcap = strokeAttrs.endcap || 'flat';

  // Extract text formatting from textpath style
  const textpathStyle = textpathAttrs.style || '';
  const textStyleObj = parseVmlStyle(textpathStyle);
  const rawFontFamily = textStyleObj['font-family']?.replace(/['"]/g, '');
  const fontFamily = sanitizeFontFamily(rawFontFamily);
  const fontSize = textStyleObj['font-size'] || '1pt';

  // Extract other textpath attributes
  const fitshape = textpathAttrs.fitshape || 't';
  const trim = textpathAttrs.trim || 't';
  const textpathOn = textpathAttrs.on || 't';

  // Extract path element
  const path = shape.elements?.find((el) => el.name === 'v:path');
  const pathAttrs = path?.attributes || {};
  const textpathok = pathAttrs.textpathok || 't';

  // Extract wrap element
  const wrap = shape.elements?.find((el) => el.name === 'w10:wrap');
  const wrapAttrs = wrap?.attributes || {};
  const wrapType = wrapAttrs.type || 'none';

  // Generate SVG for the text watermark with rotation baked in
  // (layout engine doesn't support rotation for image fragments)
  const widthPx = convertToPixels(width);
  const heightPx = convertToPixels(height);

  // Sanitize numeric values before use
  const sanitizedOpacity = sanitizeNumeric(parseFloat(opacity), 0.5, 0, 1);
  const sanitizedRotation = sanitizeNumeric(rotation, 0, -360, 360);

  const svgResult = generateTextWatermarkSVG({
    text: watermarkText,
    width: widthPx,
    height: heightPx,
    rotation: sanitizedRotation,
    fill: {
      color: fillColor,
      opacity: sanitizedOpacity,
    },
    textStyle: {
      fontFamily,
      fontSize,
    },
  });

  const svgDataUri = svgResult.dataUri;

  // Return as an image node (so it uses the Image extension for rendering)
  // but preserve all VML attributes for export round-trip
  const imageWatermarkNode = {
    type: 'image',
    attrs: {
      src: svgDataUri,
      alt: watermarkText,
      title: watermarkText,
      extension: 'svg',
      // Mark this as a text watermark for export
      vmlWatermark: true,
      vmlTextWatermark: true,
      // Store VML-specific attributes for round-trip
      vmlStyle: style,
      vmlAttributes: shapeAttrs,
      vmlTextpathAttributes: textpathAttrs,
      vmlPathAttributes: pathAttrs,
      vmlFillAttributes: fillAttrs,
      vmlStrokeAttributes: strokeAttrs,
      vmlWrapAttributes: wrapAttrs,
      // Positioning (same as image watermarks)
      isAnchor: true,
      inline: false,
      wrap: {
        type: wrapType === 'none' ? 'None' : wrapType,
        attrs: {
          behindDoc: true,
        },
      },
      anchorData: {
        hRelativeFrom: hRelativeTo,
        vRelativeFrom: vRelativeTo,
        alignH: hPosition,
        alignV: vPosition,
      },
      // Size - use rotated bounding box dimensions to prevent clipping
      size: {
        width: svgResult.svgWidth,
        height: svgResult.svgHeight,
      },
      marginOffset: {
        // For center-aligned watermarks relative to margin, Word's margin values
        // are not suitable for browser rendering. Set to 0 to let center alignment work.
        horizontal: hPosition === 'center' && hRelativeTo === 'margin' ? 0 : convertToPixels(position.marginLeft),
        top: vPosition === 'center' && vRelativeTo === 'margin' ? 0 : convertToPixels(position.marginTop),
      },
      // Store text watermark specific data for export
      textWatermarkData: {
        text: watermarkText,
        rotation: sanitizedRotation,
        textStyle: {
          fontFamily,
          fontSize,
          textAnchor,
        },
        fill: {
          color: fillColor,
          color2: fillColor2,
          opacity: sanitizedOpacity,
          type: fillType,
        },
        stroke: {
          enabled: stroked !== 'f',
          color: strokeColor,
          joinstyle: strokeJoinstyle,
          endcap: strokeEndcap,
        },
        textpath: {
          on: textpathOn === 't',
          fitshape: fitshape === 't',
          trim: trim === 't',
          textpathok: textpathok === 't',
        },
      },
    },
  };

  return imageWatermarkNode;
}

/**
 * Sanitize font family name to prevent SVG injection.
 * Only allows safe ASCII characters commonly used in font names.
 * @param {string} fontFamily - Font family name
 * @returns {string} Sanitized font family name
 */
function sanitizeFontFamily(fontFamily) {
  if (!fontFamily || typeof fontFamily !== 'string') {
    return 'Arial';
  }
  // Only allow alphanumeric, spaces, hyphens, and commas (for font lists)
  // This prevents injection via quotes, angle brackets, parentheses, etc.
  const sanitized = fontFamily.replace(/[^a-zA-Z0-9\s,\-]/g, '').trim();
  return sanitized || 'Arial';
}

/**
 * Sanitize color value to prevent SVG injection.
 * Only allows safe ASCII characters commonly used in color values.
 * @param {string} color - Color value
 * @param {string} defaultColor - Default color if validation fails
 * @returns {string} Sanitized color value
 */
function sanitizeColor(color, defaultColor = 'silver') {
  if (!color || typeof color !== 'string') {
    return defaultColor;
  }
  // Only allow alphanumeric, #, %, parentheses, commas, and dots for:
  // - Hex colors: #rgb, #rrggbb
  // - Named colors: red, blue, etc.
  // - RGB/RGBA: rgb(r,g,b), rgba(r,g,b,a)
  // This prevents injection via quotes, angle brackets, etc.
  const sanitized = color.replace(/[^a-zA-Z0-9#%(),.]/g, '').trim();
  return sanitized || defaultColor;
}

/**
 * Validate and sanitize numeric value.
 * @param {number|string} value - Numeric value
 * @param {number} defaultValue - Default value if validation fails
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number} Validated numeric value
 */
function sanitizeNumeric(value, defaultValue, min = -Infinity, max = Infinity) {
  const num = typeof value === 'number' ? value : parseFloat(value);

  if (isNaN(num) || !isFinite(num)) {
    return defaultValue;
  }

  // Clamp to min/max range
  return Math.max(min, Math.min(max, num));
}

/**
 * Generate an SVG data URI for a text watermark with rotation.
 * Rotation must be baked into the SVG since the layout engine doesn't support
 * rotation for image fragments (only drawing fragments).
 * @param {Object} options - Watermark options
 * @returns {Object} Object with dataUri, svgWidth, and svgHeight
 */
function generateTextWatermarkSVG({ text, width, height, rotation, fill, textStyle }) {
  // Word watermarks don't use font-size literally - they scale text to fill available space
  // Word VML typically specifies font-size:1pt, but this is just a scaling hint
  // The actual rendered size depends on the watermark dimensions (width/height)

  let fontSize = height * 0.9; // The value of 0.9 was determined by me by visual comparison.
  // It seems to be close to correct for text without rotation and slightly too low for text
  // with rotation.
  // Alternative: if explicit font size is given and not the typical 1pt, respect it
  // Only override if it's not the typical Word watermark 1pt
  if (textStyle?.fontSize && textStyle.fontSize.trim() !== '1pt') {
    const match = textStyle.fontSize.match(/^([\d.]+)(pt|px)?$/);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2] || 'pt';
      fontSize = (unit === 'pt' ? value * (96 / 72) : value) * 50;
    }
  }
  fontSize = Math.max(fontSize, 48); // Minimum visible size

  // Sanitize all values from untrusted input
  const color = sanitizeColor(fill?.color, 'silver');
  const opacity = sanitizeNumeric(fill?.opacity, 0.5, 0, 1);
  const fontFamily = sanitizeFontFamily(textStyle?.fontFamily);
  const sanitizedRotation = sanitizeNumeric(rotation, 0, -360, 360);
  const sanitizedWidth = sanitizeNumeric(width, 100, 1, 10000);
  const sanitizedHeight = sanitizeNumeric(height, 100, 1, 10000);
  const sanitizedFontSize = sanitizeNumeric(fontSize, 48, 1, 1000);

  // Calculate rotated bounding box dimensions to prevent clipping
  const radians = (sanitizedRotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));

  const rotatedWidth = sanitizedWidth * cos + sanitizedHeight * sin;
  const rotatedHeight = sanitizedWidth * sin + sanitizedHeight * cos;

  // Use larger dimensions to ensure rotated text isn't clipped
  // Add 10% padding to account for font rendering extending beyond calculated bounds
  const svgWidth = Math.max(sanitizedWidth, rotatedWidth) * 1.1;
  const svgHeight = Math.max(sanitizedHeight, rotatedHeight) * 1.1;

  // Center the rotation in the larger SVG canvas
  const centerX = svgWidth / 2;
  const centerY = svgHeight / 2;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" style="overflow: visible;">
  <text
    x="${centerX}"
    y="${centerY}"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="${fontFamily}"
    font-size="${sanitizedFontSize}px"
    fill="${color}"
    opacity="${opacity}"
    transform="rotate(${sanitizedRotation} ${centerX} ${centerY})">${escapeXml(text)}</text>
</svg>`;

  return {
    dataUri: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    svgWidth,
    svgHeight,
  };
}

/**
 * Escape XML special characters.
 * @param {string} text
 * @returns {string}
 */
function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Parse VML inline style string into an object.
 * @param {string} style - VML style string (e.g., "width:100pt;height:50pt;margin-left:10pt")
 * @returns {Object} Parsed style object
 */
function parseVmlStyle(style) {
  const result = {};
  if (!style) return result;

  const declarations = style.split(';').filter((s) => s.trim());
  for (const decl of declarations) {
    const colonIndex = decl.indexOf(':');
    if (colonIndex === -1) continue;

    const prop = decl.substring(0, colonIndex).trim();
    const value = decl.substring(colonIndex + 1).trim();

    if (prop && value) {
      result[prop] = value;
    }
  }
  return result;
}

/**
 * Convert CSS size value to pixels.
 * Handles pt, px, in, cm, mm units.
 * @param {string} value - CSS size value (e.g., "100pt", "50px")
 * @returns {number} Size in pixels
 */
function convertToPixels(value) {
  if (typeof value === 'number') return value;
  if (!value || typeof value !== 'string') return 0;

  const match = value.match(/^([\d.]+)([a-z%]+)?$/i);
  if (!match) return 0;

  const num = parseFloat(match[1]);
  const unit = match[2] || 'px';

  switch (unit.toLowerCase()) {
    case 'px':
      return num;
    case 'pt':
      return num * (96 / 72); // 1pt = 1/72 inch, 96 DPI
    case 'in':
      return num * 96;
    case 'cm':
      return num * (96 / 2.54);
    case 'mm':
      return num * (96 / 25.4);
    case 'pc':
      return num * 16; // 1pc = 12pt
    default:
      return num;
  }
}
