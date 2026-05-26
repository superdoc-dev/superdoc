export const sanitizeDocxMediaName = (value, fallback = 'image') => {
  if (!value) return fallback;

  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, '_');
  return sanitized || fallback;
};

const MIME_TYPE_TO_EXTENSION = {
  'image/svg+xml': 'svg',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/tiff': 'tif',
  'image/tif': 'tif',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/ico': 'ico',
};

export const getImageExtensionFromMimeType = (mimeType) => {
  const normalizedMimeType = String(mimeType || '').toLowerCase();
  if (MIME_TYPE_TO_EXTENSION[normalizedMimeType]) return MIME_TYPE_TO_EXTENSION[normalizedMimeType];

  const [, subtype] = normalizedMimeType.split('/');
  if (!subtype) return null;

  return subtype;
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
    payload,
    rawMimeType,
    mimeType,
    isBase64: parameters.some((part) => part.toLowerCase() === 'base64'),
    extension: getImageExtensionFromMimeType(mimeType),
  };
};

export const getFallbackImageNameFromDataUri = (src = '', fallback = 'image') => {
  const extension = getDataUriMetadata(src)?.extension;

  return extension ? `${fallback}.${extension}` : fallback;
};
