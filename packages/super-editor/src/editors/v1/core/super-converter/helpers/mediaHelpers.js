import {
  getDataUriMetadata as getSharedDataUriMetadata,
  tryDecodeDataUriText as tryDecodeSharedDataUriText,
} from '@superdoc/url-validation';

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

  const [type, subtype] = normalizedMimeType.split('/');
  if (type !== 'image' || !subtype) return null;

  return subtype;
};

export const getDataUriMetadata = (src = '') => {
  const metadata = getSharedDataUriMetadata(src);
  if (!metadata) return null;

  return {
    ...metadata,
    extension: getImageExtensionFromMimeType(metadata.mimeType),
  };
};

export const tryDecodeDataUriText = (payload) => tryDecodeSharedDataUriText(payload);

export const getFallbackImageNameFromDataUri = (src = '', fallback = 'image') => {
  const extension = getDataUriMetadata(src)?.extension;

  return extension ? `${fallback}.${extension}` : fallback;
};
