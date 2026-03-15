export type ListRendering = {
  markerText?: string;
  numberingType?: string;
  path?: number[];
  customFormat?: string;
};

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

export const getListOrdinalFromPath = (path: unknown): number | undefined => {
  if (!Array.isArray(path) || path.length === 0) return undefined;
  const ordinal = toFiniteNumber(path[path.length - 1]);
  return ordinal != null && ordinal > 0 ? ordinal : undefined;
};

export const getListRendering = (value: unknown): ListRendering | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const attrs = value as Record<string, unknown>;
  const markerText = typeof attrs.markerText === 'string' ? attrs.markerText : undefined;
  const numberingType = typeof attrs.numberingType === 'string' ? attrs.numberingType : undefined;
  const customFormat = typeof attrs.customFormat === 'string' ? attrs.customFormat : undefined;
  const path = Array.isArray(attrs.path)
    ? attrs.path.map(toFiniteNumber).filter((entry): entry is number => entry != null)
    : undefined;

  if (!markerText && !numberingType && (!path || path.length === 0)) {
    return undefined;
  }

  return {
    markerText,
    numberingType,
    ...(path && path.length > 0 ? { path } : {}),
    ...(customFormat ? { customFormat } : {}),
  };
};
