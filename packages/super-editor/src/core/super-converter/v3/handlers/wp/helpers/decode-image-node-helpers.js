import { emuToPixels, pixelsToEmu, degreesToRot } from '@converter/helpers.js';
import { getFallbackImageNameFromDataUri, sanitizeDocxMediaName } from '@converter/helpers/mediaHelpers.js';
import { prepareTextAnnotation } from '@converter/v3/handlers/w/sdt/helpers/translate-field-annotation.js';
import { wrapTextInRun } from '@converter/exporter.js';
import { generateDocxRandomId } from '@core/helpers/index.js';
import { readImageDimensionsFromDataUri } from '@converter/image-dimensions.js';

const DECORATIVE_EXT_URI = '{C183D7F6-B498-43B3-948B-1728B52AA6E4}';
const DECORATIVE_NAMESPACE = 'http://schemas.microsoft.com/office/drawing/2017/decorative';
const HYPERLINK_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink';

/**
 * Resolve the hyperlink relationship rId for an image, if applicable.
 * Called once so that both wp:docPr and pic:cNvPr share the same rId.
 */
function resolveHyperlinkRId(attrs, params) {
  if (!attrs.hyperlink?.url || !params) return null;
  return addHyperlinkRelationship(params, attrs.hyperlink.url);
}

/**
 * Build an `a:hlinkClick` element from attrs.hyperlink and a pre-resolved rId.
 */
function buildHlinkClickElement(attrs, hlinkRId) {
  if (!hlinkRId) return null;
  const hlinkAttrs = { 'r:id': hlinkRId };
  if (attrs.hyperlink?.tooltip) {
    hlinkAttrs.tooltip = attrs.hyperlink.tooltip;
  }
  return { name: 'a:hlinkClick', attributes: hlinkAttrs };
}

/**
 * Build the `wp:docPr` element with correct attribute mappings:
 * - `@name` ← attrs.alt (object name, wp:docPr/@name)
 * - `@descr` ← attrs.title (accessibility description, wp:docPr/@descr) — omitted when decorative
 * - `a:hlinkClick` child when hyperlink is set (Word's canonical placement per §20.4.2.5)
 * - Decorative extension child when attrs.decorative is true
 */
function buildDocPrElement(attrs, imageName, hlinkRId) {
  const docPrAttrs = {
    id: attrs.id || 0,
    name: attrs.alt || `Picture ${imageName}`,
  };
  // Emit descr (accessibility description) unless decorative
  if (!attrs.decorative && attrs.title) {
    docPrAttrs.descr = attrs.title;
  }

  const children = [];

  // Emit a:hlinkClick in wp:docPr — Word's canonical placement (§20.4.2.5).
  const hlinkEl = buildHlinkClickElement(attrs, hlinkRId);
  if (hlinkEl) children.push(hlinkEl);

  if (attrs.decorative) {
    children.push({
      name: 'a:extLst',
      elements: [
        {
          name: 'a:ext',
          attributes: { uri: DECORATIVE_EXT_URI },
          elements: [
            {
              name: 'adec:decorative',
              attributes: { 'xmlns:adec': DECORATIVE_NAMESPACE, val: '1' },
            },
          ],
        },
      ],
    });
  }

  return {
    name: 'wp:docPr',
    attributes: docPrAttrs,
    ...(children.length ? { elements: children } : {}),
  };
}

/**
 * Build the `pic:nvPicPr` element with:
 * - `pic:cNvPr/@name` ← attrs.alt (object name, mirrors wp:docPr/@name)
 * - `a:hlinkClick` child when hyperlink is set (mirrors wp:docPr for compatibility)
 * - `a:picLocks/@noChangeAspect` ← dynamic from attrs.lockAspectRatio
 */
function buildNvPicPrElement(attrs, imageName, hlinkRId) {
  // --- pic:cNvPr children (hyperlink) ---
  const cNvPrChildren = [];
  const hlinkEl = buildHlinkClickElement(attrs, hlinkRId);
  if (hlinkEl) cNvPrChildren.push(hlinkEl);

  return {
    name: 'pic:nvPicPr',
    elements: [
      {
        name: 'pic:cNvPr',
        attributes: {
          id: attrs.id || 0,
          name: attrs.alt || `Picture ${imageName}`,
        },
        ...(cNvPrChildren.length ? { elements: cNvPrChildren } : {}),
      },
      {
        name: 'pic:cNvPicPr',
        elements: [
          {
            name: 'a:picLocks',
            attributes: {
              // Per OOXML §20.1.2.2.31, noChangeAspect defaults to false (unlocked).
              // Only emit "1" when explicitly locked; omit when false/undefined to preserve round-trip fidelity.
              ...(attrs.lockAspectRatio ? { noChangeAspect: 1 } : {}),
              noChangeArrowheads: 1,
            },
          },
        ],
      },
    ],
  };
}

/**
 * Add a hyperlink relationship and return the rId.
 * Uses params.relationships (part-local) so that images in headers/footers
 * write to the correct .rels file, not always word/_rels/document.xml.rels.
 */
function addHyperlinkRelationship(params, url) {
  const newId = `rId${generateDocxRandomId(8)}`;
  if (!params.relationships || !Array.isArray(params.relationships)) {
    params.relationships = [];
  }
  params.relationships.push({
    type: 'element',
    name: 'Relationship',
    attributes: {
      Id: newId,
      Type: HYPERLINK_REL_TYPE,
      Target: url,
      TargetMode: 'External',
    },
  });
  return newId;
}

/**
 * Decodes image into export XML
 * @typedef {Object} ExportParams
 * @property {Object} node JSON node to translate (from PM schema)
 * @property {Object} bodyNode The stored body node to restore, if available
 * @property {Object[]} relationships The relationships to add to the document
 * @returns {Object} The XML representation.
 */

export const translateImageNode = (params) => {
  const {
    node: { attrs = {} },
    tableCell,
    imageSize,
  } = params;

  let imageId = attrs.rId;

  // Prefer originalSrc for round-trip fidelity (e.g., EMF/WMF files converted to SVG for display)
  const src = attrs.originalSrc || attrs.src || attrs.imageSrc;

  let imageName;
  if (params.node.type === 'image') {
    if (src?.startsWith('data:')) {
      imageName = getFallbackImageNameFromDataUri(src);
    } else {
      imageName = src?.split('/').pop();
    }
  } else {
    imageName = attrs.fieldId;
  }
  imageName = sanitizeDocxMediaName(imageName);

  // For fieldAnnotations without a recognizable MIME type, fall back to text
  // annotation before attempting size resolution (they have no image data).
  if (params.node.type === 'fieldAnnotation' && !imageId) {
    const type = src?.split(';')[0].split('/')[1];
    if (!type) {
      return prepareTextAnnotation(params);
    }
  }

  let size = resolveExportSize(attrs, imageSize, src);

  // Scale box size to match intrinsic PNG aspect ratio (legacy behavior).
  // Only applies to PNG data URIs — the old getPngDimensions only supported PNG.
  if (src?.startsWith('data:image/png')) {
    const intrinsicDims = readImageDimensionsFromDataUri(src);
    if (intrinsicDims) {
      const boxWidthPx = emuToPixels(size.w);
      const boxHeightPx = emuToPixels(size.h);
      const { scaledWidth, scaledHeight } = getScaledSize(
        intrinsicDims.width,
        intrinsicDims.height,
        boxWidthPx,
        boxHeightPx,
      );
      size = {
        w: pixelsToEmu(scaledWidth),
        h: pixelsToEmu(scaledHeight),
      };
    }
  }

  if (tableCell) {
    // Image inside tableCell
    const colwidthSum = tableCell.attrs.colwidth.reduce((acc, curr) => acc + curr, 0);
    const leftMargin = tableCell.attrs.cellMargins?.left || 8;
    const rightMargin = tableCell.attrs.cellMargins?.right || 8;
    const maxWidthEmu = pixelsToEmu(colwidthSum - (leftMargin + rightMargin));
    const { width: w, height: h } = resizeKeepAspectRatio(size.w, size.h, maxWidthEmu);
    if (w && h) size = { w, h };
  }

  if (imageId) {
    const docx = params.converter?.convertedXml || {};
    const rels = docx['word/_rels/document.xml.rels'];
    const relsTag = rels?.elements?.find((el) => el.name === 'Relationships');
    const hasRelation = relsTag?.elements.find((el) => el.attributes.Id === imageId);
    const path = src?.split('word/')[1];
    if (!hasRelation) {
      addImageRelationshipForId(params, imageId, path);
    }
  } else if (params.node.type === 'image' && !imageId) {
    const path = src?.split('word/')[1];
    imageId = addNewImageRelationship(params, path);
  } else if (params.node.type === 'fieldAnnotation' && !imageId) {
    // We already handled the no-type case above; here the type IS valid.
    const type = src?.split(';')[0].split('/')[1];

    const sanitizedHash = sanitizeDocxMediaName(attrs.hash, generateDocxRandomId(4));
    const fileName = `${imageName}_${sanitizedHash}.${type}`;
    const relationshipTarget = `media/${fileName}`;
    const packagePath = `word/${relationshipTarget}`;

    imageId = addNewImageRelationship(params, relationshipTarget);
    params.media[packagePath] = src;
  }

  const inlineAttrs = attrs.originalPadding || {
    distT: 0,
    distB: 0,
    distL: 0,
    distR: 0,
  };

  const xfrmAttrs = {};
  const effectExtentAttrs = {
    l: 0,
    t: 0,
    r: 0,
    b: 0,
  };
  const transformData = attrs.transformData;
  if (transformData) {
    if (transformData.rotation) {
      xfrmAttrs.rot = degreesToRot(transformData.rotation);
    }
    if (transformData.verticalFlip) {
      xfrmAttrs.flipV = '1';
    }
    if (transformData.horizontalFlip) {
      xfrmAttrs.flipH = '1';
    }
    if (transformData.sizeExtension) {
      effectExtentAttrs.l = pixelsToEmu(transformData.sizeExtension.left);
      effectExtentAttrs.t = pixelsToEmu(transformData.sizeExtension.top);
      effectExtentAttrs.r = pixelsToEmu(transformData.sizeExtension.right);
      effectExtentAttrs.b = pixelsToEmu(transformData.sizeExtension.bottom);
    }
  }

  const rawSrcRect = attrs.rawSrcRect;

  const drawingXmlns = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const pictureXmlns = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
  const blipEffects = [];
  if (attrs.grayscale) {
    blipEffects.push({ name: 'a:grayscl' });
  }
  if (attrs.lum && (Number.isFinite(attrs.lum.bright) || Number.isFinite(attrs.lum.contrast))) {
    blipEffects.push({
      name: 'a:lum',
      attributes: {
        ...(Number.isFinite(attrs.lum.bright) ? { bright: Math.round(attrs.lum.bright) } : {}),
        ...(Number.isFinite(attrs.lum.contrast) ? { contrast: Math.round(attrs.lum.contrast) } : {}),
      },
    });
  }

  // Resolve hyperlink relationship once; shared by wp:docPr and pic:cNvPr.
  const hlinkRId = resolveHyperlinkRId(attrs, params);

  return {
    attributes: inlineAttrs,
    elements: [
      {
        name: 'wp:extent',
        attributes: {
          cx: size.w,
          cy: size.h,
        },
      },
      {
        name: 'wp:effectExtent',
        attributes: effectExtentAttrs,
      },
      buildDocPrElement(attrs, imageName, hlinkRId),
      {
        name: 'wp:cNvGraphicFramePr',
        elements: [
          {
            name: 'a:graphicFrameLocks',
            attributes: {
              'xmlns:a': drawingXmlns,
              ...(attrs.lockAspectRatio ? { noChangeAspect: 1 } : {}),
            },
          },
        ],
      },
      {
        name: 'a:graphic',
        attributes: { 'xmlns:a': drawingXmlns },
        elements: [
          {
            name: 'a:graphicData',
            attributes: { uri: pictureXmlns },
            elements: [
              {
                name: 'pic:pic',
                attributes: { 'xmlns:pic': pictureXmlns },
                elements: [
                  buildNvPicPrElement(attrs, imageName, hlinkRId),
                  {
                    name: 'pic:blipFill',
                    elements: [
                      {
                        name: 'a:blip',
                        attributes: {
                          'r:embed': imageId,
                        },
                        ...(blipEffects.length ? { elements: blipEffects } : {}),
                      },
                      ...(rawSrcRect ? [rawSrcRect] : []),
                      {
                        name: 'a:stretch',
                        elements: [{ name: 'a:fillRect' }],
                      },
                    ],
                  },
                  {
                    name: 'pic:spPr',
                    attributes: {
                      bwMode: 'auto',
                    },
                    elements: [
                      {
                        name: 'a:xfrm',
                        attributes: xfrmAttrs,
                        elements: [
                          {
                            name: 'a:ext',
                            attributes: {
                              cx: size.w,
                              cy: size.h,
                            },
                          },
                          {
                            name: 'a:off',
                            attributes: {
                              x: 0,
                              y: 0,
                            },
                          },
                        ],
                      },
                      {
                        name: 'a:prstGeom',
                        attributes: { prst: 'rect' },
                        elements: [{ name: 'a:avLst' }],
                      },
                      {
                        name: 'a:noFill',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
};

function isFinitePositive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Resolve export size from available sources, with strict validation.
 *
 * Priority:
 * 1. attrs.size with valid finite positive dimensions
 * 2. imageSize fallback (from paragraph measure)
 * 3. Infer from data URI source bytes
 * 4. Legacy fallback: use attrs.size / imageSize as-is (may produce NaN — matches pre-hardening behavior)
 *
 * @returns {{ w: number, h: number }}
 */
function resolveExportSize(attrs, imageSize, src) {
  if (isFinitePositive(attrs.size?.width) && isFinitePositive(attrs.size?.height)) {
    return { w: pixelsToEmu(attrs.size.width), h: pixelsToEmu(attrs.size.height) };
  }
  if (isFinitePositive(imageSize?.w) && isFinitePositive(imageSize?.h)) {
    return imageSize;
  }
  if (src?.startsWith('data:')) {
    const dims = readImageDimensionsFromDataUri(src);
    if (dims) return { w: pixelsToEmu(dims.width), h: pixelsToEmu(dims.height) };
  }
  // Legacy fallback: preserve old behavior for callers that pass
  // non-validated imageSize or attrs.size (e.g., file-path images without
  // explicit dimensions).  The create.image path validates upstream.
  const raw = attrs.size
    ? { w: pixelsToEmu(attrs.size.width), h: pixelsToEmu(attrs.size.height) }
    : imageSize || { w: 0, h: 0 };

  // Clamp non-finite or non-positive values to 1 EMU so we never emit
  // NaN or zero in <wp:extent> / <a:ext> — both produce corrupt OOXML.
  return {
    w: isFinitePositive(raw.w) ? raw.w : 1,
    h: isFinitePositive(raw.h) ? raw.h : 1,
  };
}

function getScaledSize(originalWidth, originalHeight, maxWidth, maxHeight) {
  let scaledWidth = originalWidth;
  let scaledHeight = originalHeight;

  // Calculate aspect ratio
  let ratio = Math.min(maxWidth / originalWidth, maxHeight / originalHeight);

  // Scale dimensions
  scaledWidth = Math.round(scaledWidth * ratio);
  scaledHeight = Math.round(scaledHeight * ratio);

  return { scaledWidth, scaledHeight };
}

function resizeKeepAspectRatio(width, height, maxWidth) {
  if (width > maxWidth) {
    let scale = maxWidth / width;
    let newHeight = Math.round(height * scale);
    return { width: maxWidth, height: newHeight };
  }
  return { width, height };
}

/**
 * Create a new image relationship and add it to the relationships array
 *
 * @param {ExportParams} params
 * @param {string} imagePath The path to the image
 * @returns {string} The new relationship ID
 */
function addNewImageRelationship(params, imagePath) {
  const newId = 'rId' + generateDocxRandomId();
  const newRel = {
    type: 'element',
    name: 'Relationship',
    attributes: {
      Id: newId,
      Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
      Target: imagePath,
    },
  };
  params.relationships.push(newRel);
  return newId;
}

/**
 * Create a new image relationship for export from collaborator's editor
 *
 * @param {ExportParams} params
 * @param {string} id The new relationship ID
 * @param {string} imagePath The path to the image
 */
function addImageRelationshipForId(params, id, imagePath) {
  const newRel = {
    type: 'element',
    name: 'Relationship',
    attributes: {
      Id: id,
      Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
      Target: imagePath,
    },
  };
  params.relationships.push(newRel);
}

/**
 * Translates a vectorShape node back to XML.
 * @param {Object} params - Translation parameters
 * @returns {Object} XML node
 */
export function translateVectorShape(params) {
  const { node } = params;
  const { drawingContent } = node.attrs;

  const drawing = {
    name: 'w:drawing',
    elements: [...(drawingContent ? [...(drawingContent.elements || [])] : [])],
  };

  const choice = {
    name: 'mc:Choice',
    attributes: { Requires: 'wps' },
    elements: [drawing],
  };

  const alternateContent = {
    name: 'mc:AlternateContent',
    elements: [choice],
  };

  return wrapTextInRun(alternateContent);
}

/**
 * Translates a shapeGroup node back to XML.
 * @param {Object} params - Translation parameters
 * @returns {Object} XML node
 */
export function translateShapeGroup(params) {
  const { node } = params;
  const { drawingContent } = node.attrs;

  // If we have stored drawingContent, use it for round-tripping
  if (drawingContent) {
    const drawing = {
      name: 'w:drawing',
      elements: [...(drawingContent.elements || [])],
    };

    const choice = {
      name: 'mc:Choice',
      attributes: { Requires: 'wpg' },
      elements: [drawing],
    };

    const alternateContent = {
      name: 'mc:AlternateContent',
      elements: [choice],
    };

    return wrapTextInRun(alternateContent);
  }

  // If no stored content, we would need to reconstruct from shapes
  // For now, return a placeholder
  return wrapTextInRun({
    name: 'w:drawing',
    elements: [],
  });
}
