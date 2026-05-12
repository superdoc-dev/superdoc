import type { SectionHeaderFooterVariant } from '@superdoc/document-api';

const VALID_VARIANTS: ReadonlySet<string> = new Set(['default', 'first', 'even']);

/**
 * Normalize a rendered section type to the OOXML header/footer variant name.
 */
export function normalizeVariant(sectionType: string): SectionHeaderFooterVariant {
  if (sectionType === 'odd') return 'default';
  if (!VALID_VARIANTS.has(sectionType)) {
    throw new Error(`Unrecognized header/footer variant: "${sectionType}". Expected default, first, or even.`);
  }
  return sectionType as SectionHeaderFooterVariant;
}
