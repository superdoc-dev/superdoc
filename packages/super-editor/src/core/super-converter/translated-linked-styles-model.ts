import type {
  StylesDocumentProperties,
  StyleDefinition,
  LatentStyles,
  LsdException,
  DocDefaults,
} from '@superdoc/style-engine/ooxml';

export type TranslatedLinkedStylesModel = StylesDocumentProperties;

export interface ConverterWithTranslatedLinkedStyles {
  translatedLinkedStyles?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeBranch<T extends object>(value: unknown): T {
  return (isPlainObject(value) ? value : {}) as T;
}

/**
 * Coerce a styles branch to an array.
 *
 * Handles both the canonical array shape and the legacy keyed-object shape
 * (`{ Normal: {...}, Heading1: {...} }`). The latter is converted via
 * `Object.values()` so existing definitions are preserved.
 */
function normalizeStylesArray(value: unknown): StyleDefinition[] {
  if (Array.isArray(value)) return value;
  if (isPlainObject(value) && Object.keys(value).length > 0) {
    return Object.values(value) as StyleDefinition[];
  }
  return [];
}

/**
 * Coerce an lsdExceptions branch to an array.
 *
 * Handles both the canonical array shape and the legacy keyed-object shape
 * (`{ NoList: {...}, Normal: {...} }`).
 */
function normalizeLsdExceptionsArray(value: unknown): LsdException[] {
  if (Array.isArray(value)) return value;
  if (isPlainObject(value) && Object.keys(value).length > 0) {
    return Object.values(value) as LsdException[];
  }
  return [];
}

function normalizeLatentStyles(value: unknown): LatentStyles {
  if (!isPlainObject(value)) return { lsdExceptions: [] };
  return {
    ...value,
    lsdExceptions: normalizeLsdExceptionsArray(value.lsdExceptions),
  } as LatentStyles;
}

/**
 * Type guard that checks whether a value conforms to the canonical
 * `TranslatedLinkedStylesModel` shape.
 */
export function isTranslatedLinkedStylesModel(value: unknown): value is TranslatedLinkedStylesModel {
  if (!isPlainObject(value)) return false;
  if (!isPlainObject(value.docDefaults)) return false;
  if (!isPlainObject(value.latentStyles)) return false;
  if (!Array.isArray((value.latentStyles as Record<string, unknown>).lsdExceptions)) return false;
  if (!Array.isArray(value.styles)) return false;
  return true;
}

/**
 * Normalize unknown translatedLinkedStyles data into the canonical style-engine shape.
 */
export function normalizeTranslatedLinkedStyles(value: unknown): TranslatedLinkedStylesModel {
  const source = isPlainObject(value) ? value : {};

  return {
    ...(source as Record<string, unknown>),
    docDefaults: normalizeBranch<DocDefaults>(source.docDefaults),
    latentStyles: normalizeLatentStyles(source.latentStyles),
    styles: normalizeStylesArray(source.styles),
  } as TranslatedLinkedStylesModel;
}

/**
 * Ensure converter.translatedLinkedStyles is present and normalized in-place.
 *
 * If the value already conforms to the canonical shape, returns it as-is
 * without replacing the reference on the converter. This avoids side-effects
 * on read-only code paths (dry-run, no-op checks).
 */
export function ensureTranslatedLinkedStylesModel(
  converter: ConverterWithTranslatedLinkedStyles,
): TranslatedLinkedStylesModel {
  if (isTranslatedLinkedStylesModel(converter.translatedLinkedStyles)) {
    return converter.translatedLinkedStyles;
  }

  const model = normalizeTranslatedLinkedStyles(converter.translatedLinkedStyles);
  converter.translatedLinkedStyles = model;
  return model;
}
