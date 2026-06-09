import type { FieldAnnotationRun } from '@superdoc/contracts';
import { resolvePhysicalFamily } from '@superdoc/font-system';
import { sanitizeHref, isValidImageDataUrl } from '@superdoc/url-validation';
import { DOM_CLASS_NAMES } from '../constants.js';
import { assertPmPositions } from '../pm-position-validation.js';
import type { RunRenderContext } from './types.js';
import { BROWSER_DEFAULT_FONT_SIZE } from './text-run.js';

/**
 * Renders a FieldAnnotationRun as an inline "pill" element matching super-editor's visual appearance.
 *
 * Field annotations are styled inline elements that display form fields with:
 * - Outer span with border, border-radius, padding, and background color
 * - Inner span containing the displayLabel or type-specific content (image, link, etc.)
 *
 * @param run - The FieldAnnotationRun to render containing field configuration and styling
 * @returns HTMLElement (span) or null if document is not available
 */
export const renderFieldAnnotationRun = (run: FieldAnnotationRun, context: RunRenderContext): HTMLElement | null => {
  // Handle hidden fields
  if (run.hidden) {
    const hidden = context.doc.createElement('span');
    hidden.style.display = 'none';
    if (run.pmStart != null) hidden.dataset.pmStart = String(run.pmStart);
    if (run.pmEnd != null) hidden.dataset.pmEnd = String(run.pmEnd);
    hidden.dataset.layoutEpoch = String(context.layoutEpoch);
    return hidden;
  }

  // Default styling values (matching super-editor's FieldAnnotationView)
  const defaultBorderColor = '#b015b3';
  const defaultFieldColor = '#980043';

  // Create outer annotation wrapper
  const annotation = context.doc.createElement('span');
  annotation.classList.add(DOM_CLASS_NAMES.ANNOTATION);
  annotation.setAttribute('aria-label', 'Field annotation');

  // Apply pill styling (unless highlighted is explicitly false)
  const showHighlight = run.highlighted !== false;
  if (showHighlight) {
    const borderColor = run.borderColor || defaultBorderColor;
    annotation.style.border = `2px solid ${borderColor}`;
    annotation.style.borderRadius = '2px';
    annotation.style.padding = '1px 2px';
    annotation.style.boxSizing = 'border-box';

    // Apply background color with alpha
    const fieldColor = run.fieldColor || defaultFieldColor;
    // Add alpha to make it semi-transparent (matching super-editor's behavior)
    const bgColor = fieldColor.length === 7 ? `${fieldColor}33` : fieldColor;
    // textHighlight takes precedence over fieldColor
    if (run.textHighlight) {
      annotation.style.backgroundColor = run.textHighlight;
    } else {
      annotation.style.backgroundColor = bgColor;
    }
  }

  // Apply visibility
  if (run.visibility === 'hidden') {
    annotation.style.visibility = 'hidden';
  }

  // Apply explicit size if present
  if (run.size) {
    if (run.size.width) {
      const requiresImage = run.variant === 'image' || run.variant === 'signature';
      if (!requiresImage || run.imageSrc) {
        annotation.style.width = `${run.size.width}px`;
        annotation.style.display = 'inline-block';
        annotation.style.overflow = 'hidden';
      }
    }
    if (run.size.height && run.variant !== 'html') {
      const requiresImage = run.variant === 'image' || run.variant === 'signature';
      if (!requiresImage || run.imageSrc) {
        annotation.style.height = `${run.size.height}px`;
      }
    }
  }

  // Apply typography to the annotation element.
  // Always set a font-size so the annotation never inherits fontSize: 0 from
  // the line container (which zeroes it to eliminate the CSS strut). When the
  // run has no explicit fontSize, fall back to BROWSER_DEFAULT_FONT_SIZE (the
  // browser default that was previously inherited before the strut fix).
  {
    // Paint the physical render family (a per-document fonts.map or the bundled substitute) - the
    // same family measurement uses - so pill glyphs match the measured width. Set unconditionally:
    // a fontless annotation falls back to the SAME 'Arial, sans-serif' default the measure path
    // resolves (measuring/dom field-annotation measure), so the pill paints one deterministic family
    // instead of inheriting host CSS and disagreeing with its measured width. Falls back to the
    // global resolver when the render context has none (e.g. context-free paint in tests).
    const resolvePhysical = context.resolvePhysical ?? resolvePhysicalFamily;
    annotation.style.fontFamily = resolvePhysical(run.fontFamily || 'Arial, sans-serif', {
      weight: run.bold ? '700' : '400',
      style: run.italic ? 'italic' : 'normal',
    });
  }
  {
    const fontSize = run.fontSize
      ? typeof run.fontSize === 'number'
        ? `${run.fontSize}pt`
        : run.fontSize
      : BROWSER_DEFAULT_FONT_SIZE;
    annotation.style.fontSize = fontSize;
  }
  if (run.textColor) {
    annotation.style.color = run.textColor;
  }
  if (run.bold) {
    annotation.style.fontWeight = 'bold';
  }
  if (run.italic) {
    annotation.style.fontStyle = 'italic';
  }
  if (run.underline) {
    annotation.style.textDecoration = 'underline';
  }

  // Apply z-index for proper layering
  annotation.style.zIndex = '1';

  // Create inner content wrapper
  const content = context.doc.createElement('span');
  content.classList.add(DOM_CLASS_NAMES.ANNOTATION_CONTENT);
  content.style.pointerEvents = 'none';
  content.setAttribute('contenteditable', 'false');

  // Render type-specific content
  switch (run.variant) {
    case 'image':
    case 'signature': {
      if (run.imageSrc) {
        const img = context.doc.createElement('img');
        // SECURITY: Validate data URLs
        const isDataUrl = run.imageSrc.startsWith('data:');
        if (isDataUrl) {
          if (isValidImageDataUrl(run.imageSrc)) {
            img.src = run.imageSrc;
          } else {
            // Invalid data URL - fall back to displayLabel
            content.textContent = run.displayLabel;
            break;
          }
        } else {
          const sanitized = sanitizeHref(run.imageSrc);
          if (sanitized) {
            img.src = sanitized.href;
          } else {
            content.textContent = run.displayLabel;
            break;
          }
        }
        img.alt = run.displayLabel;
        img.style.height = 'auto';
        img.style.maxWidth = '100%';
        img.style.pointerEvents = 'none';
        img.style.verticalAlign = 'middle';
        if (run.variant === 'signature') {
          img.style.maxHeight = '28px';
        }
        content.appendChild(img);
        annotation.style.display = 'inline-block';
        content.style.display = 'inline-block';
        // Prevent line-height inheritance from the line container from breaking image layout.
        annotation.style.lineHeight = 'normal';
        content.style.lineHeight = 'normal';
      } else {
        content.textContent = run.displayLabel || (run.variant === 'signature' ? 'Signature' : '');
      }
      break;
    }

    case 'link': {
      if (run.linkUrl) {
        const link = context.doc.createElement('a');
        const sanitized = sanitizeHref(run.linkUrl);
        if (sanitized) {
          link.href = sanitized.href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = run.linkUrl;
          link.style.textDecoration = 'none';
          content.style.pointerEvents = 'all';
          content.appendChild(link);
        } else {
          content.textContent = run.displayLabel;
        }
      } else {
        content.textContent = run.displayLabel;
      }
      break;
    }

    case 'html': {
      if (run.rawHtml && typeof run.rawHtml === 'string') {
        // Note: rawHtml is expected to be sanitized upstream.
        content.innerHTML = run.rawHtml.trim();
        annotation.style.display = 'inline-block';
        content.style.display = 'inline-block';
        // Prevent line-height inheritance from the line container from affecting HTML layout.
        annotation.style.lineHeight = 'normal';
        content.style.lineHeight = 'normal';
      } else {
        content.textContent = run.displayLabel;
      }
      break;
    }

    case 'text':
    case 'checkbox':
    default: {
      content.textContent = run.displayLabel;
      break;
    }
  }

  annotation.appendChild(content);

  // Apply data attributes for field tracking
  annotation.dataset.type = run.variant;
  annotation.dataset.displayLabel = run.displayLabel;
  if (run.fieldId) {
    annotation.dataset.fieldId = run.fieldId;
  }
  if (run.fieldType) {
    annotation.dataset.fieldType = run.fieldType;
  }

  // Assert PM positions are present for cursor fallback
  assertPmPositions(run, 'field annotation run');

  // Apply PM position tracking
  if (run.pmStart != null) {
    annotation.dataset.pmStart = String(run.pmStart);
  }
  if (run.pmEnd != null) {
    annotation.dataset.pmEnd = String(run.pmEnd);
  }
  annotation.dataset.layoutEpoch = String(context.layoutEpoch);

  // Apply SDT metadata
  context.applySdtDataset(annotation, run.sdt);

  return annotation;
};
