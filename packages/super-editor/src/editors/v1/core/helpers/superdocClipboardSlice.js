/**
 * Clipboard slice embedding in HTML (copy/paste). In the browser uses `DOMParser` and `btoa`/`atob`;
 * in Node (tests) uses `Buffer` for base64 when `btoa`/`atob` are missing.
 */
import { getSectPrColumns } from '../super-converter/section-properties.js';

export const SUPERDOC_SLICE_MIME = 'application/x-superdoc-slice';
/** JSON map of package-relative image path → display URL (data URL, https, or blob URL). */
export const SUPERDOC_MEDIA_MIME = 'application/x-superdoc-media';
export const SUPERDOC_SLICE_ATTR = 'data-superdoc-slice';
export const SUPERDOC_BODY_SECT_PR_ATTR = 'data-sd-body-sect-pr';

/**
 * Walk a ProseMirror Slice JSON object and collect `editor.storage.image.media`
 * entries for every image `attrs.src` in the slice. Needed for SuperDoc→SuperDoc
 * paste: slice JSON only carries paths like `word/media/…`, not the bytes/URLs.
 *
 * @param {string} sliceJsonString
 * @param {object} editor
 * @returns {string} JSON string or '' if nothing to ship
 */
export function collectReferencedImageMediaForClipboard(sliceJsonString, editor) {
  if (!sliceJsonString || !editor?.storage?.image?.media) return '';

  let slice;
  try {
    slice = JSON.parse(sliceJsonString);
  } catch {
    return '';
  }

  const source = editor.storage.image.media;
  const out = {};

  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'image') {
      const src = node.attrs?.src;
      if (typeof src === 'string' && src.length > 0) {
        const val = source[src];
        if (typeof val === 'string' && val.length > 0) {
          out[src] = val;
        }
      }
    }
    const { content } = node;
    if (Array.isArray(content)) {
      for (const child of content) visit(child);
    }
  };

  if (Array.isArray(slice.content)) {
    for (const node of slice.content) visit(node);
  }

  return Object.keys(out).length > 0 ? JSON.stringify(out) : '';
}

/**
 * @param {object} editor
 * @param {DataTransfer | null | undefined} clipboardData
 */
export function mergeSuperdocClipboardMediaIntoEditor(editor, clipboardData) {
  if (!editor?.storage?.image) return;
  const raw = clipboardData?.getData?.(SUPERDOC_MEDIA_MIME);
  if (!raw || typeof raw !== 'string') return;

  let map;
  try {
    map = JSON.parse(raw);
  } catch {
    return;
  }
  if (!map || typeof map !== 'object') return;

  if (!editor.storage.image.media) {
    editor.storage.image.media = {};
  }

  const yMedia = editor.options?.ydoc?.getMap?.('media');

  for (const [path, data] of Object.entries(map)) {
    if (typeof path !== 'string' || !path || typeof data !== 'string' || !data) continue;
    editor.storage.image.media[path] = data;
    yMedia?.set?.(path, data);
  }
}

/** Latin-1 / “binary” string → base64 (browser `btoa`, else Node `Buffer`). */
function binaryStringToBase64(binary) {
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(binary);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(binary, 'latin1').toString('base64');
  }
  throw new Error('[superdocClipboardSlice] base64 encode requires btoa (browser) or Buffer (Node)');
}

/** base64 → Latin-1 / “binary” string (browser `atob`, else Node `Buffer`). */
function base64ToBinaryString(b64) {
  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(b64);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64').toString('latin1');
  }
  throw new Error('[superdocClipboardSlice] base64 decode requires atob (browser) or Buffer (Node)');
}

/**
 * UTF-8 string → base64. Same idea as `btoa(unescape(encodeURIComponent(s)))` without `unescape`.
 * @param {string} input
 */
function encodeUtf8Base64(input) {
  const binary = encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  return binaryStringToBase64(binary);
}

/**
 * base64 → UTF-8 string. Decodes bytes then UTF-8 via percent-encoding.
 * @param {string} b64
 */
function decodeUtf8Base64(b64) {
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

export function bodySectPrShouldEmbed(bodySectPr) {
  if (!bodySectPr || typeof bodySectPr !== 'object') return false;
  const cols = getSectPrColumns(bodySectPr);
  return !!(cols?.count && cols.count > 1);
}

/** Embeds PM slice (base64 in element text) and optional body sectPr for multi-column paste. */
export function embedSliceInHtml(html, sliceJson, bodySectPrJson = '') {
  let out = html;
  if (bodySectPrJson) {
    const body64 = encodeUtf8Base64(bodySectPrJson);
    out = `<div ${SUPERDOC_BODY_SECT_PR_ATTR} style="display:none">${body64}</div>${out}`;
  }
  if (!sliceJson) return out;
  const base64 = encodeUtf8Base64(sliceJson);
  return `<div ${SUPERDOC_SLICE_ATTR} style="display:none">${base64}</div>${out}`;
}

/**
 * Reads slice JSON from HTML produced by {@link embedSliceInHtml} (hidden div + base64 text).
 */
export function extractSliceFromHtml(html) {
  if (!html || !html.includes(SUPERDOC_SLICE_ATTR)) return null;
  if (typeof DOMParser === 'undefined') return null;

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const el = doc.querySelector(`[${SUPERDOC_SLICE_ATTR}]`);
    if (!el) return null;

    let b64 = el.textContent?.trim() ?? '';
    if (!b64) {
      b64 = el.getAttribute(SUPERDOC_SLICE_ATTR)?.trim() ?? '';
    }
    if (!b64) return null;

    const decoded = decodeUtf8Base64(b64);
    return decoded || null;
  } catch {
    return null;
  }
}

export function stripSliceFromHtml(html) {
  if (!html) return html;
  let out = html;
  if (out.includes(SUPERDOC_SLICE_ATTR)) {
    out = out.replace(/<div[^>]*data-superdoc-slice[^>]*>[\s\S]*?<\/div>/gi, '');
  }
  if (out.includes(SUPERDOC_BODY_SECT_PR_ATTR)) {
    out = out.replace(/<div[^>]*data-sd-body-sect-pr[^>]*>[\s\S]*?<\/div>/gi, '');
  }
  return out;
}

export function extractBodySectPrFromHtml(html) {
  if (!html || !html.includes(SUPERDOC_BODY_SECT_PR_ATTR)) return null;
  if (typeof DOMParser === 'undefined') return null;

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const el = doc.querySelector(`[${SUPERDOC_BODY_SECT_PR_ATTR}]`);
    if (!el) return null;
    const b64 = el.textContent?.trim() ?? '';
    if (!b64) return null;
    return JSON.parse(decodeUtf8Base64(b64));
  } catch {
    return null;
  }
}
