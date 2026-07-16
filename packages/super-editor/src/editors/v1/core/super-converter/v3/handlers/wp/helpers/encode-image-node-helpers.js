import { v5 as uuidv5 } from 'uuid';
import { emuToPixels, rotToDegrees, polygonToObj } from '@converter/helpers.js';
import { carbonCopy } from '@core/utilities/carbonCopy.js';
import {
  extractStrokeWidth,
  extractStrokeColor,
  extractFillColor,
  extractLineEnds,
  extractCustomGeometry,
  extractShapeEffects,
} from './vector-shape-helpers';
import { convertMetafileToSvg, isMetafileExtension, setMetafileDomEnvironment } from './metafile-converter.js';
import { convertTiffToPng, isTiffExtension, setTiffDomEnvironment } from './tiff-converter.js';
import {
  collectTextBoxParagraphs,
  preProcessTextBoxContent,
  resolveParagraphPropertiesForTextBox,
  extractRunFormatting,
  extractParagraphAlignment,
  extractBodyPrProperties,
  extractTextBoxParagraphSpacing,
} from './textbox-content-helpers.js';
import { parseRelativeHeight } from './relative-height.js';
import { CHART_URI, resolveChartPart, parseChartXml } from './chart-helpers.js';
import { findChildByLocalName, someChildHasLocalName, hasLocalName, getLocalName } from './drawingml-utils.js';
import { importDrawingMLTextbox } from './import-drawingml-textbox.js';

const DRAWING_XML_TAG = 'w:drawing';
const SHAPE_URI = 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape';
const GROUP_URI = 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup';

/**
 * Namespace UUID for generating deterministic sdImageId values.
 * Images imported from DOCX derive their sdImageId from rEmbed + document-part
 * filename so the same image always receives the same ID across open cycles.
 */
const SD_IMAGE_ID_NAMESPACE = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

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

const extractAlphaModFix = (blip) => {
  const alphaModFix = findChildByLocalName(blip?.elements, 'alphaModFix');
  const amt = Number(alphaModFix?.attributes?.amt);
  return Number.isFinite(amt) ? { amt } : undefined;
};

const buildShapeClipPathFromPreset = (preset) => {
  if (preset === 'ellipse') return 'ellipse(50% 50% at 50% 50%)';
  return null;
};

const extractPicturePresentation = (picture) => {
  const blipFill = picture?.elements?.find((el) => el.name === 'pic:blipFill');
  const stretch = findChildByLocalName(blipFill?.elements, 'stretch');
  const fillRect = findChildByLocalName(stretch?.elements, 'fillRect');
  const srcRect = findChildByLocalName(blipFill?.elements, 'srcRect');
  const srcRectAttrs = srcRect?.attributes || {};
  const clipPath = buildClipPathFromSrcRect(srcRectAttrs);
  const srcRectHasNegativeValues = ['l', 't', 'r', 'b'].some((attr) => {
    const val = srcRectAttrs[attr];
    return val != null && parseFloat(val) < 0;
  });
  const spPr = picture?.elements?.find((el) => el.name === 'pic:spPr');
  const prstGeom = findChildByLocalName(spPr?.elements, 'prstGeom');
  const shapeClipPath = buildShapeClipPathFromPreset(prstGeom?.attributes?.['prst']);

  const shouldStretch = Boolean(stretch && fillRect);
  const shouldCover = shouldStretch && !srcRectHasNegativeValues && !clipPath;
  const shouldFillClippedStretch = shouldStretch && !srcRectHasNegativeValues && Boolean(clipPath);
  const shouldCoverShapeStretch = shouldStretch && Boolean(shapeClipPath) && !clipPath;

  return {
    clipPath,
    rawSrcRect: srcRect,
    shouldCover,
    shouldFillClippedStretch,
    shouldCoverShapeStretch,
    shapeClipPath,
  };
};

/**
 * Fill wrap.attrs distance fields from wp:anchor dist* when the wrap element omits them.
 * Only merges sides each wp:wrap* element may carry (ECMA-376 CT_WrapSquare / Tight / Through / TopBottom).
 *
 * @param {{ type: string, attrs: Record<string, unknown> }} wrap
 * @param {{ top?: number, right?: number, bottom?: number, left?: number }} padding
 */
const mergeAnchorPaddingIntoWrapDistances = (wrap, padding) => {
  if (!wrap?.attrs || !padding) return;
  const type = wrap.type;
  const mergeVertical = type === 'Square' || type === 'TopAndBottom';
  const mergeHorizontal = type === 'Square' || type === 'Tight' || type === 'Through';

  if (mergeVertical && wrap.attrs.distTop == null && Number.isFinite(padding.top) && padding.top !== 0) {
    wrap.attrs.distTop = padding.top;
  }
  if (mergeVertical && wrap.attrs.distBottom == null && Number.isFinite(padding.bottom) && padding.bottom !== 0) {
    wrap.attrs.distBottom = padding.bottom;
  }
  if (mergeHorizontal && wrap.attrs.distLeft == null && Number.isFinite(padding.left) && padding.left !== 0) {
    wrap.attrs.distLeft = padding.left;
  }
  if (mergeHorizontal && wrap.attrs.distRight == null && Number.isFinite(padding.right) && padding.right !== 0) {
    wrap.attrs.distRight = padding.right;
  }
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
  const hasBehindDocAttribute = isAnchor && attributes.behindDoc != null;
  const isBehindDoc = attributes.behindDoc === '1' || attributes.behindDoc === 1 || attributes.behindDoc === true;

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
      wrap.attrs.behindDoc = isBehindDoc;
      break;
    case 'Inline':
      break;
    default:
      break;
  }

  // OOXML stores wrap distances on wp:anchor (distL/distR/distT/distB); wrap child elements
  // may omit them. Merge into wrap.attrs for wrap modes that affect text flow.
  if (wrap.type === 'Square' || wrap.type === 'Tight' || wrap.type === 'Through' || wrap.type === 'TopAndBottom') {
    mergeAnchorPaddingIntoWrapDistances(wrap, padding);
  }
  if (hasBehindDocAttribute && wrap.attrs) {
    wrap.attrs.behindDoc = isBehindDoc;
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

  const graphic = findChildByLocalName(node.elements, 'graphic');
  const graphicData = findChildByLocalName(graphic?.elements, 'graphicData');
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
    return handleShapeGroup(
      params,
      node,
      graphicData,
      size,
      padding,
      shapeMarginOffset,
      anchorData,
      wrap,
      extractEffectExtent(node),
      isHidden,
    );
  }

  if (uri === CHART_URI) {
    return handleChartDrawing(params, node, graphicData, size, padding, marginOffset, anchorData, wrap, isAnchor);
  }

  const picture = graphicData?.elements.find((el) => el.name === 'pic:pic');
  if (!picture || !picture.elements) {
    return null;
  }

  const blipFill = picture.elements.find((el) => el.name === 'pic:blipFill');
  const blip = findChildByLocalName(blipFill?.elements, 'blip');
  if (!blip) {
    return null;
  }

  // Check for image effects (grayscale, luminance, etc.)
  const hasGrayscale = someChildHasLocalName(blip.elements, 'grayscl');
  const lumEl = findChildByLocalName(blip.elements, 'lum');
  const rawBright = Number(lumEl?.attributes?.bright);
  const rawContrast = Number(lumEl?.attributes?.contrast);
  const lum =
    Number.isFinite(rawBright) || Number.isFinite(rawContrast)
      ? {
          ...(Number.isFinite(rawBright) ? { bright: rawBright } : {}),
          ...(Number.isFinite(rawContrast) ? { contrast: rawContrast } : {}),
        }
      : undefined;
  const alphaModFix = extractAlphaModFix(blip);

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
  const { clipPath, rawSrcRect, shouldCover, shouldFillClippedStretch, shouldCoverShapeStretch, shapeClipPath } =
    extractPicturePresentation(picture);

  const spPr = picture.elements.find((el) => el.name === 'pic:spPr');
  if (spPr) {
    const xfrm = findChildByLocalName(spPr.elements, 'xfrm');
    if (xfrm?.attributes) {
      transformData = {
        ...transformData,
        rotation: rotToDegrees(xfrm.attributes['rot']),
        verticalFlip: xfrm.attributes['flipV'] === '1',
        horizontalFlip: xfrm.attributes['flipH'] === '1',
      };
    }
  }

  // --- Parse pic:nvPicPr for lockAspectRatio, hyperlink ---
  const nvPicPr = picture.elements.find((el) => el.name === 'pic:nvPicPr');
  const cNvPicPr = nvPicPr?.elements?.find((el) => el.name === 'pic:cNvPicPr');
  const picLocks = findChildByLocalName(cNvPicPr?.elements, 'picLocks');
  // Per OOXML §20.1.2.2.31, noChangeAspect defaults to false when not specified.
  // When a:picLocks is absent entirely, there is no lock → false.
  const lockAspectRatio = picLocks
    ? picLocks.attributes?.['noChangeAspect'] === '1' || picLocks.attributes?.['noChangeAspect'] === 1
    : false;

  // Parse image hyperlink from pic:cNvPr > a:hlinkClick, falling back to
  // wp:docPr > a:hlinkClick (Word's canonical placement per §20.4.2.5).
  const cNvPr = nvPicPr?.elements?.find((el) => el.name === 'pic:cNvPr');
  const hlinkClick =
    findChildByLocalName(cNvPr?.elements, 'hlinkClick') || findChildByLocalName(docPr?.elements, 'hlinkClick');
  let hyperlink = null;
  if (hlinkClick?.attributes?.['r:id']) {
    const hlinkRId = hlinkClick.attributes['r:id'];
    const currentFile2 = filename || 'document.xml';
    let hlinkRels = docx[`word/_rels/${currentFile2}.rels`];
    if (!hlinkRels) hlinkRels = docx[`word/_rels/document.xml.rels`];
    const hlinkRelationships = hlinkRels?.elements?.find((el) => el.name === 'Relationships');
    const hlinkRel = hlinkRelationships?.elements?.find((el) => el.attributes?.['Id'] === hlinkRId);
    if (hlinkRel?.attributes?.['Target']) {
      hyperlink = { url: hlinkRel.attributes['Target'] };
      if (hlinkClick.attributes?.['tooltip']) {
        hyperlink.tooltip = hlinkClick.attributes['tooltip'];
      }
    }
  }

  // --- Parse decorative flag from wp:docPr > a:extLst > a:ext > adec:decorative ---
  let decorative = false;
  const docPrExtLst = findChildByLocalName(docPr?.elements, 'extLst');
  if (docPrExtLst) {
    for (const ext of docPrExtLst.elements || []) {
      if (!hasLocalName(ext, 'ext')) continue;
      const decEl = findChildByLocalName(ext.elements, 'decorative');
      if (decEl && (decEl.attributes?.['val'] === '1' || decEl.attributes?.['val'] === 1)) {
        decorative = true;
        break;
      }
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

  // Convert TIFF images to PNG for display (browsers cannot render TIFF natively)
  if (!wasConverted && isTiffExtension(extension)) {
    const mediaData = converter?.media?.[path];
    if (mediaData) {
      if (converter?.domEnvironment) {
        setTiffDomEnvironment(converter.domEnvironment);
      }
      const conversionResult = convertTiffToPng(mediaData);
      if (conversionResult?.dataUri) {
        finalSrc = conversionResult.dataUri;
        finalExtension = conversionResult.format || 'png';
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

  // Extract relativeHeight from anchor attributes for first-class z-order support.
  // We only accept OOXML-conformant unsignedInt values.
  const relativeHeight = isAnchor ? parseRelativeHeight(attributes['relativeHeight']) : null;

  // Derive a deterministic sdImageId from the drawing's docPr id, the rEmbed,
  // and the document-part filename so the same image always receives the same
  // stable ID across multiple opens of the same DOCX.
  const docPrId = docPr?.attributes?.id ?? '';
  const sdImageId = uuidv5(`${currentFile}:${rEmbed}:${docPrId}`, SD_IMAGE_ID_NAMESPACE);

  const nodeAttrs = {
    sdImageId,
    relativeHeight,
    // originalXml: carbonCopy(node),
    src: finalSrc,
    alt:
      (isMetafileExtension(extension) || isTiffExtension(extension)) && !wasConverted
        ? 'Unable to render image'
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
    ...(shouldFillClippedStretch ? { objectFit: 'fill' } : shouldCoverShapeStretch ? { objectFit: 'cover' } : {}),
    ...(clipPath ? { clipPath } : {}),
    ...(shapeClipPath ? { shapeClipPath } : {}),
    rawSrcRect,
    originalPadding: {
      distT: attributes['distT'],
      distB: attributes['distB'],
      distL: attributes['distL'],
      distR: attributes['distR'],
    },
    originalAttributes: node.attributes,
    rId: relAttributes['Id'],
    lockAspectRatio,
    decorative,
    hyperlink,
    ...(order.length ? { drawingChildOrder: order } : {}),
    ...(originalChildren.length ? { originalDrawingChildren: originalChildren } : {}),
    ...(hasGrayscale ? { grayscale: true } : {}),
    ...(lum ? { lum } : {}),
    ...(alphaModFix ? { alphaModFix } : {}),
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
  const prstGeom = findChildByLocalName(spPr?.elements, 'prstGeom');
  const shapeType = prstGeom?.attributes['prst'];

  // Check for custom geometry when no preset geometry is found
  const custGeom = !shapeType ? extractCustomGeometry(spPr) : null;

  // For shapes with preset geometry or custom geometry, use the vector shape handler
  if (shapeType || custGeom) {
    const result = getVectorShape({
      params,
      node,
      graphicData,
      size,
      marginOffset,
      anchorData,
      wrap,
      isAnchor,
      customGeometry: custGeom,
    });
    if (result?.attrs && isHidden) {
      result.attrs.hidden = true;
    }
    if (result) return result;
  }

  // Plain textbox without preset or custom geometry (txBox="1", no prstGeom/custGeom).
  // getVectorShape was never called, so importDrawingMLTextbox must be called directly.
  const nonVisualShapeProps = wsp.elements?.find((el) => el.name === 'wps:cNvSpPr');
  const isTextBox = nonVisualShapeProps?.attributes?.['txBox'] === '1';
  if (isTextBox && textBoxContent) {
    const bodyPr = wsp.elements?.find((el) => el.name === 'wps:bodyPr');
    const drawingNode = params.nodes?.[0];
    const result = importDrawingMLTextbox({
      params,
      drawingNode: drawingNode?.name === 'w:drawing' ? drawingNode : null,
      textBoxContent,
      bodyPr,
      baseAttrs: {
        width: size?.width,
        height: size?.height,
        marginOffset,
        anchorData,
        wrap,
        isAnchor,
        isTextBox: true,
        originalAttributes: node?.attributes,
        ...(params.nodes?.[0]?.name === 'w:drawing' ? { drawingContent: params.nodes[0] } : {}),
      },
      paragraphImporter:
        params?.nodeListHandler != null
          ? undefined
          : (paragraph) => {
              const imported = paragraphToPmParagraph(paragraph, params);
              return Array.isArray(imported) ? imported : imported ? [imported] : [];
            },
    });
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

const parseEmuNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const getGroupXfrm = (groupNode) => {
  const grpSpPr = findChildByLocalName(groupNode?.elements, 'grpSpPr');
  return findChildByLocalName(grpSpPr?.elements, 'xfrm');
};

const buildShapeGroupTransformAttrs = (xfrm) => {
  const groupTransform = {};
  if (!xfrm) return groupTransform;

  if (xfrm.attributes?.['rot']) {
    groupTransform.rotation = rotToDegrees(xfrm.attributes['rot']);
  }
  if (xfrm.attributes?.['flipH'] === '1') {
    groupTransform.flipH = true;
  }
  if (xfrm.attributes?.['flipV'] === '1') {
    groupTransform.flipV = true;
  }

  const off = findChildByLocalName(xfrm.elements, 'off');
  const ext = findChildByLocalName(xfrm.elements, 'ext');
  const chOff = findChildByLocalName(xfrm.elements, 'chOff');
  const chExt = findChildByLocalName(xfrm.elements, 'chExt');

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
    groupTransform.childOriginXEmu = parseEmuNumber(chOff.attributes?.['x']);
    groupTransform.childOriginYEmu = parseEmuNumber(chOff.attributes?.['y']);
  }
  if (chExt) {
    groupTransform.childWidth = emuToPixels(chExt.attributes?.['cx'] || 0);
    groupTransform.childHeight = emuToPixels(chExt.attributes?.['cy'] || 0);
  }

  return groupTransform;
};

const identityMatrix = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

const multiplyMatrix = (left, right) => ({
  a: left.a * right.a + left.c * right.b,
  b: left.b * right.a + left.d * right.b,
  c: left.a * right.c + left.c * right.d,
  d: left.b * right.c + left.d * right.d,
  e: left.a * right.e + left.c * right.f + left.e,
  f: left.b * right.e + left.d * right.f + left.f,
});

const transformPoint = (matrix, x, y) => ({
  x: matrix.a * x + matrix.c * y + matrix.e,
  y: matrix.b * x + matrix.d * y + matrix.f,
});

const normalizeDegrees = (degrees) => {
  const normalized = ((degrees % 360) + 360) % 360;
  return Object.is(normalized, -0) ? 0 : normalized;
};

const decomposeMatrixOrientation = (matrix) => {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (determinant < 0) {
    return {
      rotation: normalizeDegrees((Math.atan2(-matrix.b, -matrix.a) * 180) / Math.PI),
      flipH: true,
      flipV: false,
    };
  }

  return {
    rotation: normalizeDegrees((Math.atan2(matrix.b, matrix.a) * 180) / Math.PI),
    flipH: false,
    flipV: false,
  };
};

const getVisualOrientationMatrix = ({ rotation = 0, flipH = false, flipV = false } = {}) => {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const flipScaleX = flipH ? -1 : 1;
  const flipScaleY = flipV ? -1 : 1;

  return {
    a: cos * flipScaleX,
    b: sin * flipScaleX,
    c: -sin * flipScaleY,
    d: cos * flipScaleY,
    e: 0,
    f: 0,
  };
};

const getGroupAffineTransform = (xfrm, { includeVisualTransform = false } = {}) => {
  if (!xfrm) {
    return { matrix: identityMatrix(), rotation: 0, flipH: false, flipV: false };
  }

  const off = findChildByLocalName(xfrm.elements, 'off');
  const ext = findChildByLocalName(xfrm.elements, 'ext');
  const chOff = findChildByLocalName(xfrm.elements, 'chOff');
  const chExt = findChildByLocalName(xfrm.elements, 'chExt');

  const childWidth = parseEmuNumber(chExt?.attributes?.['cx']);
  const childHeight = parseEmuNumber(chExt?.attributes?.['cy']);
  const width = parseEmuNumber(ext?.attributes?.['cx'], childWidth || 0);
  const height = parseEmuNumber(ext?.attributes?.['cy'], childHeight || 0);
  const childX = parseEmuNumber(chOff?.attributes?.['x']);
  const childY = parseEmuNumber(chOff?.attributes?.['y']);
  const x = parseEmuNumber(off?.attributes?.['x']);
  const y = parseEmuNumber(off?.attributes?.['y']);
  const scaleX = childWidth !== 0 ? width / childWidth : 1;
  const scaleY = childHeight !== 0 ? height / childHeight : 1;
  const rotation = xfrm.attributes?.['rot'] ? rotToDegrees(xfrm.attributes['rot']) : 0;
  const flipH = xfrm.attributes?.['flipH'] === '1';
  const flipV = xfrm.attributes?.['flipV'] === '1';
  const baseMatrix = {
    a: scaleX,
    b: 0,
    c: 0,
    d: scaleY,
    e: x - childX * scaleX,
    f: y - childY * scaleY,
  };

  if (!includeVisualTransform || (!rotation && !flipH && !flipV)) {
    return { matrix: baseMatrix, rotation: 0, flipH: false, flipV: false };
  }

  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const flipScaleX = flipH ? -1 : 1;
  const flipScaleY = flipV ? -1 : 1;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const visualMatrix = {
    a: cos * flipScaleX,
    b: sin * flipScaleX,
    c: -sin * flipScaleY,
    d: cos * flipScaleY,
    e: centerX - (cos * flipScaleX * centerX + -sin * flipScaleY * centerY),
    f: centerY - (sin * flipScaleX * centerX + cos * flipScaleY * centerY),
  };

  return { matrix: multiplyMatrix(visualMatrix, baseMatrix), rotation, flipH, flipV };
};

const composeShapeGroupTransform = (parent, child) => {
  const matrix = multiplyMatrix(parent.matrix, child.matrix);
  return {
    matrix,
    ...decomposeMatrixOrientation(matrix),
  };
};

const composeShapeGroupChildOrientation = (rect, xfrm) => {
  const parentMatrix = getVisualOrientationMatrix({
    rotation: rect.rotation ?? 0,
    flipH: Boolean(rect.flipH),
    flipV: Boolean(rect.flipV),
  });
  const childMatrix = getVisualOrientationMatrix({
    rotation: xfrm?.attributes?.['rot'] ? rotToDegrees(xfrm.attributes['rot']) : 0,
    flipH: xfrm?.attributes?.['flipH'] === '1',
    flipV: xfrm?.attributes?.['flipV'] === '1',
  });

  return decomposeMatrixOrientation(multiplyMatrix(parentMatrix, childMatrix));
};

const transformShapeGroupChildRect = (transform, rawX, rawY, rawWidth, rawHeight) => {
  const matrix = transform.matrix ?? identityMatrix();
  const width = Math.hypot(matrix.a, matrix.b) * rawWidth;
  const height = Math.hypot(matrix.c, matrix.d) * rawHeight;
  const center = transformPoint(matrix, rawX + rawWidth / 2, rawY + rawHeight / 2);

  return {
    x: emuToPixels(center.x - width / 2),
    y: emuToPixels(center.y - height / 2),
    width: emuToPixels(width),
    height: emuToPixels(height),
    rotation: transform.rotation ?? 0,
    flipH: Boolean(transform.flipH),
    flipV: Boolean(transform.flipV),
  };
};

const resolveShapeGroupPicturePath = (pic, params) => {
  const blipFill = findChildByLocalName(pic.elements, 'blipFill');
  const blip = findChildByLocalName(blipFill?.elements, 'blip');
  if (!blip) return null;

  const rEmbed = blip.attributes?.['r:embed'];
  if (!rEmbed) return null;

  const currentFile = params.filename || 'document.xml';
  let rels = params.docx[`word/_rels/${currentFile}.rels`];
  if (!rels) rels = params.docx[`word/_rels/document.xml.rels`];

  const relationships = rels?.elements.find((el) => el.name === 'Relationships');
  const elements = relationships?.elements;
  const rel = elements?.find((el) => el.attributes['Id'] === rEmbed);
  if (!rel) return null;

  return normalizeTargetPath(rel.attributes?.['Target']);
};

const parseShapeGroupVectorChild = (wsp, transform, params) => {
  const spPr = findChildByLocalName(wsp.elements, 'spPr');
  if (!spPr) return null;

  const prstGeom = findChildByLocalName(spPr.elements, 'prstGeom');
  const shapeKind = prstGeom?.attributes?.['prst'];
  const customGeom = !shapeKind ? extractCustomGeometry(spPr) : null;
  const shapeXfrm = findChildByLocalName(spPr.elements, 'xfrm');
  const shapeOff = findChildByLocalName(shapeXfrm?.elements, 'off');
  const shapeExt = findChildByLocalName(shapeXfrm?.elements, 'ext');
  const rawX = parseEmuNumber(shapeOff?.attributes?.['x']);
  const rawY = parseEmuNumber(shapeOff?.attributes?.['y']);
  const rawWidth = parseEmuNumber(shapeExt?.attributes?.['cx'], 914400);
  const rawHeight = parseEmuNumber(shapeExt?.attributes?.['cy'], 914400);
  const rect = transformShapeGroupChildRect(transform, rawX, rawY, rawWidth, rawHeight);
  const orientation = composeShapeGroupChildOrientation(rect, shapeXfrm);
  const style = findChildByLocalName(wsp.elements, 'style');
  const fillColor = extractFillColor(spPr, style);
  const strokeColor = extractStrokeColor(spPr, style);
  const strokeWidth = extractStrokeWidth(spPr);
  const lineEnds = extractLineEnds(spPr);
  const effects = extractShapeEffects(spPr);
  const cNvPr = findChildByLocalName(wsp.elements, 'cNvPr');
  const shapeId = cNvPr?.attributes?.['id'];
  const shapeName = cNvPr?.attributes?.['name'];
  const textBox = findChildByLocalName(wsp.elements, 'txbx');
  const textBoxContent = findChildByLocalName(textBox?.elements, 'txbxContent');
  const bodyPr = findChildByLocalName(wsp.elements, 'bodyPr');
  const textContent = textBoxContent ? extractTextFromTextBox(textBoxContent, bodyPr, params) : null;
  const textAlign = textContent?.horizontalAlign || 'left';

  return {
    shapeType: 'vectorShape',
    attrs: {
      kind: shapeKind,
      customGeometry: customGeom || undefined,
      ...rect,
      ...orientation,
      fillColor,
      strokeColor,
      strokeWidth,
      lineEnds,
      effects,
      shapeId,
      shapeName,
      textContent,
      textAlign,
      textVerticalAlign: textContent?.verticalAlign,
      textInsets: textContent?.insets,
    },
  };
};

const parseShapeGroupImageChild = (pic, transform, params) => {
  const spPr = findChildByLocalName(pic.elements, 'spPr');
  if (!spPr) return null;

  const xfrm = findChildByLocalName(spPr.elements, 'xfrm');
  const off = findChildByLocalName(xfrm?.elements, 'off');
  const ext = findChildByLocalName(xfrm?.elements, 'ext');
  const rawX = parseEmuNumber(off?.attributes?.['x']);
  const rawY = parseEmuNumber(off?.attributes?.['y']);
  const rawWidth = parseEmuNumber(ext?.attributes?.['cx'], 914400);
  const rawHeight = parseEmuNumber(ext?.attributes?.['cy'], 914400);
  const rect = transformShapeGroupChildRect(transform, rawX, rawY, rawWidth, rawHeight);
  const orientation = composeShapeGroupChildOrientation(rect, xfrm);
  const path = resolveShapeGroupPicturePath(pic, params);
  if (!path) return null;

  const blipFill = findChildByLocalName(pic.elements, 'blipFill');
  const blip = findChildByLocalName(blipFill?.elements, 'blip');
  const alphaModFix = extractAlphaModFix(blip);
  const nvPicPr = findChildByLocalName(pic.elements, 'nvPicPr');
  const cNvPr = findChildByLocalName(nvPicPr?.elements, 'cNvPr');
  const picId = cNvPr?.attributes?.['id'];
  const picName = cNvPr?.attributes?.['name'];
  const { clipPath, shouldCover, shouldFillClippedStretch, shouldCoverShapeStretch, shapeClipPath } =
    extractPicturePresentation(pic);

  return {
    shapeType: 'image',
    attrs: {
      ...rect,
      ...orientation,
      src: path,
      imageId: picId,
      imageName: picName,
      ...(alphaModFix ? { alphaModFix } : {}),
      ...(clipPath ? { clipPath } : {}),
      ...(shapeClipPath ? { shapeClipPath } : {}),
      ...(shouldFillClippedStretch || shouldCoverShapeStretch
        ? { objectFit: shouldFillClippedStretch ? 'fill' : 'cover' }
        : shouldCover
          ? { objectFit: 'cover' }
          : {}),
    },
  };
};

const collectShapeGroupChildren = (groupNode, transform, params) => {
  const children = [];

  for (const child of groupNode?.elements || []) {
    const localName = getLocalName(child?.name);
    if (localName === 'wsp') {
      const shape = parseShapeGroupVectorChild(child, transform, params);
      if (shape) children.push(shape);
    } else if (localName === 'pic') {
      const picture = parseShapeGroupImageChild(child, transform, params);
      if (picture) children.push(picture);
    } else if (localName === 'grpSp') {
      const nestedTransform = composeShapeGroupTransform(
        transform,
        getGroupAffineTransform(getGroupXfrm(child), { includeVisualTransform: true }),
      );
      children.push(...collectShapeGroupChildren(child, nestedTransform, params));
    }
  }

  return children;
};

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
 * @param {{ left?: number, top?: number, right?: number, bottom?: number }|null} effectExtent - Additional drawing paint bounds.
 * @param {boolean} isHidden - Whether the drawing should be hidden.
 * @returns {{ type: 'shapeGroup', attrs: Object }|null} A shapeGroup node representing the group, or null when no content exists.
 */
const handleShapeGroup = (
  params,
  node,
  graphicData,
  size,
  padding,
  marginOffset,
  anchorData,
  wrap,
  effectExtent,
  isHidden,
) => {
  const wgp = graphicData.elements.find((el) => el.name === 'wpg:wgp');
  if (!wgp) {
    const placeholder = buildShapePlaceholder(node, size, padding, marginOffset, 'group');
    if (placeholder?.attrs && isHidden) {
      placeholder.attrs.hidden = true;
    }
    return placeholder;
  }

  const groupXfrm = getGroupXfrm(wgp);
  const groupTransform = buildShapeGroupTransformAttrs(groupXfrm);
  const allShapes = collectShapeGroupChildren(wgp, getGroupAffineTransform(groupXfrm), params);

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
      effectExtent,
      anchorData,
      wrap,
      originalAttributes: node?.attributes,
    },
  };

  return result;
};

/**
 * Handles a chart drawing within a WordprocessingML graphic node.
 *
 * Detects the c:chart element, resolves the chart part from relationships,
 * parses the chart XML into a normalized ChartModel, and returns a chart node.
 *
 * @param {{ docx: Object, filename?: string }} params - Translator params
 * @param {Object} node - The wp:anchor or wp:inline node
 * @param {Object} graphicData - The a:graphicData node with chart URI
 * @param {{ width?: number, height?: number }} size - Bounding box from wp:extent
 * @param {{ top?: number, right?: number, bottom?: number, left?: number }} padding
 * @param {{ horizontal?: number, top?: number }} marginOffset - Anchor position offsets
 * @param {Object|null} anchorData - Anchor positioning data
 * @param {Object} wrap - Wrap configuration
 * @param {boolean} isAnchor - Whether the drawing is anchored
 * @returns {{ type: 'chart', attrs: Object }|null}
 */
const handleChartDrawing = (params, node, graphicData, size, padding, marginOffset, anchorData, wrap, isAnchor) => {
  const chartEl = graphicData?.elements?.find((el) => el.name === 'c:chart');
  const chartRelId = chartEl?.attributes?.['r:id'];

  if (!chartRelId) return null;

  const { docx, filename } = params;
  const resolved = resolveChartPart(docx, chartRelId, filename);
  if (!resolved) return null;

  const { chartPartPath } = resolved;
  const chartXml = docx[chartPartPath];
  const chartData = chartXml ? parseChartXml(chartXml) : null;

  // Preserve original drawing XML for round-trip export
  const drawingNode = params.nodes?.[0];

  const { order, originalChildren } = collectPreservedDrawingChildren(node);

  return {
    type: 'chart',
    attrs: {
      width: size.width || 400,
      height: size.height || 300,
      chartData,
      chartRelId,
      chartPartPath,
      isAnchor,
      anchorData,
      wrap,
      padding,
      marginOffset,
      originalAttributes: node?.attributes,
      originalChildren,
      originalChildOrder: order,
      originalXml: drawingNode ? carbonCopy(drawingNode) : null,
      drawingContent: drawingNode || null,
    },
  };
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
 *     fieldType?: 'PAGE' | 'NUMPAGES' | 'SECTIONPAGES',
 *     pageNumberFormat?: string,
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
  const paragraphMetadata = [];
  let horizontalAlign = null;
  const { verticalAlign, insets, wrap, spcFirstLastPara } = extractBodyPrProperties(bodyPr);

  /**
   * Appends a field part (PAGE, NUMPAGES, or SECTIONPAGES) to textParts with formatting.
   * @param {'PAGE' | 'NUMPAGES' | 'SECTIONPAGES'} fieldType - The field type
   * @param {Object} node - The field node element
   * @param {Object} paragraphProperties - Resolved paragraph properties
   */
  const appendFieldPart = (fieldType, node, paragraphProperties) => {
    const rPr = node?.elements?.find((el) => el.name === 'w:rPr');
    const formatting = extractRunFormatting(rPr, paragraphProperties, params);
    const cachedText =
      fieldType === 'SECTIONPAGES'
        ? (node?.attributes?.resolvedText ?? node?.attributes?.importedCachedText ?? '')
        : '';
    textParts.push({
      text: cachedText,
      formatting,
      fieldType,
      ...(node?.attributes?.pageNumberFormat ? { pageNumberFormat: node.attributes.pageNumberFormat } : {}),
    });
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
      } else if (el.name === 'sd:sectionPageCount') {
        hasText = true;
        appendFieldPart('SECTIONPAGES', el, paragraphProperties);
      } else if (el.name === 'w:drawing') {
        // SD-2804 / ECMA-376 §20.4.2.38: a textbox can hold body-level
        // content, including runs with inline w:drawing images. Defer to
        // the existing v3 wp drawing handler for rId → src + size resolution
        // so this branch behaves identically to body inline images. Anchored
        // drawings inside textboxes are out of scope (the wrap / position /
        // transform metadata isn't carried into the text-parts model);
        // confine support to wp:inline.
        const inline = el.elements?.find((child) => child?.name === 'wp:inline');
        if (inline) {
          const imagePm = handleImageNode(inline, { ...params, nodes: [el] }, false);
          // Skip hidden drawings (wp:docPr hidden="1") to match the body-level
          // pipeline — handleImageNode flags them via attrs.hidden, and image
          // parts bypass the top-level filtering that drops them elsewhere.
          if (imagePm?.attrs?.src && imagePm.attrs.hidden !== true) {
            hasText = true;
            const sizeAttr = imagePm.attrs.size || imagePm.attrs;
            textParts.push({
              text: '',
              formatting,
              kind: 'image',
              src: imagePm.attrs.src,
              extension: imagePm.attrs.extension,
              rId: imagePm.attrs.rId,
              width: typeof sizeAttr?.width === 'number' ? sizeAttr.width : undefined,
              height: typeof sizeAttr?.height === 'number' ? sizeAttr.height : undefined,
              alt: imagePm.attrs.alt || '',
            });
          }
        }
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
    if (el.name === 'sd:sectionPageCount') {
      appendFieldPart('SECTIONPAGES', el, paragraphProperties);
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
    paragraphMetadata.push({
      spacing: extractTextBoxParagraphSpacing(paragraphProperties, {
        paragraphIndex,
        paragraphCount: paragraphs.length,
        spcFirstLastPara,
      }),
    });

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
        isParagraphBoundary: true,
      });
    }
  });

  if (textParts.length === 0) return null;

  const hasParagraphSpacing = paragraphMetadata.some((paragraph) => paragraph.spacing);

  return {
    parts: textParts,
    horizontalAlign: horizontalAlign || 'left',
    verticalAlign,
    insets,
    wrap,
    ...(hasParagraphSpacing ? { paragraphs: paragraphMetadata } : {}),
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

function extractFieldInlineNodes(node) {
  if (node?.name === 'sd:autoPageNumber') {
    return [{ type: 'page-number', attrs: { marksAsAttrs: [], instruction: 'PAGE' } }];
  }
  if (node?.name === 'sd:totalPageNumber') {
    return [{ type: 'total-page-number', attrs: { marksAsAttrs: [], instruction: 'NUMPAGES' } }];
  }
  if (node?.name === 'sd:sectionPageCount') {
    const cachedText = node?.attributes?.resolvedText ?? node?.attributes?.importedCachedText ?? '';
    if (!cachedText) return [];
    return [{ type: 'text', text: cachedText }];
  }
  return [];
}

function extractInlineNodesFromRun(run, params) {
  if (!run?.elements) return [];

  const nodes = [];
  run.elements.forEach((el) => {
    if (el.name === 'w:t' || el.name === 'w:delText') {
      const textNode = el.elements?.find((n) => n.type === 'text');
      if (!textNode || typeof textNode.text !== 'string') return;
      const cleanedText = textNode.text.replace(/\[\[sdspace\]\]/g, ' ');
      if (cleanedText.length > 0) {
        nodes.push({ type: 'text', text: cleanedText });
      }
    } else if (el.name === 'w:tab') {
      nodes.push({ type: 'text', text: '\t' });
    } else if (el.name === 'w:br') {
      nodes.push({ type: 'lineBreak', attrs: {} });
    } else if (
      el.name === 'sd:autoPageNumber' ||
      el.name === 'sd:totalPageNumber' ||
      el.name === 'sd:sectionPageCount'
    ) {
      nodes.push(...extractFieldInlineNodes(el));
    } else if (el.name === 'w:drawing') {
      const inline = el.elements?.find((child) => child?.name === 'wp:inline');
      if (!inline) return;
      const imagePm = handleImageNode(inline, { ...params, nodes: [el] }, false);
      if (imagePm?.type === 'image' && imagePm.attrs?.hidden !== true) {
        nodes.push(imagePm);
      }
    }
  });

  return nodes;
}

function paragraphToPmParagraph(paragraph, params) {
  // `paragraph` is already preprocessed by importDrawingMLTextbox — do not call
  // preProcessTextBoxContent again here or field nodes (sd:autoPageNumber, etc.) get processed twice.
  const paragraphNode = collectTextBoxParagraphs([paragraph])[0];
  if (!paragraphNode) return null;

  const paragraphProperties = resolveParagraphPropertiesForTextBox(paragraphNode, params);
  const alignment = extractParagraphAlignment(paragraphNode) || 'left';
  const content = [];
  let pendingRunContent = [];

  const flushPendingRun = () => {
    if (pendingRunContent.length === 0) return;
    content.push({ type: 'run', attrs: {}, content: pendingRunContent });
    pendingRunContent = [];
  };

  (paragraphNode.elements || []).forEach((element) => {
    if (element?.name === 'w:r') {
      const inlineParts = extractInlineNodesFromRun(element, params);
      inlineParts.forEach((part) => {
        if (part?.type === 'image') {
          flushPendingRun();
          content.push(part);
          return;
        }
        pendingRunContent.push(part);
      });
      return;
    }

    if (element?.name?.startsWith('sd:')) {
      const runContent = extractFieldInlineNodes(element);
      if (runContent.length > 0) {
        pendingRunContent.push(...runContent);
      }
    }
  });
  flushPendingRun();

  return {
    type: 'paragraph',
    attrs: { paragraphProperties, textAlign: alignment },
    content,
    marks: [],
  };
}

export function getVectorShape({
  params,
  node,
  graphicData,
  size,
  marginOffset,
  anchorData,
  wrap,
  isAnchor,
  customGeometry,
}) {
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

  // Extract shape kind (preset geometry) or custom geometry
  const prstGeom = findChildByLocalName(spPr.elements, 'prstGeom');
  const shapeKind = prstGeom?.attributes?.['prst'];
  schemaAttrs.kind = shapeKind;

  // Store custom geometry if provided (from a:custGeom) or extract it here
  if (customGeometry) {
    schemaAttrs.customGeometry = customGeometry;
  } else if (!shapeKind) {
    const extracted = extractCustomGeometry(spPr);
    if (extracted) {
      schemaAttrs.customGeometry = extracted;
    }
  }

  // Use wp:extent for dimensions (final displayed size from anchor)
  // This is the correct size that Word displays the shape at
  const width = size?.width ?? DEFAULT_SHAPE_WIDTH;
  const height = size?.height ?? DEFAULT_SHAPE_HEIGHT;

  // Extract transformations from a:xfrm (rotation and flips are still valid)
  const xfrm = findChildByLocalName(spPr.elements, 'xfrm');
  const rotation = xfrm?.attributes?.['rot'] ? rotToDegrees(xfrm.attributes['rot']) : 0;
  const flipH = xfrm?.attributes?.['flipH'] === '1';
  const flipV = xfrm?.attributes?.['flipV'] === '1';

  // Extract colors
  const style = wsp.elements?.find((el) => el.name === 'wps:style');
  const fillColor = extractFillColor(spPr, style);
  const strokeColor = extractStrokeColor(spPr, style);
  const strokeWidth = extractStrokeWidth(spPr);
  const lineEnds = extractLineEnds(spPr);
  const effects = extractShapeEffects(spPr);
  const effectExtent = extractEffectExtent(node);

  // Extract textbox content if present
  const textBox = wsp.elements?.find((el) => el.name === 'wps:txbx');
  const textBoxContent = textBox?.elements?.find((el) => el.name === 'w:txbxContent');
  const bodyPr = wsp.elements?.find((el) => el.name === 'wps:bodyPr');
  const nonVisualShapeProps = wsp.elements?.find((el) => el.name === 'wps:cNvSpPr');

  const isWordArt = bodyPr?.attributes?.['fromWordArt'] === '1';
  const isTextBox = nonVisualShapeProps?.attributes?.['txBox'] === '1';

  if (isTextBox && textBoxContent) {
    return importDrawingMLTextbox({
      params,
      drawingNode: drawingNode?.name === 'w:drawing' ? drawingNode : null,
      textBoxContent,
      bodyPr,
      baseAttrs: {
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
        effects,
        effectExtent,
        marginOffset,
        anchorData,
        wrap,
        isAnchor,
        isWordArt,
        isTextBox,
        originalAttributes: node?.attributes,
      },
      paragraphImporter:
        params?.nodeListHandler != null
          ? undefined
          : (paragraph) => {
              const imported = paragraphToPmParagraph(paragraph, params);
              return Array.isArray(imported) ? imported : imported ? [imported] : [];
            },
    });
  }

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
      effects,
      effectExtent,
      marginOffset,
      anchorData,
      wrap,
      isAnchor,
      textContent,
      textAlign,
      textVerticalAlign: textContent?.verticalAlign,
      textInsets: textContent?.insets,
      isWordArt,
      isTextBox,
      originalAttributes: node?.attributes,
    },
  };
}
