import type { Run } from '@superdoc/contracts';

export const fieldAnnotationKey = (run: Run): string => {
  if (run.kind !== 'fieldAnnotation') return '';
  const annotation = run as Run & {
    variant?: string;
    displayLabel?: string;
    imageSrc?: string | null;
    rawHtml?: string | null;
    linkUrl?: string | null;
    size?: { width?: number; height?: number } | null;
    fontFamily?: string | null;
    fontSize?: string | number | null;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    highlighted?: boolean;
    hidden?: boolean;
    visibility?: string;
  };
  const sizeKey = annotation.size ? `${annotation.size.width ?? ''}x${annotation.size.height ?? ''}` : '';
  const highlightKey = annotation.highlighted === false ? 'nohl' : 'hl';
  const hiddenKey = annotation.hidden ? 'hidden' : '';
  return [
    annotation.variant ?? '',
    annotation.displayLabel ?? '',
    annotation.imageSrc ?? '',
    annotation.rawHtml ?? '',
    annotation.linkUrl ?? '',
    annotation.fontFamily ?? '',
    annotation.fontSize ?? '',
    annotation.bold ? 'b' : '',
    annotation.italic ? 'i' : '',
    annotation.underline ? 'u' : '',
    highlightKey,
    hiddenKey,
    annotation.visibility ?? '',
    sizeKey,
  ].join('|');
};
