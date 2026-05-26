import { encodeUtf8Base64 } from '../../../../../../helpers/base64.js';

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
// Word positions centered, rotated VML WordArt below the shape's geometric center.
const ROTATED_CENTERED_WATERMARK_TOP_OFFSET_RATIO = 0.25;
// Guard against malformed VML height values when calculating the WordArt offset.
const MAX_ROTATED_CENTERED_WATERMARK_OFFSET_HEIGHT_PX = 10000;
const DEFAULT_VML_TEXT_WATERMARK_OPACITY = 1;
const DEFAULT_VML_TEXT_WATERMARK_ALIGNMENT = 'center';

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
  const explicitHPosition = styleObj['mso-position-horizontal'];
  const explicitVPosition = styleObj['mso-position-vertical'];
  const hasExplicitMarginLeft = styleObj['margin-left'] != null;
  const hasExplicitMarginTop = styleObj['margin-top'] != null;
  const hPosition = explicitHPosition || (hasExplicitMarginLeft ? undefined : DEFAULT_VML_TEXT_WATERMARK_ALIGNMENT);
  const vPosition = explicitVPosition || (hasExplicitMarginTop ? undefined : DEFAULT_VML_TEXT_WATERMARK_ALIGNMENT);
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
  const opacity = fillAttrs.opacity ?? String(DEFAULT_VML_TEXT_WATERMARK_OPACITY);
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
  const rawFontFamily = decodeXmlEntities(textStyleObj['font-family'] || '').replace(/['"]/g, '');
  const fontFamily = sanitizeFontFamily(rawFontFamily);
  const fontSize = textStyleObj['font-size'] || '1pt';

  // Extract other textpath attributes
  const fitshape = textpathAttrs.fitshape || 't';
  const shouldFitShape = fitshape === 't';
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
  const sanitizedOpacity = sanitizeNumeric(parseVmlOpacity(opacity), DEFAULT_VML_TEXT_WATERMARK_OPACITY, 0, 1);
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
    fitShape: shouldFitShape,
  });

  const svgDataUri = svgResult.dataUri;
  const centerOffsetTop = getTextWatermarkCenterOffset({
    hPosition,
    vPosition,
    hRelativeTo,
    vRelativeTo,
    height: heightPx,
    rotation: sanitizedRotation,
  });
  const marginOffset = resolveTextWatermarkMarginOffset({
    hPosition,
    vPosition,
    hRelativeTo,
    vRelativeTo,
    marginLeft: convertToPixels(position.marginLeft),
    marginTop: convertToPixels(position.marginTop),
    width: widthPx,
    height: heightPx,
    svgWidth: svgResult.svgWidth,
    svgHeight: svgResult.svgHeight,
    centerOffsetTop,
    rotation: sanitizedRotation,
  });

  const anchorData = {
    hRelativeFrom: hRelativeTo,
    vRelativeFrom: vRelativeTo,
  };
  if (hPosition) anchorData.alignH = hPosition;
  if (vPosition) anchorData.alignV = vPosition;

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
      anchorData,
      // Size - use rotated bounding box dimensions to prevent clipping
      size: {
        width: svgResult.svgWidth,
        height: svgResult.svgHeight,
      },
      marginOffset,
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
          fitshape: shouldFitShape,
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
  const sanitized = fontFamily.replace(/[^a-zA-Z0-9\s,-]/g, '').trim();
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

function normalizeVmlColor(color) {
  const namedColors = {
    black: '#000000',
    blue: '#0000FF',
    gray: '#808080',
    green: '#008000',
    lime: '#00FF00',
    red: '#FF0000',
    silver: '#C0C0C0',
    white: '#FFFFFF',
    yellow: '#FFFF00',
  };

  const key = typeof color === 'string' ? color.trim().toLowerCase() : '';
  return namedColors[key] || color;
}

function decodeXmlEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => decodeCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => decodeCodePoint(Number.parseInt(code, 16)));
}

function decodeCodePoint(codePoint) {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return '';
  }
  return String.fromCodePoint(codePoint);
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

function parseVmlOpacity(value) {
  if (typeof value === 'number') {
    return value;
  }
  if (!value || typeof value !== 'string') {
    return NaN;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.endsWith('%')) {
    return Number.parseFloat(normalized.slice(0, -1)) / 100;
  }
  if (normalized.endsWith('f')) {
    return Number.parseInt(normalized.slice(0, -1), 10) / 65536;
  }
  return Number.parseFloat(normalized);
}

function getTextWatermarkCenterOffset({ hPosition, vPosition, hRelativeTo, vRelativeTo, height, rotation }) {
  const isCenteredMarginWatermark =
    hPosition === 'center' && vPosition === 'center' && hRelativeTo === 'margin' && vRelativeTo === 'margin';
  if (!isCenteredMarginWatermark || rotation === 0) {
    return 0;
  }

  return (
    sanitizeNumeric(height, 0, 0, MAX_ROTATED_CENTERED_WATERMARK_OFFSET_HEIGHT_PX) *
    ROTATED_CENTERED_WATERMARK_TOP_OFFSET_RATIO
  );
}

function resolveTextWatermarkMarginOffset({
  hPosition,
  vPosition,
  hRelativeTo,
  vRelativeTo,
  marginLeft,
  marginTop,
  width,
  height,
  svgWidth,
  svgHeight,
  centerOffsetTop,
  rotation,
}) {
  const isCenteredHorizontally = hPosition === 'center' && hRelativeTo === 'margin';
  const isCenteredVertically = vPosition === 'center' && vRelativeTo === 'margin';

  return {
    // For explicitly centered margin watermarks, Word's margin values are not
    // browser offsets. Let layout center horizontally and apply only the known
    // rotated WordArt top correction vertically.
    horizontal: isCenteredHorizontally
      ? 0
      : getAbsoluteShapeOffset({
          position: hPosition,
          margin: marginLeft,
          shapeSize: width,
          svgSize: svgWidth,
          rotation,
        }),
    top: isCenteredVertically
      ? centerOffsetTop
      : getAbsoluteShapeOffset({
          position: vPosition,
          margin: marginTop,
          shapeSize: height,
          svgSize: svgHeight,
          rotation,
        }),
  };
}

function getAbsoluteShapeOffset({ position, margin, shapeSize, svgSize, rotation }) {
  if (position || rotation === 0) {
    return margin;
  }

  return margin + shapeSize / 2 - svgSize / 2;
}

/**
 * Generate an SVG data URI for a text watermark with rotation.
 * Rotation must be baked into the SVG since the layout engine doesn't support
 * rotation for image fragments (only drawing fragments).
 * @param {Object} options - Watermark options
 * @returns {Object} Object with dataUri, svgWidth, and svgHeight
 */
function generateTextWatermarkSVG({ text, width, height, rotation, fill, textStyle, fitShape }) {
  // Word watermarks don't use font-size literally - they scale text to fill available space
  // Word VML typically specifies font-size:1pt, but this is just a scaling hint
  // The actual rendered size depends on the watermark dimensions (width/height)

  let fontSize = height * 1.12;
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
  const color = normalizeVmlColor(sanitizeColor(fill?.color, 'silver'));
  const opacity = sanitizeNumeric(fill?.opacity, DEFAULT_VML_TEXT_WATERMARK_OPACITY, 0, 1);
  const fontFamily = resolveSvgFontFamily(sanitizeFontFamily(textStyle?.fontFamily));
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
  const textAttributes = [
    `x="${centerX}"`,
    `y="${centerY}"`,
    'text-anchor="middle"',
    'dominant-baseline="middle"',
    `font-family="${fontFamily}"`,
    `font-size="${sanitizedFontSize}px"`,
    ...(fitShape ? [`textLength="${sanitizedWidth}"`, 'lengthAdjust="spacingAndGlyphs"'] : []),
    `fill="${color}"`,
    `fill-opacity="${opacity}"`,
    `transform="rotate(${sanitizedRotation} ${centerX} ${centerY})"`,
  ]
    .map((attribute) => `    ${attribute}`)
    .join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" style="overflow: visible;">
    <text ${textAttributes}>${escapeXml(text)}</text>
  </svg>`;

  return {
    dataUri: `data:image/svg+xml;base64,${encodeUtf8Base64(svg)}`,
    svgWidth,
    svgHeight,
  };
}

function resolveSvgFontFamily(fontFamily) {
  if (!fontFamily || typeof fontFamily !== 'string') {
    return 'Arial, sans-serif';
  }

  const normalized = fontFamily.trim();
  if (normalized.includes(',')) {
    return normalized;
  }

  const serifFonts = new Set(['cambria', 'constantia', 'georgia', 'times new roman', 'times']);
  const generic = serifFonts.has(normalized.toLowerCase()) ? 'serif' : 'Arial, sans-serif';
  return `${normalized}, ${generic}`;
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

  const declarations = decodeXmlEntities(style)
    .split(';')
    .filter((s) => s.trim());
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
