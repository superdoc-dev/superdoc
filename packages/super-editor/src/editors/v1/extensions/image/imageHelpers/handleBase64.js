// @ts-check
import { getDataUriMetadata, tryDecodeDataUriText } from '@superdoc/url-validation';
import { simpleStringHash } from '@core/utilities/hash.js';

const DEFAULT_MIME_TYPE = 'application/octet-stream';

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

const getImageExtensionFromMimeType = (mimeType) => {
  const normalizedMimeType = String(mimeType || '').toLowerCase();
  if (MIME_TYPE_TO_EXTENSION[normalizedMimeType]) return MIME_TYPE_TO_EXTENSION[normalizedMimeType];

  const [type, subtype] = normalizedMimeType.split('/');
  if (type !== 'image' || !subtype) return null;

  return subtype;
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

const binaryStringToBytes = (binaryString) => {
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

/**
 * Extract metadata from a data URI string.
 * @param {string} dataUri - The data URI string.
 * @returns {Object} An object containing mimeType, binaryString, and filename.
 */
const extractBase64Meta = (dataUri) => {
  const metadata = getDataUriMetadata(dataUri);
  if (!metadata?.hasPayloadSeparator) return null;

  const rawMimeType = metadata?.rawMimeType || '';
  const mimeType = rawMimeType || DEFAULT_MIME_TYPE;
  const isBase64 = Boolean(metadata?.isBase64);
  const payload = metadata?.payload || '';
  const binaryString = isBase64 ? decodeBase64ToBinaryString(payload) : tryDecodeDataUriText(payload);
  if (binaryString == null) return null;

  const hash = simpleStringHash(binaryString);
  const extension = getImageExtensionFromMimeType(metadata?.mimeType) || 'bin';
  const filename = `image-${hash}.${extension}`;

  return { mimeType, binaryString, filename, isBase64 };
};

export const getBase64FileMeta = (dataUri) => {
  const meta = extractBase64Meta(dataUri);
  if (!meta) return { mimeType: DEFAULT_MIME_TYPE, filename: 'image-0.bin' };

  const { mimeType, filename } = meta;
  return { mimeType, filename };
};

export const base64ToFile = (dataUri) => {
  const meta = extractBase64Meta(dataUri);
  if (!meta) return null;

  const { mimeType, binaryString, filename, isBase64 } = meta;
  const fileType = mimeType || DEFAULT_MIME_TYPE;

  const data = isBase64 ? binaryStringToBytes(binaryString) : binaryString;
  const blob = new Blob([data], { type: fileType });
  return new File([blob], filename, { type: fileType });
};
