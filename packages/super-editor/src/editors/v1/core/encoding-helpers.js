/**
 * Quick check for .xml / .rels
 * @param {string} name
 * @returns {boolean} True if the name has a .xml or .rels extension
 */
export const isXmlLike = (name) => /\.xml$|\.rels$/i.test(name);

/**
 * Hex dump for optional debugging
 * @param {Uint8Array|ArrayBuffer} bytes
 * @param {number} n
 * @returns {string} Hex dump
 */
export function hex(bytes, n = 32) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(u8.slice(0, n))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}

/**
 * Try to detect encoding by BOM / null density
 * @param {Uint8Array} u8
 * @returns {string} Detected encoding
 */
export function sniffEncoding(u8) {
  if (u8.length >= 2) {
    const b0 = u8[0],
      b1 = u8[1];
    if (b0 === 0xff && b1 === 0xfe) return 'utf-16le';
    if (b0 === 0xfe && b1 === 0xff) return 'utf-16be';
  }
  // Heuristic: lots of NULs near the start → likely UTF-16
  let nul = 0;
  for (let i = 0; i < Math.min(64, u8.length); i++) if (u8[i] === 0) nul++;
  if (nul > 16) return 'utf-16le';
  return 'utf-8';
}

/**
 * Remove leading BOM from already-decoded JS string
 * @param {string} str
 * @returns {string} Cleaned string without BOM
 */
export function stripBOM(str) {
  return str && str.charCodeAt(0) === 0xfeff ? str.slice(1) : str;
}

/**
 * Decode XML/RELS content to a clean JS string.
 * Accepts: string | Uint8Array | ArrayBuffer
 * @param {string|Uint8Array|ArrayBuffer} content
 * @returns {string} Clean XML string
 */
export function ensureXmlString(content) {
  if (typeof content === 'string') return stripBOM(content);

  // Accept: Buffer, Uint8Array, DataView, any TypedArray, or ArrayBuffer
  let u8 = null;

  if (content && typeof content === 'object') {
    if (content instanceof Uint8Array) {
      u8 = content;
    } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(content)) {
      // Node Buffer
      u8 = new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
    } else if (ArrayBuffer.isView && ArrayBuffer.isView(content)) {
      // Any ArrayBufferView: DataView or other TypedArray
      u8 = new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
    } else if (content.constructor && (content instanceof ArrayBuffer || content.constructor.name === 'ArrayBuffer')) {
      u8 = new Uint8Array(content);
    }
  }

  if (!u8) throw new Error('Unsupported content type for XML');

  const enc = sniffEncoding(u8);
  let xml = new TextDecoder(enc).decode(u8);
  xml = stripBOM(xml);

  // After converting from non-UTF-8 to a JS string, the XML declaration's
  // encoding attribute is stale (e.g. encoding="utf-16"). The output will
  // be serialized as UTF-8, so update or remove the declaration to match.
  if (enc !== 'utf-8') {
    xml = xml.replace(/(<\?xml\b[^?]*?)\bencoding\s*=\s*["'][^"']*["']/i, '$1encoding="UTF-8"');
  }

  return xml;
}
