import { parseSizeUnit } from '../utilities/index.js';
import { xml2js } from 'xml-js';

// CSS pixels per inch; used to convert between Word's inch-based measurements and DOM pixels.
const PIXELS_PER_INCH = 96;

function inchesToTwips(inches) {
  if (inches == null) return;
  if (typeof inches === 'string') inches = parseFloat(inches);
  return Math.round(Number(inches) * 1440);
}

function twipsToInches(twips) {
  if (twips == null) return;
  const value = Number(twips);
  if (Number.isNaN(value)) return;
  return value / 1440;
}

function twipsToPixels(twips) {
  if (twips == null) return;
  const inches = twipsToInches(twips);
  return inchesToPixels(inches);
}

function pixelsToTwips(pixels) {
  const inches = pixelsToInches(pixels);
  return inchesToTwips(inches);
}

function inchesToPixels(inches) {
  if (inches == null) return;
  const pixels = inches * PIXELS_PER_INCH;
  return Math.round(pixels * 1000) / 1000;
}

function pixelsToInches(pixels) {
  if (pixels == null) return;
  const inches = Number(pixels) / PIXELS_PER_INCH;
  return inches;
}

function twipsToLines(twips) {
  if (twips == null) return;
  return twips / 240;
}

function linesToTwips(lines) {
  if (lines == null) return;
  return lines * 240;
}

function halfPointToPixels(halfPoints) {
  if (halfPoints == null) return;
  return Math.round((halfPoints * PIXELS_PER_INCH) / 72);
}

function halfPointToPoints(halfPoints) {
  if (halfPoints == null) return;
  return Math.round(halfPoints) / 2;
}

function emuToPixels(emu) {
  if (emu == null) return;
  if (typeof emu === 'string') emu = parseFloat(emu);
  const pixels = (emu * PIXELS_PER_INCH) / 914400;
  return Math.round(pixels);
}

function pixelsToEmu(px) {
  if (px == null) return;
  if (typeof px === 'string') px = parseFloat(px);
  return Math.round(px * 9525);
}

function pixelsToHalfPoints(pixels) {
  if (pixels == null) return;
  return Math.round((pixels * 72) / PIXELS_PER_INCH);
}

function eighthPointsToPixels(eighthPoints) {
  if (eighthPoints == null) return;
  const points = parseFloat(eighthPoints) / 8;
  const pixels = points * 1.3333;
  return pixels;
}

function pointsToTwips(points) {
  if (points == null) return;
  return points * 20;
}

function pointsToLines(points) {
  if (points == null) return;
  return twipsToLines(pointsToTwips(points));
}

function pixelsToEightPoints(pixels) {
  if (pixels == null) return;
  return Math.round(pixels * 6);
}

function twipsToPt(twips) {
  if (twips == null) return;
  return twips / 20;
}

function ptToTwips(pt) {
  if (pt == null) return;
  return pt * 20;
}

function rotToDegrees(rot) {
  if (rot == null) return;
  return rot / 60000;
}

function degreesToRot(degrees) {
  if (degrees == null) return;
  return degrees * 60000;
}

function pixelsToPolygonUnits(pixels) {
  // TODO: Unclear what unit is used here. 1/96 seems to be correct for unscaled images.
  if (pixels == null) return;
  const pu = pixels * PIXELS_PER_INCH;
  // Word requires integer ST_Coordinate32 values; fractional values fail OOXML validation.
  // The previous rounding to 3 decimals produced fractional coordinates and broke anchors.
  return Math.round(pu);
}

function polygonUnitsToPixels(pu) {
  // TODO: Unclear what unit is used here. 1/96 seems to be correct for unscaled images.
  if (pu == null) return;
  const pixels = Number(pu) / PIXELS_PER_INCH;
  return Math.round(pixels * 1000) / 1000;
}

/**
 * Converts a DOCX polygon node to an array of pixel coordinates.
 * Automatically removes duplicate closing points that are the same as the starting point,
 * since polygons are assumed to be closed shapes.
 *
 * @param {Object} polygonNode - The polygon node from DOCX XML with wp:start and wp:lineTo elements
 * @returns {Array<[number, number]>|null} Array of [x, y] pixel coordinate pairs, or null if invalid input
 */
function polygonToObj(polygonNode) {
  if (!polygonNode) return null;
  const points = [];
  polygonNode.elements.forEach((element) => {
    if (['wp:start', 'wp:lineTo'].includes(element.name)) {
      const { x, y } = element.attributes;
      points.push([polygonUnitsToPixels(x), polygonUnitsToPixels(y)]);
    }
  });

  // Remove the last point if it's the same as the first point (closed polygon)
  if (points.length > 1) {
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    if (firstPoint[0] === lastPoint[0] && firstPoint[1] === lastPoint[1]) {
      points.pop();
    }
  }

  return points;
}

/**
 * Converts an array of pixel coordinates to a DOCX polygon node.
 * Automatically adds a closing wp:lineTo element that connects back to the starting point,
 * ensuring the polygon is properly closed in the DOCX format.
 *
 * @param {Array<[number, number]>} points - Array of [x, y] pixel coordinate pairs
 * @returns {Object|null} DOCX polygon node with wp:start and wp:lineTo elements, or null if invalid input
 */
function objToPolygon(points) {
  if (!points || !Array.isArray(points)) return null;
  const polygonNode = {
    name: 'wp:wrapPolygon',
    type: 'wp:wrapPolygon',
    attributes: {
      edited: '0',
    },
    elements: [],
  };
  points.forEach((point, index) => {
    const [x, y] = point;
    const tagName = index === 0 ? 'wp:start' : 'wp:lineTo';
    const pointNode = {
      name: tagName,
      type: tagName,
      attributes: {
        x: pixelsToPolygonUnits(x),
        y: pixelsToPolygonUnits(y),
      },
    };
    polygonNode.elements.push(pointNode);
  });

  // Add a lineTo back to the starting point to close the polygon
  if (points.length > 0) {
    const [startX, startY] = points[0];
    const closePointNode = {
      name: 'wp:lineTo',
      type: 'wp:lineTo',
      attributes: {
        x: pixelsToPolygonUnits(startX),
        y: pixelsToPolygonUnits(startY),
      },
    };
    polygonNode.elements.push(closePointNode);
  }

  return polygonNode;
}

/**
 * Get the export value for text indent
 * @param {string|number} indent - The text indent value to export
 * @returns {number} - The export value in twips
 */
const getTextIndentExportValue = (indent) => {
  const [value, unit] = parseSizeUnit(indent);
  const functionsMap = {
    pt: ptToTwips,
    in: inchesToTwips,
  };

  const exportValue = functionsMap[unit] ? functionsMap[unit](value) : pixelsToTwips(value);
  return exportValue;
};

const REMOTE_RESOURCE_PATTERN = /^https?:|^blob:|^file:/i;
const DATA_URI_PATTERN = /^data:/i;

const getArrayBufferFromUrl = async (input) => {
  if (input == null) {
    return new ArrayBuffer(0);
  }

  if (input instanceof ArrayBuffer) {
    return input;
  }

  if (ArrayBuffer.isView(input)) {
    const view = input;
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
  }

  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    return await input.arrayBuffer();
  }

  if (typeof input !== 'string') {
    throw new TypeError('Unsupported media input type');
  }

  const trimmed = input.trim();
  const shouldFetchRemote = REMOTE_RESOURCE_PATTERN.test(trimmed);
  const isDataUri = DATA_URI_PATTERN.test(trimmed);

  if (shouldFetchRemote) {
    if (typeof fetch !== 'function') {
      throw new Error(`Fetch API is not available to retrieve media: ${trimmed}`);
    }

    const response = await fetch(trimmed);
    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
    }

    return await response.arrayBuffer();
  }

  // If this is a data URI we need only the payload portion
  const base64Payload = isDataUri ? trimmed.split(',', 2)[1] : trimmed.replace(/\s/g, '');

  try {
    if (typeof globalThis.atob === 'function') {
      const binary = globalThis.atob(base64Payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    }
  } catch (err) {
    console.warn('atob failed, falling back to Buffer:', err);
  }

  const buf = Buffer.from(base64Payload, 'base64');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};

const getContentTypesFromXml = (contentTypesXml) => {
  try {
    const result = xml2js(contentTypesXml, { compact: false });
    const types = result?.elements?.[0]?.elements || [];
    return types
      .filter((el) => el?.name === 'Default')
      .map((el) => el.attributes?.Extension)
      .filter(Boolean);
  } catch (err) {
    console.warn('[super-editor] Failed to parse [Content_Types].xml', err);
    return [];
  }
};

/**
 * Resolves an OPC relationship target URI to its ZIP entry path.
 *
 * Implements URI resolution per:
 * - ECMA-376 Part 2: Open Packaging Conventions (OPC)
 *   https://www.ecma-international.org/publications-and-standards/standards/ecma-376/
 * - RFC 3986 Section 5: Reference Resolution
 *   https://datatracker.ietf.org/doc/html/rfc3986#section-5
 *
 * Path resolution rules:
 * - Absolute paths (starting with '/') resolve from the package root
 * - Relative paths resolve from the relationship file's parent directory (baseDir)
 * - Supports '..' and '.' path segments per RFC 3986 Section 5.2.4
 *
 * @param {string} target - The relationship target URI from the XML
 * @param {string} [baseDir='word'] - The base directory for relative path resolution
 * @returns {string|null} The resolved ZIP entry path, or null if target is empty/external
 *
 * @example
 * resolveOpcTargetPath('styles.xml', 'word')             // → 'word/styles.xml'
 * resolveOpcTargetPath('./styles.xml', 'word')           // → 'word/styles.xml'
 * resolveOpcTargetPath('/word/styles.xml', 'word')       // → 'word/styles.xml'
 * resolveOpcTargetPath('../customXml/item.xml', 'word')  // → 'customXml/item.xml'
 * resolveOpcTargetPath('media/image.png', 'word')        // → 'word/media/image.png'
 */
const resolveOpcTargetPath = (target, baseDir = 'word') => {
  if (!target) return null;

  // Skip external URLs
  if (target.includes('://')) return null;

  // Absolute path: resolve from package root
  if (target.startsWith('/')) {
    return target.slice(1);
  }

  // Relative path: merge with baseDir, remove dot segments per RFC 3986 Section 5.2.4
  const segments = `${baseDir}/${target}`.split('/');
  const resolved = [];

  for (const seg of segments) {
    if (seg === '..') {
      resolved.pop();
    } else if (seg !== '.' && seg !== '') {
      resolved.push(seg);
    }
  }

  return resolved.join('/');
};

const DOCX_HIGHLIGHT_KEYWORD_MAP = new Map([
  ['yellow', 'FFFF00'],
  ['green', '00FF00'],
  ['blue', '0000FF'],
  ['cyan', '00FFFF'],
  ['magenta', 'FF00FF'],
  ['red', 'FF0000'],
  ['darkYellow', '808000'],
  ['darkGreen', '008000'],
  ['darkBlue', '000080'],
  ['darkCyan', '008080'],
  ['darkMagenta', '800080'],
  ['darkGray', '808080'],
  ['darkRed', '800000'],
  ['lightGray', 'C0C0C0'],
  ['black', '000000'],
  ['white', 'FFFFFF'],
]);

const normalizeHexColor = (hex) => {
  if (!hex) return null;
  let value = hex.replace('#', '').trim();
  if (!value) return null;
  value = value.toUpperCase();
  if (value.length === 3)
    value = value
      .split('')
      .map((c) => c + c)
      .join('');
  if (value.length === 8) value = value.slice(0, 6);
  return value;
};

const getHexColorFromDocxSystem = (docxColor) => {
  const hex = DOCX_HIGHLIGHT_KEYWORD_MAP.get(docxColor);
  return hex ? `#${hex}` : null;
};

const getDocxHighlightKeywordFromHex = (hexColor) => {
  if (!hexColor) return null;
  if (DOCX_HIGHLIGHT_KEYWORD_MAP.has(hexColor)) return hexColor;
  const normalized = normalizeHexColor(hexColor);
  if (!normalized) return null;
  for (const [keyword, hex] of DOCX_HIGHLIGHT_KEYWORD_MAP.entries()) {
    if (hex === normalized) return keyword;
  }
  return null;
};

function isValidHexColor(color) {
  if (!color || typeof color !== 'string') return false;

  switch (color.length) {
    case 3:
      return /^[0-9A-F]{3}$/i.test(color);
    case 6:
      return /^[0-9A-F]{6}$/i.test(color);
    case 8:
      return /^[0-9A-F]{8}$/i.test(color);
    default:
      return false;
  }
}

const componentToHex = (val) => {
  const a = Number(val).toString(16);
  return a.length === 1 ? '0' + a : a;
};

const rgbToHex = (rgb) => {
  return '#' + rgb.match(/\d+/g).map(componentToHex).join('');
};

const DEFAULT_SHADING_FOREGROUND_COLOR = '#000000';

const hexToRgb = (hex) => {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
};

const clamp01 = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

const blendHexColors = (backgroundHex, foregroundHex, foregroundRatio) => {
  const background = hexToRgb(backgroundHex);
  const foreground = hexToRgb(foregroundHex);
  if (!background || !foreground) return null;
  const ratio = clamp01(foregroundRatio);

  const r = Math.round(background.r * (1 - ratio) + foreground.r * ratio);
  const g = Math.round(background.g * (1 - ratio) + foreground.g * ratio);
  const b = Math.round(background.b * (1 - ratio) + foreground.b * ratio);

  const toByte = (n) => n.toString(16).padStart(2, '0').toUpperCase();
  return `${toByte(r)}${toByte(g)}${toByte(b)}`;
};

const resolveShadingFillColor = (shading) => {
  if (!shading || typeof shading !== 'object') return null;

  const fill = normalizeHexColor(shading.fill);
  if (!fill) return null;

  const val = typeof shading.val === 'string' ? shading.val.trim().toLowerCase() : '';
  const pctMatch = val.match(/^pct(\d{1,3})$/);
  if (!pctMatch) return fill;

  const pct = Number.parseInt(pctMatch[1], 10);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return fill;

  const foreground = normalizeHexColor(shading.color) ?? DEFAULT_SHADING_FOREGROUND_COLOR;
  return blendHexColors(fill, foreground, pct / 100) ?? fill;
};

const getLineHeightValueString = (lineHeight, defaultUnit, lineRule = '', isObject = false) => {
  let [value, unit] = parseSizeUnit(lineHeight);
  if (Number.isNaN(value) || value === 0) return {};
  if (lineRule === 'atLeast' && value < 1) return {};
  // Prevent values less than 1 to avoid squashed text (unless using explicit units like pt)
  if (!unit && value < 1) {
    value = 1;
  }
  unit = unit ? unit : defaultUnit;
  return isObject ? { ['line-height']: `${value}${unit}` } : `line-height: ${value}${unit}`;
};

const deobfuscateFont = (arrayBuffer, guidHex) => {
  const dta = new Uint8Array(arrayBuffer);

  const guidStr = guidHex.replace(/[-{}]/g, '');
  if (guidStr.length !== 32) {
    console.error('Invalid GUID');
    return;
  }

  // Convert GUID hex string to byte array
  const guidBytes = new Uint8Array(16);
  for (let i = 0, j = 0; i < 32; i += 2, j++) {
    const hexByte = guidStr[i] + guidStr[i + 1];
    guidBytes[j] = parseInt(hexByte, 16);
  }

  // XOR the first 32 bytes using the reversed-index pattern
  for (let i = 0; i < 32; i++) {
    const gi = 15 - (i % 16); // guidBytes.length - (i % guidBytes.length) - 1
    dta[i] ^= guidBytes[gi];
  }

  return dta.buffer;
};

const hasSomeParentWithClass = (element, classname) => {
  if (element.className?.split(' ')?.indexOf(classname) >= 0) return true;
  return element.parentNode && hasSomeParentWithClass(element.parentNode, classname);
};

/**
 * @param {number | string} value Value (e.g. 5000 or "100%")
 * @param {"dxa" | "pct" | "nil" | "auto" | null} type Units: either "dxa" (or null/undefined) for absolute measurements in twips, "pct" for relative measurements (either as 1/50 of a percent, or as a percentage with a trailing "%"), "nil" (zero width, see 17.18.90 of ECMA-376-1:2016), or "auto" (
 *
 * @returns {string | null} CSS specification for size (e.g. `100%`, `25px`) or `null` if the type is `"auto"`
 */
function convertSizeToCSS(value, type) {
  /**
   * NOTE: 17.4.87 of ECMA-376-1:2016 states:
   *     If the value of the type attribute and the actual measurement
   *     specified by the w attribute are contradictory, the type specified by
   *     the type attribute shall be ignored.
   * so we may need to override `type` based on the `value.
   */
  if (typeof value === 'string' && value.endsWith('%')) {
    type = 'pct';
  }

  /**
   * From 17.4.87:
   *     If this attribute is omitted, then its value shall be assumed to be 0.
   */
  if (value === null || value === undefined) {
    value = 0;
  }

  switch (type) {
    case 'dxa':
    case null:
    case undefined:
      return `${twipsToPixels(value)}px`;

    case 'nil':
      return '0';

    case 'auto':
      return null;

    case 'pct':
      let percent;
      if (typeof value === 'number') {
        percent = value * 0.02;
      } else {
        if (value.endsWith('%')) {
          percent = parseFloat(value.slice(0, -1));
        } else {
          percent = parseFloat(value) * 0.02;
        }
      }

      return `${percent}%`;

    default:
      // TODO: confirm Word's behavior in cases of invalid `type`. Currently we fall back on "auto" behavior.
      return null;
  }
}

export {
  PIXELS_PER_INCH,
  inchesToTwips,
  twipsToInches,
  twipsToPixels,
  pixelsToTwips,
  pixelsToInches,
  pointsToLines,
  inchesToPixels,
  twipsToLines,
  linesToTwips,
  halfPointToPixels,
  emuToPixels,
  pixelsToEmu,
  pixelsToHalfPoints,
  halfPointToPoints,
  eighthPointsToPixels,
  pixelsToEightPoints,
  pointsToTwips,
  rotToDegrees,
  degreesToRot,
  objToPolygon,
  polygonToObj,
  getArrayBufferFromUrl,
  getContentTypesFromXml,
  getHexColorFromDocxSystem,
  getDocxHighlightKeywordFromHex,
  normalizeHexColor,
  isValidHexColor,
  rgbToHex,
  ptToTwips,
  twipsToPt,
  getLineHeightValueString,
  deobfuscateFont,
  hasSomeParentWithClass,
  getTextIndentExportValue,
  polygonUnitsToPixels,
  pixelsToPolygonUnits,
  convertSizeToCSS,
  resolveShadingFillColor,
  resolveOpcTargetPath,
};
