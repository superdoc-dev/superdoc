import type { FieldAnnotationRun, FieldAnnotationMetadata } from '@superdoc/contracts';
import type { PMNode } from '../../types.js';
import { type InlineConverterParams } from './common';
import { resolveNodeSdtMetadata } from '../../sdt/index.js';

/**
 * Converts a ProseMirror fieldAnnotation node into a FieldAnnotationRun for layout engine rendering.
 *
 * Field annotations are inline "pill" elements that display form fields or placeholders.
 * They render with distinctive styling (border, background, rounded corners) and can
 * contain different content types (text, image, signature, etc.).
 *
 * @param params - Inline converter parameters
 * @param params.node - FieldAnnotation PM node with attrs containing field configuration
 * @param params.positions - Position map for ProseMirror node tracking (pmStart/pmEnd)
 * @returns FieldAnnotationRun object with all extracted properties
 */
export function fieldAnnotationNodeToRun({ node, positions }: InlineConverterParams): FieldAnnotationRun {
  const fieldMetadata = resolveNodeSdtMetadata(node, 'fieldAnnotation') as FieldAnnotationMetadata | null;

  // If there's inner content, extract text to use as displayLabel override
  let contentText: string | undefined;
  if (Array.isArray(node.content) && node.content.length > 0) {
    const extractText = (n: PMNode): string => {
      if (n.type === 'text' && typeof n.text === 'string') return n.text;
      if (Array.isArray(n.content)) {
        return n.content.map(extractText).join('');
      }
      return '';
    };
    contentText = node.content.map(extractText).join('');
  }

  // Create the FieldAnnotationRun (handles displayLabel fallback chain internally)
  // If we have contentText, temporarily override displayLabel in attrs
  const nodeForRun =
    contentText && contentText.length > 0
      ? { ...node, attrs: { ...(node.attrs ?? {}), displayLabel: contentText } }
      : node;
  const attrs = (nodeForRun.attrs ?? {}) as Record<string, unknown>;

  // Determine variant (defaults to 'text')
  const rawVariant = attrs.type ?? fieldMetadata?.variant ?? 'text';
  const validVariants = ['text', 'image', 'signature', 'checkbox', 'html', 'link'] as const;
  const variant: FieldAnnotationRun['variant'] = validVariants.includes(rawVariant as (typeof validVariants)[number])
    ? (rawVariant as FieldAnnotationRun['variant'])
    : 'text';

  // Determine display label with fallback chain
  const displayLabel =
    (typeof attrs.displayLabel === 'string' ? attrs.displayLabel : undefined) ||
    (typeof attrs.defaultDisplayLabel === 'string' ? attrs.defaultDisplayLabel : undefined) ||
    (typeof fieldMetadata?.displayLabel === 'string' ? fieldMetadata.displayLabel : undefined) ||
    (typeof fieldMetadata?.defaultDisplayLabel === 'string' ? fieldMetadata.defaultDisplayLabel : undefined) ||
    (typeof attrs.alias === 'string' ? attrs.alias : undefined) ||
    (typeof fieldMetadata?.alias === 'string' ? fieldMetadata.alias : undefined) ||
    '';

  const run: FieldAnnotationRun = {
    kind: 'fieldAnnotation',
    variant,
    displayLabel,
  };

  // Field identification
  const fieldId = typeof attrs.fieldId === 'string' ? attrs.fieldId : fieldMetadata?.fieldId;
  if (fieldId) run.fieldId = fieldId;

  const fieldType = typeof attrs.fieldType === 'string' ? attrs.fieldType : fieldMetadata?.fieldType;
  if (fieldType) run.fieldType = fieldType;

  // Styling
  const fieldColor = typeof attrs.fieldColor === 'string' ? attrs.fieldColor : fieldMetadata?.fieldColor;
  if (fieldColor) run.fieldColor = fieldColor;

  const borderColor = typeof attrs.borderColor === 'string' ? attrs.borderColor : fieldMetadata?.borderColor;
  if (borderColor) run.borderColor = borderColor;

  // Highlighted defaults to true if not explicitly false
  const highlighted = attrs.highlighted ?? fieldMetadata?.highlighted;
  if (highlighted === false) run.highlighted = false;

  // Hidden/visibility
  if (attrs.hidden === true || fieldMetadata?.hidden === true) run.hidden = true;
  const visibility = attrs.visibility ?? fieldMetadata?.visibility;
  if (visibility === 'hidden') run.visibility = 'hidden';

  // Type-specific content
  const imageSrc = typeof attrs.imageSrc === 'string' ? attrs.imageSrc : fieldMetadata?.imageSrc;
  if (imageSrc) run.imageSrc = imageSrc;

  const linkUrl = typeof attrs.linkUrl === 'string' ? attrs.linkUrl : fieldMetadata?.linkUrl;
  if (linkUrl) run.linkUrl = linkUrl;

  const rawHtml = attrs.rawHtml ?? fieldMetadata?.rawHtml;
  if (typeof rawHtml === 'string') run.rawHtml = rawHtml;

  // Sizing
  const size = (attrs.size ?? fieldMetadata?.size) as { width?: number; height?: number } | null | undefined;
  if (size && (typeof size.width === 'number' || typeof size.height === 'number')) {
    run.size = {
      width: typeof size.width === 'number' ? size.width : undefined,
      height: typeof size.height === 'number' ? size.height : undefined,
    };
  }

  // Typography
  const fontFamily = attrs.fontFamily ?? fieldMetadata?.fontFamily;
  if (typeof fontFamily === 'string') run.fontFamily = fontFamily;

  const fontSize = attrs.fontSize ?? fieldMetadata?.fontSize;
  if (typeof fontSize === 'string' || typeof fontSize === 'number') run.fontSize = fontSize;

  const textColor = attrs.textColor ?? fieldMetadata?.textColor;
  if (typeof textColor === 'string') run.textColor = textColor;

  const textHighlight = attrs.textHighlight ?? fieldMetadata?.textHighlight;
  if (typeof textHighlight === 'string') run.textHighlight = textHighlight;

  // Text formatting
  // Prefer explicit attrs on the annotation node; they should override metadata formatting.
  const formatting = fieldMetadata?.formatting;
  if (attrs.bold === true) run.bold = true;
  else if (attrs.bold !== false && formatting?.bold === true) run.bold = true;

  if (attrs.italic === true) run.italic = true;
  else if (attrs.italic !== false && formatting?.italic === true) run.italic = true;

  if (attrs.underline === true) run.underline = true;
  else if (attrs.underline !== false && formatting?.underline === true) run.underline = true;

  // Position tracking
  const pos = positions.get(node);
  if (pos) {
    run.pmStart = pos.start;
    run.pmEnd = pos.end;
  }

  // Attach full SDT metadata if available
  if (fieldMetadata) {
    run.sdt = fieldMetadata;
  }

  return run;
}
