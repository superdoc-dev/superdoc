import { carbonCopy } from '@core/utilities/carbonCopy.js';

/**
 * Handles VML shape elements with v:imagedata (image watermarks).
 *
 * This handles the common watermark pattern where images are placed in headers using VML:
 * <w:pict>
 *   <v:shape>
 *     <v:imagedata r:id="rId1" />
 *   </v:shape>
 * </w:pict>
 *
 * @param {Object} options
 * @returns {Object|null}
 */
export function handleShapeImageWatermarkImport({ params, pict }) {
  const shape = pict.elements?.find((el) => el.name === 'v:shape');
  if (!shape) return null;

  const imagedata = shape.elements?.find((el) => el.name === 'v:imagedata');
  if (!imagedata) return null;

  const { docx, filename } = params;
  const shapeAttrs = shape.attributes || {};
  const imagedataAttrs = imagedata.attributes || {};

  // Extract relationship ID
  const rId = imagedataAttrs['r:id'];
  if (!rId) {
    console.warn('v:imagedata missing r:id attribute');
    return null;
  }

  // Resolve the relationship to get the image path
  const currentFile = filename || 'document.xml';
  let rels = docx[`word/_rels/${currentFile}.rels`];
  if (!rels) rels = docx[`word/_rels/document.xml.rels`];

  const relationships = rels?.elements?.find((el) => el.name === 'Relationships');
  const { elements } = relationships || [];
  const rel = elements?.find((el) => el.attributes['Id'] === rId);

  if (!rel) {
    console.warn(`Relationship not found for r:id="${rId}"`);
    return null;
  }

  const targetPath = rel.attributes['Target'];
  const normalizedPath = normalizeTargetPath(targetPath);

  // Parse VML style attribute to extract dimensions and positioning
  const style = shapeAttrs.style || '';
  const styleObj = parseVmlStyle(style);

  // Extract dimensions
  const width = styleObj.width || '100px';
  const height = styleObj.height || '100px';

  // Extract positioning
  const position = {
    type: styleObj.position || 'absolute',
    marginLeft: styleObj['margin-left'] || '0',
    marginTop: styleObj['margin-top'] || '0',
  };

  // Extract z-index (watermarks typically have negative z-index to appear behind content)
  const zIndex = styleObj['z-index'] ? parseInt(styleObj['z-index'], 10) : undefined;

  // Extract positioning attributes
  const hPosition = styleObj['mso-position-horizontal'] || 'center';
  const vPosition = styleObj['mso-position-vertical'] || 'center';
  const hRelativeTo = styleObj['mso-position-horizontal-relative'] || 'margin';
  const vRelativeTo = styleObj['mso-position-vertical-relative'] || 'margin';

  // Extract image adjustments (gain/blacklevel for brightness/contrast)
  const gain = imagedataAttrs['gain'];
  const blacklevel = imagedataAttrs['blacklevel'];
  const title = imagedataAttrs['o:title'] || 'Watermark';

  // Pass through any extra children of the pict element
  const passthroughElements = pict.elements.filter((el) => el !== shape);

  // Build the image node
  const imageNode = {
    type: 'image',
    attrs: {
      isPict: true,
      src: normalizedPath,
      alt: title,
      extension: normalizedPath.substring(normalizedPath.lastIndexOf('.') + 1),
      title,
      rId,
      // Store VML-specific attributes for round-trip
      vmlWatermark: true,
      vmlStyle: style,
      vmlAttributes: shapeAttrs,
      vmlImagedata: imagedataAttrs,
      // Positioning
      isAnchor: true,
      inline: false,
      wrap: {
        type: 'None',
        attrs: {
          behindDoc: Number.isFinite(zIndex) ? zIndex < 0 : true,
        },
      },
      anchorData: {
        hRelativeFrom: hRelativeTo,
        vRelativeFrom: vRelativeTo,
        alignH: hPosition,
        alignV: vPosition,
      },
      // Size
      size: {
        width: convertToPixels(width),
        height: convertToPixels(height),
      },
      marginOffset: {
        horizontal: convertToPixels(position.marginLeft),
        top: convertToPixels(position.marginTop),
      },
      // Image adjustments
      ...(gain && { gain }),
      ...(blacklevel && { blacklevel }),
    },
  };

  // Store passthrough siblings as an attribute (not content) because image is
  // a leaf node — PM would silently drop any content children.
  if (passthroughElements.length > 0) {
    imageNode.attrs.passthroughSiblings = passthroughElements.map((node) => carbonCopy(node));
  }

  return imageNode;
}

/**
 * Normalize a relationship target to a relative media path.
 * @param {string} targetPath
 * @returns {string}
 */
function normalizeTargetPath(targetPath = '') {
  if (!targetPath) return targetPath;
  const trimmed = targetPath.replace(/^\/+/, '');
  if (trimmed.startsWith('word/')) return trimmed;
  if (trimmed.startsWith('media/')) return `word/${trimmed}`;
  return `word/${trimmed}`;
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
    const [prop, value] = decl.split(':').map((s) => s.trim());
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
