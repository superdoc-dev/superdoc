// @ts-check
const DEFAULT_MIME_TYPE = 'application/octet-stream';

/**
 * Generates a simple hash from a string.
 * @param {string} str - The input string.
 * @returns {string} The generated hash.
 */
const simpleHash = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString();
};

/**
 * Decodes a base64-encoded string into a binary string.
 * @param {string} data - The base64-encoded string.
 * @returns {string} The decoded binary string.
 */
const decodeBase64ToBinaryString = (data) => {
  if (!data) return '';

  if (typeof atob === 'function') {
    return atob(data);
  }

  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(data, 'base64').toString('binary');
  }

  throw new Error('Unable to decode base64 payload in the current environment.');
};

const decodeDataUriText = (data) => {
  try {
    return decodeURIComponent(data);
  } catch {
    return data;
  }
};

const binaryStringToBytes = (binaryString) => {
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const splitDataUri = (dataUri) => {
  const separatorIndex = dataUri.indexOf(',');
  if (separatorIndex === -1) {
    return { meta: dataUri, payload: '' };
  }

  return {
    meta: dataUri.slice(0, separatorIndex),
    payload: dataUri.slice(separatorIndex + 1),
  };
};

/**
 * Extract metadata from a data URI string.
 * @param {string} dataUri - The data URI string.
 * @returns {Object} An object containing mimeType, binaryString, and filename.
 */
const extractBase64Meta = (dataUri) => {
  const { meta = '', payload = '' } = splitDataUri(dataUri);
  const metaParts = meta.startsWith('data:') ? meta.slice(5).split(';') : [];
  const rawMimeType = metaParts[0] || '';
  const mimeType = rawMimeType || DEFAULT_MIME_TYPE;
  const isBase64 = metaParts.some((part) => part.toLowerCase() === 'base64');
  const binaryString = isBase64 ? decodeBase64ToBinaryString(payload) : decodeDataUriText(payload);
  const hash = simpleHash(binaryString);
  const normalizedMimeType = mimeType.toLowerCase();
  const extension = normalizedMimeType === 'image/svg+xml' ? 'svg' : normalizedMimeType.split('/')[1] || 'bin';
  const filename = `image-${hash}.${extension}`;

  return { mimeType, binaryString, filename, isBase64 };
};

export const getBase64FileMeta = (dataUri) => {
  const { mimeType, filename } = extractBase64Meta(dataUri);
  return { mimeType, filename };
};

export const base64ToFile = (dataUri) => {
  const { mimeType, binaryString, filename, isBase64 } = extractBase64Meta(dataUri);
  const fileType = mimeType || DEFAULT_MIME_TYPE;

  const data = isBase64 ? binaryStringToBytes(binaryString) : binaryString;
  const blob = new Blob([data], { type: fileType });
  return new File([blob], filename, { type: fileType });
};
