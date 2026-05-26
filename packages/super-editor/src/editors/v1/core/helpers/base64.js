/** Latin-1 / "binary" string -> base64 (browser `btoa`, else Node `Buffer`). */
function binaryStringToBase64(binary) {
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(binary);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(binary, 'latin1').toString('base64');
  }
  throw new Error('[base64] encode requires btoa (browser) or Buffer (Node)');
}

/** base64 -> Latin-1 / "binary" string (browser `atob`, else Node `Buffer`). */
function base64ToBinaryString(b64) {
  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(b64);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64').toString('latin1');
  }
  throw new Error('[base64] decode requires atob (browser) or Buffer (Node)');
}

/**
 * UTF-8 string -> base64. Same idea as `btoa(unescape(encodeURIComponent(s)))` without `unescape`.
 * @param {string} input
 */
export function encodeUtf8Base64(input) {
  const binary = encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  return binaryStringToBase64(binary);
}

/**
 * base64 -> UTF-8 string. Decodes bytes then UTF-8 via percent-encoding.
 * @param {string} b64
 */
export function decodeUtf8Base64(b64) {
  if (!b64) return '';
  try {
    const bin = base64ToBinaryString(b64);
    let pct = '';
    for (let i = 0; i < bin.length; i += 1) {
      pct += `%${bin.charCodeAt(i).toString(16).padStart(2, '0')}`;
    }
    return decodeURIComponent(pct);
  } catch {
    return '';
  }
}
