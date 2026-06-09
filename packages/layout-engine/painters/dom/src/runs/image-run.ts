import type { ImageBlock, ImageRun } from '@superdoc/contracts';
import { DOM_CLASS_NAMES } from '../constants.js';
import { assertPmPositions } from '../pm-position-validation.js';
import { applyImageClipPath, readImageClipPathValue } from '../images/image-clip-path.js';
import { applyImageObjectFit } from '../images/object-fit.js';
import type { RunRenderContext } from './types.js';
import { applyRunDataAttributes } from './hash.js';
import { sanitizeUrl } from './links.js';
import { isValidImageDataUrl } from '@superdoc/url-validation';

/**
 * Maximum resize multiplier for image metadata.
 * Images can be resized up to 3x their original dimensions.
 */
const MAX_RESIZE_MULTIPLIER = 3;

/**
 * Fallback maximum dimension for image resizing when original size is small.
 * Ensures images can be resized to at least 1000px even if original is smaller.
 */
const FALLBACK_MAX_DIMENSION = 1000;

/**
 * Minimum image dimension in pixels.
 * Ensures images remain visible and interactive during resizing.
 */
const MIN_IMAGE_DIMENSION = 20;

type ImageFilterSource = Pick<ImageBlock, 'grayscale' | 'gain' | 'blacklevel' | 'lum'>;
type ImageOpacitySource = Pick<ImageBlock, 'alphaModFix'>;

const clampLumUnit = (value: number): number => {
  return Math.max(-100000, Math.min(100000, value));
};

const parseVmlFixedFraction = (value: string | number | undefined): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  if (value.endsWith('f')) {
    const raw = Number.parseInt(value.slice(0, -1), 10);
    return Number.isFinite(raw) ? raw / 65536 : null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const buildImageFilters = (source: ImageFilterSource): string[] => {
  const filters: string[] = [];

  if (source.grayscale) {
    filters.push('grayscale(100%)');
  }

  if (source.gain != null || source.blacklevel != null) {
    const gain = parseVmlFixedFraction(source.gain);
    const blacklevel = parseVmlFixedFraction(source.blacklevel);

    if (gain != null) {
      const contrast = Math.max(0, gain);
      if (contrast > 0) {
        filters.push(`contrast(${contrast})`);
      }
    }

    if (blacklevel != null) {
      // CSS has no black-point control, so approximate VML blacklevel with a linear
      // brightness shift using the same 0..32767 range Word's watermark UI uses.
      const brightness = Math.max(0, 1 + blacklevel * (65536 / 32767));
      if (brightness > 0) {
        filters.push(`brightness(${brightness})`);
      }
    }
  }

  if (source.lum) {
    // a:lum uses ST_FixedPercentage values expressed in thousandths of a percent.
    // Convert those percentage deltas into CSS filter multipliers.
    const contrastValue = typeof source.lum.contrast === 'number' ? clampLumUnit(source.lum.contrast) : null;
    const brightValue = typeof source.lum.bright === 'number' ? clampLumUnit(source.lum.bright) : null;

    if (contrastValue != null) {
      const contrast = Math.max(0, 1 + contrastValue / 100000);
      if (contrast >= 0) {
        filters.push(`contrast(${contrast})`);
      }
    }

    if (brightValue != null) {
      const brightness = Math.max(0, 1 + brightValue / 100000);
      if (brightness >= 0) {
        filters.push(`brightness(${brightness})`);
      }
    }
  }

  return filters;
};

export const resolveImageOpacity = (source: ImageOpacitySource): string | null => {
  const amt = source.alphaModFix?.amt;
  if (typeof amt !== 'number' || !Number.isFinite(amt)) {
    return null;
  }

  const opacity = Math.max(0, Math.min(100000, amt)) / 100000;
  return opacity === 1 ? null : String(opacity);
};

/**
 * Renders an ImageRun as an inline <img> element.
 *
 * SECURITY NOTES:
 * - Data URLs are validated against an allowlist of image MIME types
 * - Size limit prevents DoS attacks from extremely large images
 * - Only allows safe image MIME types; non-base64 data URLs are limited to SVG
 * - Non-data URLs are sanitized through sanitizeUrl to prevent XSS
 *
 * METADATA ATTRIBUTE:
 * - Adds `data-image-metadata` attribute to enable interactive resizing via ImageResizeOverlay
 * - Metadata includes: originalWidth, originalHeight, aspectRatio, min/max dimensions
 * - Only added when run.width > 0 && run.height > 0 to prevent invalid metadata
 * - Max dimensions: 3x original size or 1000px (whichever is larger)
 * - Min dimensions: 20px to ensure visibility and interactivity
 *
 * @param run - The ImageRun to render containing image source, dimensions, and spacing
 * @returns HTMLElement (img) or null if src is missing or invalid
 */
export const renderImageRun = (run: ImageRun, context: RunRenderContext): HTMLElement | null => {
  if (!run.src) {
    return null;
  }

  const runClipPath = readImageClipPathValue(run.clipPath);
  const shapeClipPath = readImageClipPathValue(run.shapeClipPath);
  const hasClipPath = runClipPath.length > 0;
  const hasShapeClipPath = shapeClipPath.length > 0;

  // Create img element
  const img = context.doc.createElement('img');
  img.classList.add(DOM_CLASS_NAMES.INLINE_IMAGE);

  // Set source - validate data URLs with strict format and size checks
  // Note: data: URLs are blocked by sanitizeUrl for hyperlinks (XSS risk),
  // but are safe for <img> elements when properly validated
  const isDataUrl = typeof run.src === 'string' && run.src.startsWith('data:');
  if (isDataUrl) {
    // SECURITY: Validate data URL MIME type, encoding, and size.
    if (!isValidImageDataUrl(run.src)) {
      return null;
    }
    img.src = run.src;
  } else {
    const sanitized = sanitizeUrl(run.src);
    if (sanitized) {
      img.src = sanitized;
    } else {
      // Invalid URL - return null
      return null;
    }
  }

  // Set dimensions: clipped or shape-masked images use a wrapper that owns the layout box.
  if (!hasClipPath && !hasShapeClipPath) {
    img.width = run.width;
    img.height = run.height;
  } else {
    Object.assign(img.style, {
      width: '100%',
      height: '100%',
      maxWidth: '100%',
      maxHeight: '100%',
      boxSizing: 'border-box',
      minWidth: '0',
      minHeight: '0',
    });
  }
  applyImageClipPath(img, runClipPath);
  if (run.objectFit) {
    applyImageObjectFit(img, run.objectFit);
  }

  // Add metadata for interactive image resizing (inline images)
  // Only add metadata if dimensions are valid (positive, non-zero values)
  if (run.width > 0 && run.height > 0) {
    // This enables the ImageResizeOverlay to work with inline images
    const aspectRatio = run.width / run.height;
    const inlineImageMetadata = {
      originalWidth: run.width,
      originalHeight: run.height,
      // Max dimensions: MAX_RESIZE_MULTIPLIER x original size or FALLBACK_MAX_DIMENSION, whichever is larger
      // This provides generous constraints while preventing excessive scaling
      maxWidth: Math.max(run.width * MAX_RESIZE_MULTIPLIER, FALLBACK_MAX_DIMENSION),
      maxHeight: Math.max(run.height * MAX_RESIZE_MULTIPLIER, FALLBACK_MAX_DIMENSION),
      aspectRatio,
      // Min dimensions: MIN_IMAGE_DIMENSION to ensure images remain visible and interactive
      minWidth: MIN_IMAGE_DIMENSION,
      minHeight: MIN_IMAGE_DIMENSION,
    };
    img.setAttribute('data-image-metadata', JSON.stringify(inlineImageMetadata));
  }

  // Set alt text (required for accessibility)
  img.alt = run.alt ?? '';

  // Set title if present
  if (run.title) {
    img.title = run.title;
  }

  // Apply inline-block display
  img.style.display = 'inline-block';

  // When we use a wrapper (clipPath + positive dimensions), margins/verticalAlign/position/zIndex go on the wrapper only.
  // When we don't use a wrapper (no clipPath, or clipPath with width/height 0), apply them on the img so layout is correct.
  const useWrapper = (hasClipPath || hasShapeClipPath) && run.width > 0 && run.height > 0;
  if (!useWrapper) {
    img.style.verticalAlign = run.verticalAlign ?? 'top';

    // Apply spacing as CSS margins
    if (run.distTop) {
      img.style.marginTop = `${run.distTop}px`;
    }
    if (run.distBottom) {
      img.style.marginBottom = `${run.distBottom}px`;
    }
    if (run.distLeft) {
      img.style.marginLeft = `${run.distLeft}px`;
    }
    if (run.distRight) {
      img.style.marginRight = `${run.distRight}px`;
    }

    // Position and z-index on the image only (not the line) so resize overlay can stack above.
    img.style.position = 'relative';
    img.style.zIndex = '1';
    img.style.maxWidth = '100%';
  }

  // Apply rotation and flip transforms from OOXML a:xfrm
  const transforms: string[] = [];

  // Calculate translation offset to keep top-left corner fixed when rotating
  if (run.rotation != null && run.rotation !== 0) {
    const angleRad = (run.rotation * Math.PI) / 180;
    const w = run.width;
    const h = run.height;

    // Calculate how much the top-left corner moves when rotating around center
    // Top-left corner starts at (0, 0) in element space
    // Center is at (w/2, h/2)
    // After rotation, we need to translate to keep top-left at (0, 0)
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    // Position of top-left corner after rotation (relative to original top-left)
    const newTopLeftX = (w / 2) * (1 - cosA) + (h / 2) * sinA;
    const newTopLeftY = (w / 2) * sinA + (h / 2) * (1 - cosA);

    transforms.push(`translate(${-newTopLeftX}px, ${-newTopLeftY}px)`);
    transforms.push(`rotate(${run.rotation}deg)`);
  }
  if (run.flipH) {
    transforms.push('scaleX(-1)');
  }
  if (run.flipV) {
    transforms.push('scaleY(-1)');
  }
  if (transforms.length > 0) {
    img.style.transform = transforms.join(' ');
    img.style.transformOrigin = 'center';
  }

  const filters = buildImageFilters(run);
  if (filters.length > 0) {
    img.style.filter = filters.join(' ');
  }
  const opacity = resolveImageOpacity(run);
  if (opacity != null) {
    img.style.opacity = opacity;
  }

  // Assert PM positions are present for cursor fallback
  assertPmPositions(run, 'inline image run');

  // When clipPath is set, scale makes the img paint outside its box;
  // wrap in a clip container so only the cropped portion occupies space in the document.
  // Wrapper size is the only layout box (position calculation uses run.width/run.height).
  // PM position attributes go on the wrapper only so selection highlight and selection rects use the wrapper, not the scaled img.
  // Skip wrapper when width or height is 0 (no layout box); img already has margins/verticalAlign/position/zIndex from above.
  if (useWrapper) {
    const wrapper = context.doc.createElement('span');
    wrapper.classList.add(DOM_CLASS_NAMES.INLINE_IMAGE_CLIP_WRAPPER);
    wrapper.style.display = 'inline-block';
    wrapper.style.width = `${run.width}px`;
    wrapper.style.height = `${run.height}px`;
    wrapper.style.boxSizing = 'border-box';
    wrapper.style.overflow = 'hidden';
    wrapper.style.verticalAlign = run.verticalAlign ?? 'top';
    if (run.distTop) wrapper.style.marginTop = `${run.distTop}px`;
    if (run.distBottom) wrapper.style.marginBottom = `${run.distBottom}px`;
    if (run.distLeft) wrapper.style.marginLeft = `${run.distLeft}px`;
    if (run.distRight) wrapper.style.marginRight = `${run.distRight}px`;
    wrapper.style.position = 'relative';
    wrapper.style.zIndex = '1';
    if (shapeClipPath) wrapper.style.clipPath = shapeClipPath;
    if (run.pmStart != null) wrapper.dataset.pmStart = String(run.pmStart);
    if (run.pmEnd != null) wrapper.dataset.pmEnd = String(run.pmEnd);
    wrapper.dataset.layoutEpoch = String(context.layoutEpoch);
    context.applySdtDataset(wrapper, run.sdt);
    if (run.dataAttrs) applyRunDataAttributes(wrapper, run.dataAttrs);
    wrapper.appendChild(img);
    return context.buildImageHyperlinkAnchor(wrapper, run.hyperlink, 'inline-block');
  }

  // Apply PM position tracking for cursor placement (only on img when not wrapped)
  if (run.pmStart != null) {
    img.dataset.pmStart = String(run.pmStart);
  }
  if (run.pmEnd != null) {
    img.dataset.pmEnd = String(run.pmEnd);
  }
  img.dataset.layoutEpoch = String(context.layoutEpoch);

  // Apply SDT metadata
  context.applySdtDataset(img, run.sdt);

  // Apply data attributes
  if (run.dataAttrs) {
    applyRunDataAttributes(img, run.dataAttrs);
  }

  if (runClipPath) {
    img.style.clipPath = runClipPath;
    img.style.display = 'block';
    img.style.marginTop = '';
    img.style.marginBottom = '';
    img.style.marginLeft = '';
    img.style.marginRight = '';
    img.style.verticalAlign = '';
    img.style.position = 'static';
    img.style.zIndex = '';

    const wrapper = context.doc.createElement('span');
    wrapper.classList.add('superdoc-inline-image-clip-wrapper');
    wrapper.style.display = 'inline-block';
    wrapper.style.width = `${run.width}px`;
    wrapper.style.height = `${run.height}px`;
    wrapper.style.verticalAlign = run.verticalAlign ?? 'top';
    wrapper.style.position = 'relative';
    wrapper.style.zIndex = '1';
    if (run.distTop) wrapper.style.marginTop = `${run.distTop}px`;
    if (run.distBottom) wrapper.style.marginBottom = `${run.distBottom}px`;
    if (run.distLeft) wrapper.style.marginLeft = `${run.distLeft}px`;
    if (run.distRight) wrapper.style.marginRight = `${run.distRight}px`;

    if (run.pmStart != null) {
      wrapper.dataset.pmStart = String(run.pmStart);
    }
    if (run.pmEnd != null) {
      wrapper.dataset.pmEnd = String(run.pmEnd);
    }
    wrapper.dataset.layoutEpoch = String(context.layoutEpoch);
    context.applySdtDataset(wrapper, run.sdt);

    wrapper.appendChild(img);
    return context.buildImageHyperlinkAnchor(wrapper, run.hyperlink, 'inline-block');
  }

  return context.buildImageHyperlinkAnchor(img, run.hyperlink, 'inline-block');
};
