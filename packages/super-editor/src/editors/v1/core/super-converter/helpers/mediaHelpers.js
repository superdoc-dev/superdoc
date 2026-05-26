export const sanitizeDocxMediaName = (value, fallback = 'image') => {
  if (!value) return fallback;

  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, '_');
  return sanitized || fallback;
};

export const getImageExtensionFromMimeType = (mimeType) => {
  const [, subtype] = String(mimeType || '').split('/');
  if (!subtype) return null;

  return subtype.toLowerCase() === 'svg+xml' ? 'svg' : subtype.toLowerCase();
};

export const getDataUriMetadata = (src = '') => {
  if (typeof src !== 'string' || !src.startsWith('data:')) return null;

  const commaIndex = src.indexOf(',');
  const hasPayloadSeparator = commaIndex !== -1;
  const metadata = src.slice(5, hasPayloadSeparator ? commaIndex : undefined);
  const payload = hasPayloadSeparator ? src.slice(commaIndex + 1) : '';
  const [rawMimeType = '', ...parameters] = metadata.split(';');
  const mimeType = rawMimeType.toLowerCase();

  return {
    hasPayloadSeparator,
    metadata,
    payload,
    rawMimeType,
    mimeType,
    parameters,
    isBase64: parameters.some((part) => part.toLowerCase() === 'base64'),
    extension: getImageExtensionFromMimeType(mimeType),
  };
};

export const getFallbackImageNameFromDataUri = (src = '', fallback = 'image') => {
  const extension = getDataUriMetadata(src)?.extension;

  return extension ? `${fallback}.${extension}` : fallback;
};
