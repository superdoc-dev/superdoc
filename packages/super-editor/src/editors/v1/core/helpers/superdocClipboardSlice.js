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
    if (node.type === 'shapeGroup' && Array.isArray(node.attrs?.shapes)) {
      for (const shape of node.attrs.shapes) {
        const src = shape?.attrs?.src;
        if (typeof src === 'string' && src.length > 0) {
          const val = source[src];
          if (typeof val === 'string' && val.length > 0) {
            out[src] = val;
          }
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
 * @param {string} originalPath
 * @param {Record<string, string>} store
 * @param {Set<string>} reserved keys allocated in this paste batch
 */
function allocateUniqueMediaPath(originalPath, store, reserved) {
  const extMatch = originalPath.match(/(\.[^./]+)$/);
  const ext = extMatch ? extMatch[1] : '';
  const dirMatch = originalPath.match(/^(.*\/)/);
  const dir = dirMatch ? dirMatch[1] : 'word/media/';
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  let candidate = `${dir}sd-paste-${id}${ext}`;
  let n = 0;
  while ((store[candidate] != null && store[candidate] !== '') || reserved.has(candidate)) {
    candidate = `${dir}sd-paste-${id}-${n}${ext}`;
    n += 1;
  }
  reserved.add(candidate);
  return candidate;
}

/**
 * @param {unknown} node slice JSON node
 * @param {Map<string, string>} pathRemap old path → new path
 */
function rewriteImageSrcsInSliceJsonTree(node, pathRemap) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'image' && node.attrs && typeof node.attrs.src === 'string') {
    const next = pathRemap.get(node.attrs.src);
    if (next) {
      node.attrs = { ...node.attrs, src: next };
    }
  }
  if (node.type === 'shapeGroup' && Array.isArray(node.attrs?.shapes)) {
    node.attrs = {
      ...node.attrs,
      shapes: node.attrs.shapes.map((shape) => {
        if (!shape || typeof shape !== 'object' || !shape.attrs || typeof shape.attrs.src !== 'string') {
          return shape;
        }
        const next = pathRemap.get(shape.attrs.src);
        if (!next) return shape;
        return { ...shape, attrs: { ...shape.attrs, src: next } };
      }),
    };
  }
  const { content } = node;
  if (Array.isArray(content)) {
    for (const child of content) rewriteImageSrcsInSliceJsonTree(child, pathRemap);
  }
}

/**
 * Read `SUPERDOC_MEDIA_MIME` from the clipboard, merge into `editor.storage.image.media` (and Yjs),
 * and optionally rewrite `sliceJson` so `image` / `shapeGroup` src keys stay in sync.
 *
 * DOCX-style paths (`word/media/image1.png`) collide across documents; if the target already has
 * different data at a path, pasted bytes go under a new `word/media/sd-paste-…` key instead.
 *
 * @param {object} editor
 * @param {DataTransfer | null | undefined} clipboardData
 * @param {string | null} [sliceJson] SuperDoc slice JSON string, if any
 * @returns {string | null} slice JSON to paste (updated when paths were remapped), or `sliceJson` unchanged
 */
export function applySuperdocClipboardMedia(editor, clipboardData, sliceJson = null) {
  const raw = clipboardData?.getData?.(SUPERDOC_MEDIA_MIME);
  if (!editor?.storage?.image || !raw || typeof raw !== 'string') {
    return sliceJson;
  }

  let map;
  try {
    map = JSON.parse(raw);
  } catch {
    return sliceJson;
  }
  if (!map || typeof map !== 'object') {
    return sliceJson;
  }

  const entries = Object.entries(map).filter(([p, d]) => typeof p === 'string' && p && typeof d === 'string' && d);
  if (entries.length === 0) {
    return sliceJson;
  }

  if (!editor.storage.image.media) {
    editor.storage.image.media = {};
  }
  const store = editor.storage.image.media;
  const yMedia = editor.options?.ydoc?.getMap?.('media');

  /** @type {Map<string, string>} */
  const renames = new Map();
  const reserved = new Set();

  for (const [path, data] of entries) {
    const existing = store[path];
    if (existing != null && existing !== '' && existing !== data) {
      renames.set(path, allocateUniqueMediaPath(path, store, reserved));
    }
  }

  let outSlice = sliceJson;
  if (renames.size > 0 && sliceJson) {
    try {
      const slice = JSON.parse(sliceJson);
      if (Array.isArray(slice.content)) {
        for (const node of slice.content) rewriteImageSrcsInSliceJsonTree(node, renames);
      }
      outSlice = JSON.stringify(slice);
    } catch {
      outSlice = sliceJson;
    }
  }

  for (const [path, data] of entries) {
    const key = renames.get(path) ?? path;
    store[key] = data;
    yMedia?.set?.(key, data);
  }

  return outSlice;
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
