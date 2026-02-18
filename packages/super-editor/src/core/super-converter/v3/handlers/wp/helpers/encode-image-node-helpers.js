import { emuToPixels, rotToDegrees, polygonToObj } from '@converter/helpers.js';
import { carbonCopy } from '@core/utilities/carbonCopy.js';
import { extractStrokeWidth, extractStrokeColor, extractFillColor, extractLineEnds } from './vector-shape-helpers';
import { convertMetafileToSvg, isMetafileExtension, setMetafileDomEnvironment } from './metafile-converter.js';
import {
  collectTextBoxParagraphs,
  preProcessTextBoxContent,
  resolveParagraphPropertiesForTextBox,
  extractRunFormatting,
  extractParagraphAlignment,
  extractBodyPrProperties,
} from './textbox-content-helpers.js';

const DRAWING_XML_TAG = 'w:drawing';
const SHAPE_URI = 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape';
const GROUP_URI = 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup';

/**
 * Normalize a relationship target to a relative media path.
 * Strips leading slashes and collapses duplicated "word/" prefixes so lookups
 * match the media keys we store (e.g., "word/media/image.png").
 */
const normalizeTargetPath = (targetPath = '') => {
  if (!targetPath) return targetPath;
  const trimmed = targetPath.replace(/^\/+/, ''); // remove leading slash(es)
  if (trimmed.startsWith('word/')) return trimmed;
  if (trimmed.startsWith('media/')) return `word/${trimmed}`;
  return `word/${trimmed}`;
};

/**
 * Default dimensions for vector shapes when size is not specified.
 * These values provide reasonable fallback dimensions while maintaining a square aspect ratio.
 */
const DEFAULT_SHAPE_WIDTH = 100;
const DEFAULT_SHAPE_HEIGHT = 100;

const isDocPrHidden = (docPr) => {
  const hidden = docPr?.attributes?.hidden;
  if (hidden === true || hidden === 1) return true;
  if (hidden == null) return false;
  const normalized = String(hidden).toLowerCase();
  return normalized === '1' || normalized === 'true';
};

/**
 * Extracts effect extent values from a drawing element.
 *
 * Effect extents define additional space around a shape for effects like shadows
 * or arrowheads. Values are converted from EMU to pixels.
 *
 * @param {Object} node - The drawing element node (wp:anchor or wp:inline)
 * @returns {{ left: number, top: number, right: number, bottom: number }|null}
 *   Effect extent object with pixel values, or null if not present or all zeros
 */
const extractEffectExtent = (node) => {
  const effectExtent = node?.elements?.find((el) => el.name === 'wp:effectExtent');
  if (!effectExtent?.attributes) return null;

  const sanitizeEmuValue = (value) => {
    if (value === null || value === undefined) return 0;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const left = emuToPixels(sanitizeEmuValue(effectExtent.attributes?.['l']));
  const top = emuToPixels(sanitizeEmuValue(effectExtent.attributes?.['t']));
  const right = emuToPixels(sanitizeEmuValue(effectExtent.attributes?.['r']));
  const bottom = emuToPixels(sanitizeEmuValue(effectExtent.attributes?.['b']));

  if (!left && !top && !right && !bottom) return null;
  return { left, top, right, bottom };
};

const buildClipPathFromSrcRect = (srcRectAttrs = {}) => {
  const edges = {
    left: srcRectAttrs.l,
    top: srcRectAttrs.t,
    right: srcRectAttrs.r,
    bottom: srcRectAttrs.b,
  };

  let hasValue = false;
  let hasPositive = false;
  const percentEdges = {};

  for (const [edge, value] of Object.entries(edges)) {
    if (value == null) continue;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    hasValue = true;
    if (numeric < 0) {
      return null;
    }
    const percent = Math.max(0, Math.min(100, numeric / 1000));
    if (percent > 0) hasPositive = true;
    percentEdges[edge] = percent;
  }

  if (!hasValue || !hasPositive) return null;

  const top = percentEdges.top ?? 0;
  const right = percentEdges.right ?? 0;
  const bottom = percentEdges.bottom ?? 0;
  const left = percentEdges.left ?? 0;

  return `inset(${top}% ${right}% ${bottom}% ${left}%)`;
};

/**
 * Encodes image XML into Editor node.
 *
 * Parses WordprocessingML drawing elements (wp:anchor or wp:inline) and converts them
 * into editor-compatible image, vectorShape, or shapeGroup nodes.
 *
 * @param {Object} node - The wp:anchor or wp:inline XML node
 * @param {{ docx: Object, filename?: string }} params - Parameters containing the document context and relationships
 * @param {boolean} isAnchor - Whether the image is anchored (true) or inline (false)
 * @returns {{ type: string, attrs: Object }|null} An editor node (image, vectorShape, shapeGroup, or contentBlock) or null if parsing fails
 */
export function handleImageNode(node, params, isAnchor) {
  if (!node) return null;
  const { docx, filename, converter } = params;
  const attributes = node?.attributes || {};
  const { order, originalChildren } = collectPreservedDrawingChildren(node);

  const padding = {
    top: emuToPixels(attributes?.['distT']),
    bottom: emuToPixels(attributes?.['distB']),
    left: emuToPixels(attributes?.['distL']),
    right: emuToPixels(attributes?.['distR']),
  };

  const extent = node?.elements?.find((el) => el.name === 'wp:extent');
  const size = {
    width: emuToPixels(extent?.attributes?.cx),
    height: emuToPixels(extent?.attributes?.cy),
  };

  let transformData = {};
  const effectExtent = node?.elements?.find((el) => el.name === 'wp:effectExtent');
  if (effectExtent) {
    const sanitizeEmuValue = (value) => {
      if (value === null || value === undefined) return 0;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : 0;
    };

    transformData.sizeExtension = {
      left: emuToPixels(sanitizeEmuValue(effectExtent.attributes?.['l'])),
      top: emuToPixels(sanitizeEmuValue(effectExtent.attributes?.['t'])),
      right: emuToPixels(sanitizeEmuValue(effectExtent.attributes?.['r'])),
      bottom: emuToPixels(sanitizeEmuValue(effectExtent.attributes?.['b'])),
    };
  }

  const positionHTag = node?.elements?.find((el) => el.name === 'wp:positionH');
  const positionH = positionHTag?.elements?.find((el) => el.name === 'wp:posOffset');
  const positionHValue = emuToPixels(positionH?.elements[0]?.text);
  const hRelativeFrom = positionHTag?.attributes?.relativeFrom;
  const alignH = positionHTag?.elements?.find((el) => el.name === 'wp:align')?.elements?.[0]?.text;

  const positionVTag = node?.elements?.find((el) => el.name === 'wp:positionV');
  const positionV = positionVTag?.elements?.find((el) => el.name === 'wp:posOffset');
  const positionVValue = emuToPixels(positionV?.elements[0]?.text);
  const vRelativeFrom = positionVTag?.attributes?.relativeFrom;
  const alignV = positionVTag?.elements?.find((el) => el.name === 'wp:align')?.elements?.[0]?.text;

  const marginOffset = {
    horizontal: positionHValue,
    top: positionVValue,
  };

  // Capture wp:simplePos node for round-tripping; only use it for positioning when simplePos is enabled.
  const useSimplePos =
    attributes['simplePos'] === '1' || attributes['simplePos'] === 1 || attributes['simplePos'] === true;
  const simplePosNode = node?.elements?.find((el) => el.name === 'wp:simplePos');

  // Look for one of <wp:wrapNone>,<wp:wrapSquare>,<wp:wrapThrough>,<wp:wrapTight>,<wp:wrapTopAndBottom>
  const wrapNode = isAnchor
    ? node?.elements?.find((el) =>
        ['wp:wrapNone', 'wp:wrapSquare', 'wp:wrapThrough', 'wp:wrapTight', 'wp:wrapTopAndBottom'].includes(el.name),
      )
    : null;
  const wrap = isAnchor ? { type: wrapNode?.name.slice(7) || 'None', attrs: {} } : { type: 'Inline' };

  switch (wrap.type) {
    case 'Square':
      if (wrapNode?.attributes?.wrapText) {
        wrap.attrs.wrapText = wrapNode.attributes.wrapText;
      }
      if ('distB' in (wrapNode?.attributes || {})) {
        wrap.attrs.distBottom = emuToPixels(wrapNode.attributes.distB);
      }
      if ('distL' in (wrapNode?.attributes || {})) {
        wrap.attrs.distLeft = emuToPixels(wrapNode.attributes.distL);
      }
      if ('distR' in (wrapNode?.attributes || {})) {
        wrap.attrs.distRight = emuToPixels(wrapNode.attributes.distR);
      }
      if ('distT' in (wrapNode?.attributes || {})) {
        wrap.attrs.distTop = emuToPixels(wrapNode.attributes.distT);
      }
      break;
    case 'Tight':
    case 'Through': {
      if ('distL' in (wrapNode?.attributes || {})) {
        wrap.attrs.distLeft = emuToPixels(wrapNode.attributes.distL);
      }
      if ('distR' in (wrapNode?.attributes || {})) {
        wrap.attrs.distRight = emuToPixels(wrapNode.attributes.distR);
      }
      if ('distT' in (wrapNode?.attributes || {})) {
        wrap.attrs.distTop = emuToPixels(wrapNode.attributes.distT);
      }
      if ('distB' in (wrapNode?.attributes || {})) {
        wrap.attrs.distBottom = emuToPixels(wrapNode.attributes.distB);
      }
      if ('wrapText' in (wrapNode?.attributes || {})) {
        wrap.attrs.wrapText = wrapNode.attributes.wrapText;
      }
      const polygon = wrapNode?.elements?.find((el) => el.name === 'wp:wrapPolygon');
      if (polygon) {
        wrap.attrs.polygon = polygonToObj(polygon);
        if (polygon.attributes?.edited !== undefined) {
          wrap.attrs.polygonEdited = polygon.attributes.edited;
        }
      }
      break;
    }
    case 'TopAndBottom':
      if ('distB' in (wrapNode?.attributes || {})) {
        wrap.attrs.distBottom = emuToPixels(wrapNode.attributes.distB);
      }
      if ('distT' in (wrapNode?.attributes || {})) {
        wrap.attrs.distTop = emuToPixels(wrapNode.attributes.distT);
      }
      break;
    case 'None':
      wrap.attrs.behindDoc = node.attributes?.behindDoc === '1';
      break;
    case 'Inline':
      break;
    default:
      break;
  }

  const docPr = node.elements.find((el) => el.name === 'wp:docPr');
  const isHidden = isDocPrHidden(docPr);

  let anchorData = null;
  if (hRelativeFrom || alignH || vRelativeFrom || alignV) {
    anchorData = {
      hRelativeFrom,
      vRelativeFrom,
      alignH,
      alignV,
    };
  }

  const graphic = node.elements.find((el) => el.name === 'a:graphic');
  const graphicData = graphic?.elements.find((el) => el.name === 'a:graphicData');
  const { uri } = graphicData?.attributes || {};
  if (!graphicData) {
    return null;
  }

  if (uri === SHAPE_URI) {
    const shapeMarginOffset = {
      left: positionHValue,
      horizontal: positionHValue,
      top: positionVValue,
    };
    return handleShapeDrawing(
      params,
      node,
      graphicData,
      size,
      padding,
      shapeMarginOffset,
      anchorData,
      wrap,
      isAnchor,
      isHidden,
    );
  }

  if (uri === GROUP_URI) {
    const shapeMarginOffset = {
      left: positionHValue,
      horizontal: positionHValue,
      top: positionVValue,
    };
    return handleShapeGroup(params, node, graphicData, size, padding, shapeMarginOffset, anchorData, wrap, isHidden);
  }

  const picture = graphicData?.elements.find((el) => el.name === 'pic:pic');
  if (!picture || !picture.elements) {
    return null;
  }

  const blipFill = picture.elements.find((el) => el.name === 'pic:blipFill');
  const blip = blipFill?.elements.find((el) => el.name === 'a:blip');
  if (!blip) {
    return null;
  }

  // Check for stretch mode: <a:stretch><a:fillRect/></a:stretch>
  // This tells Word to scale the image to fill the extent rectangle.
  //
  // srcRect behavior:
  // - Positive values (e.g., r="84800"): actual cropping that Word applies to the source image
  // - Negative values (e.g., b="-3978"): Word extended the mapping (image doesn't need clipping)
  // - Empty/no srcRect: no pre-adjustment, use cover+clip for aspect ratio mismatch
  //
  // Skip cover mode when srcRect already emitted explicit clipping or when srcRect has
  // negative values (Word already adjusted the mapping).
  const stretch = blipFill?.elements?.find((el) => el.name === 'a:stretch');
  const fillRect = stretch?.elements?.find((el) => el.name === 'a:fillRect');
  const srcRect = blipFill?.elements?.find((el) => el.name === 'a:srcRect');
  const srcRectAttrs = srcRect?.attributes || {};
  const clipPath = buildClipPathFromSrcRect(srcRectAttrs);

  // Check if srcRect has negative values (indicating Word extended/adjusted the image mapping)
  const srcRectHasNegativeValues = ['l', 't', 'r', 'b'].some((attr) => {
    const val = srcRectAttrs[attr];
    return val != null && parseFloat(val) < 0;
  });

  const shouldStretch = Boolean(stretch && fillRect);
  // Use cover mode when stretching, unless srcRect already produced an explicit clipPath
  // or srcRect has negative values (Word already adjusted mapping).
  const shouldCover = shouldStretch && !srcRectHasNegativeValues && !clipPath;

  const spPr = picture.elements.find((el) => el.name === 'pic:spPr');
  if (spPr) {
    const xfrm = spPr.elements.find((el) => el.name === 'a:xfrm');
    if (xfrm?.attributes) {
      transformData = {
        ...transformData,
        rotation: rotToDegrees(xfrm.attributes['rot']),
        verticalFlip: xfrm.attributes['flipV'] === '1',
        horizontalFlip: xfrm.attributes['flipH'] === '1',
      };
    }
  }

  const { attributes: blipAttributes = {} } = blip;
  const rEmbed = blipAttributes['r:embed'];
  if (!rEmbed) {
    return null;
  }

  const currentFile = filename || 'document.xml';
  let rels = docx[`word/_rels/${currentFile}.rels`];
  if (!rels) rels = docx[`word/_rels/document.xml.rels`];

  const relationships = rels?.elements.find((el) => el.name === 'Relationships');
  const { elements } = relationships || [];

  const rel = elements?.find((el) => el.attributes['Id'] === rEmbed);
  if (!rel) {
    return null;
  }

  const { attributes: relAttributes } = rel;
  const targetPath = relAttributes['Target'];

  const path = normalizeTargetPath(targetPath);
  const extension = path.substring(path.lastIndexOf('.') + 1);

  // Convert EMF/WMF metafiles to SVG for display
  let finalSrc = path;
  let finalExtension = extension;
  let wasConverted = false;

  if (isMetafileExtension(extension)) {
    // Get the media data for this image path from converter.media
    // converter.media contains base64 data or data URIs depending on environment
    const mediaData = converter?.media?.[path];

    if (mediaData) {
      if (converter?.domEnvironment) {
        setMetafileDomEnvironment(converter.domEnvironment);
      }
      // Convert EMF/WMF metafile to SVG. Returns { dataUri, format } on success, null on failure.
      const conversionResult = convertMetafileToSvg(mediaData, extension, size);
      if (conversionResult?.dataUri) {
        finalSrc = conversionResult.dataUri;
        finalExtension = conversionResult.format || 'svg';
        wasConverted = true;
      }
    }
  }

  // For converted metafile images (EMF+/WMF+ placeholders), we want them to render
  // as block-level images, not inline. We use the original wrap type if available,
  // otherwise default to the original wrap settings.
  // NOTE: Setting wrap to undefined causes ProseMirror to use the default { type: 'Inline' },
  // which is not what we want for placeholder images that should maintain their original layout.
  const wrapValue = wrap;

  const nodeAttrs = {
    // originalXml: carbonCopy(node),
    src: finalSrc,
    alt:
      isMetafileExtension(extension) && !wasConverted
        ? 'Unable to render EMF/WMF image'
        : docPr?.attributes?.name || 'Image',
    extension: finalExtension,
    // Store original path and extension for potential round-tripping
    ...(wasConverted && { originalSrc: path, originalExtension: extension }),
    id: docPr?.attributes?.id || '',
    title: docPr?.attributes?.descr || 'Image',
    ...(isHidden ? { hidden: true } : {}),
    inline: true, // Always true; wrap.type controls actual layout behavior
    padding,
    marginOffset,
    size,
    anchorData,
    isAnchor,
    transformData,
    ...(useSimplePos && {
      simplePos: {
        x: simplePosNode.attributes?.x,
        y: simplePosNode.attributes?.y,
      },
    }),
    wrap: wrapValue,
    ...(wrap.type === 'Square' && wrap.attrs.wrapText
      ? {
          wrapText: wrap.attrs.wrapText,
        }
      : {}),
    wrapTopAndBottom: wrap.type === 'TopAndBottom',
    shouldCover,
    ...(clipPath ? { clipPath } : {}),
    rawSrcRect: srcRect,
    originalPadding: {
      distT: attributes['distT'],
      distB: attributes['distB'],
      distL: attributes['distL'],
      distR: attributes['distR'],
    },
    originalAttributes: node.attributes,
    rId: relAttributes['Id'],
    ...(order.length ? { drawingChildOrder: order } : {}),
    ...(originalChildren.length ? { originalDrawingChildren: originalChildren } : {}),
  };

  return {
    type: 'image',
    attrs: nodeAttrs,
  };
}

/**
 * Handles a shape drawing within a WordprocessingML graphic node.
 *
 * @param {{ nodes: Array<Object> }} params - Translator params including the surrounding drawing node.
 * @param {Object} node - The wp:anchor or wp:inline node containing the shape.
 * @param {Object} graphicData - The a:graphicData node containing the wps:wsp shape elements.
 * @param {{ width?: number, height?: number }} size - Shape bounding box in pixels (from wp:extent).
 * @param {{ top?: number, right?: number, bottom?: number, left?: number }} padding - Distance attributes converted to pixels.
 * @param {{ horizontal?: number, left?: number, top?: number }} marginOffset - Shape offsets relative to its anchor (in pixels).
 * @param {{ hRelativeFrom?: string, vRelativeFrom?: string, alignH?: string, alignV?: string }|null} anchorData - Anchor positioning data.
 * @param {{ type: string, attrs: Object }} wrap - Wrap configuration.
 * @param {boolean} isAnchor - Whether the shape is anchored (true) or inline (false).
 * @param {boolean} isHidden - Whether the drawing should be hidden.
 * @returns {{ type: string, attrs: Object }|null} A vectorShape or contentBlock node, or null when no content exists.
 */
const handleShapeDrawing = (
  params,
  node,
  graphicData,
  size,
  padding,
  marginOffset,
  anchorData,
  wrap,
  isAnchor,
  isHidden,
) => {
  const wsp = graphicData.elements.find((el) => el.name === 'wps:wsp');
  const textBox = wsp.elements.find((el) => el.name === 'wps:txbx');
  const textBoxContent = textBox?.elements?.find((el) => el.name === 'w:txbxContent');

  const spPr = wsp.elements.find((el) => el.name === 'wps:spPr');
  const prstGeom = spPr?.elements.find((el) => el.name === 'a:prstGeom');
  const shapeType = prstGeom?.attributes['prst'];

  // For all other shapes (with or without text), or shapes with gradients, use the vector shape handler
  if (shapeType) {
    const result = getVectorShape({ params, node, graphicData, size, marginOffset, anchorData, wrap, isAnchor });
    if (result?.attrs && isHidden) {
      result.attrs.hidden = true;
    }
    if (result) return result;
  }

  // Fallback to placeholder if no shape type found
  const fallbackType = textBoxContent ? 'textbox' : 'drawing';
  const placeholder = buildShapePlaceholder(node, size, padding, marginOffset, fallbackType);
  if (placeholder?.attrs && isHidden) {
    placeholder.attrs.hidden = true;
  }
  return placeholder;
};

function collectPreservedDrawingChildren(node) {
  const order = [];
  const original = [];
  if (!Array.isArray(node?.elements)) {
    return { order, originalChildren: original };
  }
  node.elements.forEach((child, index) => {
    if (!child) return;
    const name = child.name ?? null;
    order.push(name);
    original.push({
      index,
      xml: carbonCopy(child),
    });
  });
  return { order, originalChildren: original };
}

/**
 * Handles a shape group (wpg:wgp) within a WordprocessingML graphic node.
 *
 * @param {{ nodes: Array<Object> }} params - Translator params including the surrounding drawing node.
 * @param {Object} node - The wp:anchor or wp:inline node containing the group.
 * @param {Object} graphicData - The a:graphicData node containing the wpg:wgp group elements.
 * @param {{ width?: number, height?: number }} size - Group bounding box in pixels (from wp:extent).
 * @param {{ top?: number, right?: number, bottom?: number, left?: number }} padding - Distance attributes converted to pixels.
 * @param {{ horizontal?: number, left?: number, top?: number }} marginOffset - Group offsets relative to its anchor (in pixels).
 * @param {{ hRelativeFrom?: string, vRelativeFrom?: string, alignH?: string, alignV?: string }|null} anchorData - Anchor positioning data.
 * @param {{ type: string, attrs: Object }} wrap - Wrap configuration.
 * @param {boolean} isHidden - Whether the drawing should be hidden.
 * @returns {{ type: 'shapeGroup', attrs: Object }|null} A shapeGroup node representing the group, or null when no content exists.
 */
const handleShapeGroup = (params, node, graphicData, size, padding, marginOffset, anchorData, wrap, isHidden) => {
  const wgp = graphicData.elements.find((el) => el.name === 'wpg:wgp');
  if (!wgp) {
    const placeholder = buildShapePlaceholder(node, size, padding, marginOffset, 'group');
    if (placeholder?.attrs && isHidden) {
      placeholder.attrs.hidden = true;
    }
    return placeholder;
  }

  // Extract group properties
  const grpSpPr = wgp.elements.find((el) => el.name === 'wpg:grpSpPr');
  const xfrm = grpSpPr?.elements?.find((el) => el.name === 'a:xfrm');

  // Get group transform data
  const groupTransform = {};
  if (xfrm) {
    const off = xfrm.elements?.find((el) => el.name === 'a:off');
    const ext = xfrm.elements?.find((el) => el.name === 'a:ext');
    const chOff = xfrm.elements?.find((el) => el.name === 'a:chOff');
    const chExt = xfrm.elements?.find((el) => el.name === 'a:chExt');

    if (off) {
      groupTransform.x = emuToPixels(off.attributes?.['x'] || 0);
      groupTransform.y = emuToPixels(off.attributes?.['y'] || 0);
    }
    if (ext) {
      groupTransform.width = emuToPixels(ext.attributes?.['cx'] || 0);
      groupTransform.height = emuToPixels(ext.attributes?.['cy'] || 0);
    }
    if (chOff) {
      groupTransform.childX = emuToPixels(chOff.attributes?.['x'] || 0);
      groupTransform.childY = emuToPixels(chOff.attributes?.['y'] || 0);
      // Store raw EMU values for coordinate transformation
      groupTransform.childOriginXEmu = parseFloat(chOff.attributes?.['x'] || 0);
      groupTransform.childOriginYEmu = parseFloat(chOff.attributes?.['y'] || 0);
    }
    if (chExt) {
      groupTransform.childWidth = emuToPixels(chExt.attributes?.['cx'] || 0);
      groupTransform.childHeight = emuToPixels(chExt.attributes?.['cy'] || 0);
    }
  }

  // Extract all child shapes and pictures
  const childShapes = wgp.elements.filter((el) => el.name === 'wps:wsp');
  const childPictures = wgp.elements.filter((el) => el.name === 'pic:pic');

  // Process child shapes (wps:wsp)
  const shapes = childShapes
    .map((wsp) => {
      const spPr = wsp.elements?.find((el) => el.name === 'wps:spPr');
      if (!spPr) return null;

      // Extract shape kind
      const prstGeom = spPr.elements?.find((el) => el.name === 'a:prstGeom');
      const shapeKind = prstGeom?.attributes?.['prst'];

      // Extract size and transformations
      const shapeXfrm = spPr.elements?.find((el) => el.name === 'a:xfrm');
      const shapeOff = shapeXfrm?.elements?.find((el) => el.name === 'a:off');
      const shapeExt = shapeXfrm?.elements?.find((el) => el.name === 'a:ext');

      // Get raw child coordinates in EMU
      const rawX = shapeOff?.attributes?.['x'] ? parseFloat(shapeOff.attributes['x']) : 0;
      const rawY = shapeOff?.attributes?.['y'] ? parseFloat(shapeOff.attributes['y']) : 0;
      const rawWidth = shapeExt?.attributes?.['cx'] ? parseFloat(shapeExt.attributes['cx']) : 914400;
      const rawHeight = shapeExt?.attributes?.['cy'] ? parseFloat(shapeExt.attributes['cy']) : 914400;

      // Transform from child coordinate space to parent space if group transform exists
      let x, y, width, height;
      if (groupTransform.childWidth && groupTransform.childHeight) {
        // Calculate scale factors
        const scaleX = groupTransform.width / groupTransform.childWidth;
        const scaleY = groupTransform.height / groupTransform.childHeight;

        // Get child origin in EMU (default to 0 if not set)
        const childOriginX = groupTransform.childOriginXEmu || 0;
        const childOriginY = groupTransform.childOriginYEmu || 0;

        // Transform to parent space: ((childPos - childOrigin) * scale) + groupPos
        x = groupTransform.x + emuToPixels((rawX - childOriginX) * scaleX);
        y = groupTransform.y + emuToPixels((rawY - childOriginY) * scaleY);
        width = emuToPixels(rawWidth * scaleX);
        height = emuToPixels(rawHeight * scaleY);
      } else {
        // Fallback: no transformation
        x = emuToPixels(rawX);
        y = emuToPixels(rawY);
        width = emuToPixels(rawWidth);
        height = emuToPixels(rawHeight);
      }
      const rotation = shapeXfrm?.attributes?.['rot'] ? rotToDegrees(shapeXfrm.attributes['rot']) : 0;
      const flipH = shapeXfrm?.attributes?.['flipH'] === '1';
      const flipV = shapeXfrm?.attributes?.['flipV'] === '1';

      // Extract colors
      const style = wsp.elements?.find((el) => el.name === 'wps:style');
      const fillColor = extractFillColor(spPr, style);
      const strokeColor = extractStrokeColor(spPr, style);
      const strokeWidth = extractStrokeWidth(spPr);
      const lineEnds = extractLineEnds(spPr);

      // Get shape ID and name
      const cNvPr = wsp.elements?.find((el) => el.name === 'wps:cNvPr');
      const shapeId = cNvPr?.attributes?.['id'];
      const shapeName = cNvPr?.attributes?.['name'];

      // Extract textbox content if present
      const textBox = wsp.elements?.find((el) => el.name === 'wps:txbx');
      const textBoxContent = textBox?.elements?.find((el) => el.name === 'w:txbxContent');
      const bodyPr = wsp.elements?.find((el) => el.name === 'wps:bodyPr');
      let textContent = null;

      if (textBoxContent) {
        // Extract text from all paragraphs in the textbox
        textContent = extractTextFromTextBox(textBoxContent, bodyPr, params);
      }

      // Extract horizontal alignment from text content (defaults to 'left' if not specified)
      const textAlign = textContent?.horizontalAlign || 'left';

      return {
        shapeType: 'vectorShape',
        attrs: {
          kind: shapeKind,
          x,
          y,
          width,
          height,
          rotation,
          flipH,
          flipV,
          fillColor,
          strokeColor,
          strokeWidth,
          lineEnds,
          shapeId,
          shapeName,
          textContent,
          textAlign,
          textVerticalAlign: textContent?.verticalAlign,
          textInsets: textContent?.insets,
        },
      };
    })
    .filter(Boolean);

  // Process child pictures (pic:pic)
  const pictures = childPictures
    .map((pic) => {
      // Extract picture properties
      const spPr = pic.elements?.find((el) => el.name === 'pic:spPr');
      if (!spPr) return null;

      // Extract size and transformations
      const xfrm = spPr.elements?.find((el) => el.name === 'a:xfrm');
      const off = xfrm?.elements?.find((el) => el.name === 'a:off');
      const ext = xfrm?.elements?.find((el) => el.name === 'a:ext');

      // Get raw coordinates in EMU
      const rawX = off?.attributes?.['x'] ? parseFloat(off.attributes['x']) : 0;
      const rawY = off?.attributes?.['y'] ? parseFloat(off.attributes['y']) : 0;
      const rawWidth = ext?.attributes?.['cx'] ? parseFloat(ext.attributes['cx']) : 914400;
      const rawHeight = ext?.attributes?.['cy'] ? parseFloat(ext.attributes['cy']) : 914400;

      // Transform from child coordinate space to parent space if group transform exists
      let x, y, width, height;
      if (groupTransform.childWidth && groupTransform.childHeight) {
        const scaleX = groupTransform.width / groupTransform.childWidth;
        const scaleY = groupTransform.height / groupTransform.childHeight;
        const childOriginX = groupTransform.childOriginXEmu || 0;
        const childOriginY = groupTransform.childOriginYEmu || 0;

        x = groupTransform.x + emuToPixels((rawX - childOriginX) * scaleX);
        y = groupTransform.y + emuToPixels((rawY - childOriginY) * scaleY);
        width = emuToPixels(rawWidth * scaleX);
        height = emuToPixels(rawHeight * scaleY);
      } else {
        x = emuToPixels(rawX);
        y = emuToPixels(rawY);
        width = emuToPixels(rawWidth);
        height = emuToPixels(rawHeight);
      }

      // Extract image reference from blipFill
      const blipFill = pic.elements?.find((el) => el.name === 'pic:blipFill');
      const blip = blipFill?.elements?.find((el) => el.name === 'a:blip');
      if (!blip) return null;

      const rEmbed = blip.attributes?.['r:embed'];
      if (!rEmbed) return null;

      // Get the image path from relationships
      const currentFile = params.filename || 'document.xml';
      let rels = params.docx[`word/_rels/${currentFile}.rels`];
      if (!rels) rels = params.docx[`word/_rels/document.xml.rels`];

      const relationships = rels?.elements.find((el) => el.name === 'Relationships');
      const { elements } = relationships || [];
      const rel = elements?.find((el) => el.attributes['Id'] === rEmbed);
      if (!rel) return null;

      const targetPath = normalizeTargetPath(rel.attributes?.['Target']);
      const path = targetPath;

      // Extract picture name and ID
      const nvPicPr = pic.elements?.find((el) => el.name === 'pic:nvPicPr');
      const cNvPr = nvPicPr?.elements?.find((el) => el.name === 'pic:cNvPr');
      const picId = cNvPr?.attributes?.['id'];
      const picName = cNvPr?.attributes?.['name'];

      return {
        shapeType: 'image',
        attrs: {
          x,
          y,
          width,
          height,
          src: path,
          imageId: picId,
          imageName: picName,
        },
      };
    })
    .filter(Boolean);

  // Combine shapes and pictures - pictures first (bottom layer), then shapes (top layer)
  // In SVG, elements are rendered in order, so later elements appear on top
  const allShapes = [...pictures, ...shapes];

  const schemaAttrs = {};
  const drawingNode = params.nodes?.[0];
  if (drawingNode?.name === DRAWING_XML_TAG) {
    schemaAttrs.drawingContent = drawingNode;
  }

  const result = {
    type: 'shapeGroup',
    attrs: {
      ...schemaAttrs,
      ...(isHidden ? { hidden: true } : {}),
      groupTransform,
      shapes: allShapes,
      size,
      padding,
      marginOffset,
      anchorData,
      wrap,
      originalAttributes: node?.attributes,
    },
  };

  return result;
};

/**
 * Extracts text content from a textbox element.
 *
 * Parses w:txbxContent to extract text runs with formatting and paragraph alignment.
 * Handles the [[sdspace]] placeholder replacement for preserved spaces.
 * Inserts line break markers between paragraphs to preserve multi-line text layout.
 *
 * @param {Object} textBoxContent - The w:txbxContent element containing paragraphs and text runs
 * @param {Object} bodyPr - The wps:bodyPr element containing text box properties (vertical alignment, insets, wrap mode)
 * @param {{ docx?: Object, filename?: string }} params - Translator params for field preprocessing
 * @returns {{
 *   parts: Array<{
 *     text: string,
 *     formatting?: { bold?: boolean, italic?: boolean, color?: string, fontSize?: number, fontFamily?: string },
 *     fieldType?: 'PAGE' | 'NUMPAGES',
 *     isLineBreak?: boolean,
 *     isEmptyParagraph?: boolean
 *   }>,
 *   horizontalAlign: string,
 *   verticalAlign: string,
 *   insets: { top: number, right: number, bottom: number, left: number },
 *   wrap: string
 * }|null} Text content with formatting information and line break markers, or null if no text found
 */
function extractTextFromTextBox(textBoxContent, bodyPr, params = {}) {
  if (!textBoxContent || !textBoxContent.elements) return null;

  const processedContent = preProcessTextBoxContent(textBoxContent, params);
  const paragraphs = collectTextBoxParagraphs(processedContent?.elements || []);
  const textParts = [];
  let horizontalAlign = null;

  /**
   * Appends a field part (PAGE or NUMPAGES) to textParts with formatting.
   * @param {'PAGE' | 'NUMPAGES'} fieldType - The field type
   * @param {Object} node - The field node element
   * @param {Object} paragraphProperties - Resolved paragraph properties
   */
  const appendFieldPart = (fieldType, node, paragraphProperties) => {
    const rPr = node?.elements?.find((el) => el.name === 'w:rPr');
    const formatting = extractRunFormatting(rPr, paragraphProperties, params);
    textParts.push({ text: '', formatting, fieldType });
  };

  /**
   * Processes a single run element and extracts text parts.
   * @param {Object} run - The w:r run element
   * @param {Object} paragraphProperties - Resolved paragraph properties
   * @returns {boolean} True if the run contained any text content
   */
  const handleRun = (run, paragraphProperties) => {
    if (!run?.elements) return false;
    const rPr = run.elements.find((el) => el.name === 'w:rPr');
    const formatting = extractRunFormatting(rPr, paragraphProperties, params);
    let hasText = false;

    run.elements.forEach((el) => {
      if (el.name === 'w:t' || el.name === 'w:delText') {
        const textNode = el.elements?.find((n) => n.type === 'text');
        if (textNode) {
          hasText = true;
          const cleanedText =
            typeof textNode.text === 'string' ? textNode.text.replace(/\[\[sdspace\]\]/g, ' ') : textNode.text;
          textParts.push({ text: cleanedText, formatting });
        }
      } else if (el.name === 'w:tab') {
        hasText = true;
        textParts.push({ text: '\t', formatting });
      } else if (el.name === 'w:br') {
        hasText = true;
        textParts.push({ text: '\n', formatting: {}, isLineBreak: true });
      } else if (el.name === 'sd:autoPageNumber') {
        hasText = true;
        appendFieldPart('PAGE', el, paragraphProperties);
      } else if (el.name === 'sd:totalPageNumber') {
        hasText = true;
        appendFieldPart('NUMPAGES', el, paragraphProperties);
      }
    });

    return hasText;
  };

  /**
   * Recursively processes paragraph elements including nested hyperlinks.
   * @param {Object} el - The element to process
   * @param {Object} paragraphProperties - Resolved paragraph properties
   * @returns {boolean} True if any text content was found
   */
  const handleParagraphElement = (el, paragraphProperties) => {
    if (!el) return false;

    if (el.name === 'w:r') {
      return handleRun(el, paragraphProperties);
    }
    if (el.name === 'sd:autoPageNumber') {
      appendFieldPart('PAGE', el, paragraphProperties);
      return true;
    }
    if (el.name === 'sd:totalPageNumber') {
      appendFieldPart('NUMPAGES', el, paragraphProperties);
      return true;
    }
    if ((el.name === 'w:hyperlink' || el.name === 'sd:pageReference') && Array.isArray(el.elements)) {
      let hasText = false;
      el.elements.forEach((child) => {
        if (handleParagraphElement(child, paragraphProperties)) {
          hasText = true;
        }
      });
      return hasText;
    }
    return false;
  };

  // Process each paragraph
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const paragraphProperties = resolveParagraphPropertiesForTextBox(paragraph, params);

    // Extract horizontal alignment from first paragraph that has it
    if (!horizontalAlign) {
      horizontalAlign = extractParagraphAlignment(paragraph);
    }

    let paragraphHasText = false;
    const elements = paragraph.elements || [];

    elements.forEach((el) => {
      if (handleParagraphElement(el, paragraphProperties)) {
        paragraphHasText = true;
      }
    });

    // Add line break marker after each paragraph except the last one
    // Empty paragraphs (no text) create blank lines with extra spacing
    if (paragraphIndex < paragraphs.length - 1) {
      textParts.push({
        text: '\n',
        formatting: {},
        isLineBreak: true,
        isEmptyParagraph: !paragraphHasText,
      });
    }
  });

  if (textParts.length === 0) return null;

  // Extract body properties (vertical alignment, insets, wrap mode)
  const { verticalAlign, insets, wrap } = extractBodyPrProperties(bodyPr);

  return {
    parts: textParts,
    horizontalAlign: horizontalAlign || 'left',
    verticalAlign,
    insets,
    wrap,
  };
}

/**
 * Builds a contentBlock placeholder for shapes that we cannot fully translate yet.
 *
 * @param {Object} node - Original shape wp:anchor or wp:inline node to snapshot for round-tripping.
 * @param {{ width?: number, height?: number }} size - Calculated size of the shape in pixels (from wp:extent).
 * @param {{ top?: number, right?: number, bottom?: number, left?: number }} padding - Padding around the shape in pixels.
 * @param {{ horizontal?: number, left?: number, top?: number }} marginOffset - Offset of the anchored shape relative to its origin in pixels.
 * @param {'drawing'|'textbox'|'group'} shapeType - Identifier describing the kind of shape placeholder.
 * @returns {{ type: 'contentBlock', attrs: Object }} Placeholder node that retains the original XML.
 */
const buildShapePlaceholder = (node, size, padding, marginOffset, shapeType) => {
  const attrs = {
    drawingContent: {
      name: DRAWING_XML_TAG,
      elements: [carbonCopy(node)],
    },
    attributes: {
      'data-shape-type': shapeType,
    },
  };

  if (size && (Number.isFinite(size.width) || Number.isFinite(size.height))) {
    attrs.size = {
      ...(Number.isFinite(size.width) ? { width: size.width } : {}),
      ...(Number.isFinite(size.height) ? { height: size.height } : {}),
    };
  }

  if (padding) {
    const paddingData = {};
    if (Number.isFinite(padding.top)) paddingData['data-padding-top'] = padding.top;
    if (Number.isFinite(padding.right)) paddingData['data-padding-right'] = padding.right;
    if (Number.isFinite(padding.bottom)) paddingData['data-padding-bottom'] = padding.bottom;
    if (Number.isFinite(padding.left)) paddingData['data-padding-left'] = padding.left;
    if (Object.keys(paddingData).length) {
      attrs.attributes = {
        ...attrs.attributes,
        ...paddingData,
      };
    }
  }

  if (marginOffset) {
    const offsetData = {};
    const horizontal = Number.isFinite(marginOffset.horizontal)
      ? marginOffset.horizontal
      : Number.isFinite(marginOffset.left)
        ? marginOffset.left
        : undefined;
    if (Number.isFinite(horizontal)) offsetData['data-offset-x'] = horizontal;
    if (Number.isFinite(marginOffset.top)) offsetData['data-offset-y'] = marginOffset.top;
    if (Object.keys(offsetData).length) {
      attrs.attributes = {
        ...attrs.attributes,
        ...offsetData,
      };
    }
  }

  return {
    type: 'contentBlock',
    attrs,
  };
};

/**
 * Extracts vector shape data from OOXML drawing elements.
 *
 * Parses shape geometry, transformations, and styling information from WordprocessingML shape elements.
 * This function handles the critical distinction between two different dimension specifications in OOXML:
 *
 * 1. **wp:extent** (anchor extent): The final displayed size of the shape in the document.
 *    This is the authoritative size that Word displays the shape at, accounting for any
 *    resizing or scaling applied by the user.
 *
 * 2. **a:xfrm/a:ext** (intrinsic dimensions): The shape's internal coordinate space dimensions.
 *    These may differ from wp:extent when a shape has been resized non-uniformly.
 *    For example, a picture marker shape may have intrinsic dimensions of 571500x161926 EMU (rectangular)
 *    but be displayed at 150x150 pixels (square) as specified by wp:extent.
 *
 * **Why wp:extent is required:**
 * Using a:xfrm/a:ext for dimensions would cause visual distortion because it doesn't account for
 * how Word actually displays the shape. The wp:extent is the only reliable source for the final
 * display dimensions. When combined with `preserveAspectRatio="none"` in SVG rendering, this
 * allows us to match Word's exact rendering behavior for non-uniformly scaled shapes.
 *
 * @param {Object} options - Configuration object
 * @param {{ nodes: Array<Object> }} options.params - Translator params containing the drawing node context
 * @param {Object} options.node - The anchor/inline node (wp:anchor or wp:inline) containing wp:extent
 * @param {Object} options.graphicData - The a:graphicData node containing wps:wsp shape elements
 * @param {{ width?: number, height?: number }} options.size - Shape size from wp:extent (required, already converted to pixels).
 *                                                              This represents the final displayed dimensions.
 * @param {{ horizontal?: number, left?: number, top?: number }} options.marginOffset - Positioning offsets for anchored shapes (in pixels)
 * @param {{ hRelativeFrom?: string, vRelativeFrom?: string, alignH?: string, alignV?: string }|null} options.anchorData - Anchor positioning data
 * @param {{ type: string, attrs: Object }} options.wrap - Text wrapping configuration
 * @param {boolean} options.isAnchor - Whether the shape is anchored (true) or inline (false)
 *
 * @returns {{ type: 'vectorShape', attrs: Object }|null} A vectorShape node with extracted attributes, or null if parsing fails
 *
 * @example
 * // Extract a vector shape from OOXML
 * const result = getVectorShape({
 *   params: { nodes: [drawingNode] },
 *   node: anchorNode,
 *   graphicData: graphicDataNode,
 *   size: { width: 150, height: 150 }, // From wp:extent, already in pixels
 *   marginOffset: { horizontal: 10, top: 20 },
 *   anchorData: { hRelativeFrom: 'column', vRelativeFrom: 'paragraph' },
 *   wrap: { type: 'Square', attrs: {} },
 *   isAnchor: true
 * });
 * // Returns:
 * // {
 * //   type: 'vectorShape',
 * //   attrs: {
 * //     kind: 'ellipse',
 * //     width: 150,
 * //     height: 150,
 * //     rotation: 0,
 * //     flipH: false,
 * //     flipV: false,
 * //     fillColor: '#70ad47',
 * //     strokeColor: '#000000',
 * //     strokeWidth: 1,
 * //     ...
 * //   }
 * // }
 */
export function getVectorShape({ params, node, graphicData, size, marginOffset, anchorData, wrap, isAnchor }) {
  const schemaAttrs = {};

  const drawingNode = params.nodes?.[0];
  if (drawingNode?.name === 'w:drawing') {
    schemaAttrs.drawingContent = drawingNode;
  }

  const wsp = graphicData.elements?.find((el) => el.name === 'wps:wsp');
  if (!wsp) {
    return null;
  }

  const spPr = wsp.elements?.find((el) => el.name === 'wps:spPr');
  if (!spPr) {
    return null;
  }

  // Extract shape kind
  const prstGeom = spPr.elements?.find((el) => el.name === 'a:prstGeom');
  const shapeKind = prstGeom?.attributes?.['prst'];
  if (!shapeKind) {
    console.warn('Shape kind not found');
  }
  schemaAttrs.kind = shapeKind;

  // Use wp:extent for dimensions (final displayed size from anchor)
  // This is the correct size that Word displays the shape at
  const width = size?.width ?? DEFAULT_SHAPE_WIDTH;
  const height = size?.height ?? DEFAULT_SHAPE_HEIGHT;

  // Extract transformations from a:xfrm (rotation and flips are still valid)
  const xfrm = spPr.elements?.find((el) => el.name === 'a:xfrm');
  const rotation = xfrm?.attributes?.['rot'] ? rotToDegrees(xfrm.attributes['rot']) : 0;
  const flipH = xfrm?.attributes?.['flipH'] === '1';
  const flipV = xfrm?.attributes?.['flipV'] === '1';

  // Extract colors
  const style = wsp.elements?.find((el) => el.name === 'wps:style');
  const fillColor = extractFillColor(spPr, style);
  const strokeColor = extractStrokeColor(spPr, style);
  const strokeWidth = extractStrokeWidth(spPr);
  const lineEnds = extractLineEnds(spPr);
  const effectExtent = extractEffectExtent(node);

  // Extract textbox content if present
  const textBox = wsp.elements?.find((el) => el.name === 'wps:txbx');
  const textBoxContent = textBox?.elements?.find((el) => el.name === 'w:txbxContent');
  const bodyPr = wsp.elements?.find((el) => el.name === 'wps:bodyPr');
  let textContent = null;
  let textAlign = 'left';

  if (textBoxContent) {
    textContent = extractTextFromTextBox(textBoxContent, bodyPr, params);
    textAlign = textContent?.horizontalAlign || 'left';
  }

  return {
    type: 'vectorShape',
    attrs: {
      ...schemaAttrs,
      width,
      height,
      rotation,
      flipH,
      flipV,
      fillColor,
      strokeColor,
      strokeWidth,
      lineEnds,
      effectExtent,
      marginOffset,
      anchorData,
      wrap,
      isAnchor,
      textContent,
      textAlign,
      textVerticalAlign: textContent?.verticalAlign,
      textInsets: textContent?.insets,
      originalAttributes: node?.attributes,
    },
  };
}
