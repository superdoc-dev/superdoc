const MIME_TYPES = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  zip: 'application/zip',
  html: 'text/html',
  txt: 'text/plain;charset=utf-8',
  json: 'application/json',
};

const getMimeType = (extension) => {
  if (!extension || typeof extension.toLowerCase !== 'function') return 'application/octet-stream';
  return MIME_TYPES[extension.toLowerCase()] || 'application/octet-stream';
};

const ensureBlob = (data, extension) => {
  if (data instanceof Blob) return data;

  const mimeType = getMimeType(extension);

  if (data instanceof ArrayBuffer) {
    return new Blob([data], { type: mimeType });
  }

  if (ArrayBuffer.isView(data)) {
    const { buffer, byteOffset, byteLength } = data;
    const slice = buffer.slice(byteOffset, byteOffset + byteLength);
    return new Blob([slice], { type: mimeType });
  }

  if (typeof data === 'string') {
    return new Blob([data], { type: mimeType });
  }

  if (data == null) {
    throw new TypeError('createDownload requires a Blob, ArrayBuffer, or ArrayBufferView.');
  }

  throw new TypeError(`Cannot create download from value of type ${typeof data}`);
};

/**
 * Create a download link for a blob
 *
 * @param {Blob|ArrayBuffer|ArrayBufferView|string} data The data to download
 * @param {string} name The name of the file
 * @param {string} extension The extension of the file
 * @returns {Blob} The blob that was used for the download.
 */
export const createDownload = (data, name, extension) => {
  const blob = ensureBlob(data, extension);

  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return blob;
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return blob;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.${extension}`;

  // Some browsers require the link to be in the DOM for the click to trigger.
  const shouldAppend = document.body && typeof document.body.appendChild === 'function';
  if (shouldAppend) document.body.appendChild(a);

  a.click();

  if (shouldAppend) document.body.removeChild(a);

  if (typeof URL.revokeObjectURL === 'function') {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return blob;
};

/**
 * Generate a filename safe string
 *
 * @param {string} currentName The current name of the file
 * @returns {string} The cleaned name
 */
export const cleanName = (currentName) => {
  const lowerName = currentName.toLowerCase();
  if (lowerName.endsWith('.docx')) {
    return currentName.slice(0, -5);
  }
  if (lowerName.endsWith('.pdf')) {
    return currentName.slice(0, -4);
  }
  return currentName;
};
