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

/**
 * Extract metadata from a base64-encoded string.
 * @param {string} base64String - The base64-encoded string.
 * @returns {Object} An object containing mimeType, binaryString, and filename.
 */
const extractBase64Meta = (base64String) => {
  const [meta = '', payload = ''] = base64String.split(',');
  const mimeMatch = meta.match(/:(.*?);/);
  const rawMimeType = mimeMatch ? mimeMatch[1] : '';
  const mimeType = rawMimeType || DEFAULT_MIME_TYPE;
  const binaryString = decodeBase64ToBinaryString(payload);
  const hash = simpleHash(binaryString);
  const extension = mimeType.split('/')[1] || 'bin';
  const filename = `image-${hash}.${extension}`;

  return { mimeType, binaryString, filename };
};

export const getBase64FileMeta = (base64String) => {
  const { mimeType, filename } = extractBase64Meta(base64String);
  return { mimeType, filename };
};

export const base64ToFile = (base64String) => {
  const { mimeType, binaryString, filename } = extractBase64Meta(base64String);
  const fileType = mimeType || DEFAULT_MIME_TYPE;

  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const blob = new Blob([bytes], { type: fileType });
  return new File([blob], filename, { type: fileType });
};
