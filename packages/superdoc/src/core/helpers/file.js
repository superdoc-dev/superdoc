import { DOCX, PDF, HTML } from '@superdoc/common';

/**
 * @typedef {Object} UploadWrapper
 * @property {File|Blob} [originFileObj] Underlying file reference used by some uploaders
 * @property {File|Blob} [file] Underlying file reference used by some uploaders
 * @property {File|Blob} [raw] Underlying file reference used by some uploaders
 * @property {string|number} [uid] Optional unique id from uploaders (ignored)
 * @property {string} [name] Display name (not always reliable for the native file)
 */

/**
 * @typedef {Object} DocumentEntry
 * @property {string} [type] Mime type or shorthand ('docx' | 'pdf' | 'html')
 * @property {string} [name] Filename to display
 * @property {File|Blob|UploadWrapper} [data] File-like data; normalized to File when available, otherwise Blob
 * @property {string} [url] Remote URL to fetch; left as-is for URL flows
 * @property {boolean} [isNewFile]
 */

/**
 * Extract a native File from various wrapper shapes used by UI uploader libraries.
 * Safely handles common wrapper keys or plain Blob/File inputs.
 *
 * @param {File|Blob|UploadWrapper|any} input File-like object or an uploader wrapper
 * @returns {File|Blob|null} Extracted native File/Blob or null if not resolvable
 */
export const extractBrowserFile = (input) => {
  if (!input) return null;

  // Already a File
  if (typeof File === 'function' && input instanceof File) return input;

  // Blob without name → wrap as File with a default name
  if (typeof Blob === 'function' && input instanceof Blob) {
    const hasFileCtor = typeof File === 'function';
    if (hasFileCtor) {
      const name = input.name || 'document';
      return new File([input], name, { type: input.type });
    }
    // In Node.js without File constructor, return the Blob as-is
    return input;
  }

  // Common: real file often lives in `originFileObj`
  if (input.originFileObj) return extractBrowserFile(input.originFileObj);

  // Other libraries sometimes use `file` or `raw`
  if (input.file) return extractBrowserFile(input.file);
  if (input.raw) return extractBrowserFile(input.raw);

  return null;
};

/**
 * Infer a mime type from filename when missing
 * @param {string} [name]
 * @returns {string}
 */
const inferTypeFromName = (name = '') => {
  const lower = String(name).toLowerCase();
  if (lower.endsWith('.docx')) return DOCX;
  if (lower.endsWith('.pdf')) return PDF;
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return HTML;
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'text/markdown';
  return '';
};

/**
 * Normalize any supported document input into SuperDoc's expected shape.
 * Accepts File/Blob/uploader wrappers directly, or a config-like object with a `data` field.
 * URL-based entries are returned unchanged for downstream handling.
 *
 * @param {File|Blob|UploadWrapper|DocumentEntry|any} entry
 * @returns {DocumentEntry|any} Normalized document entry or the original value when unchanged
 */
export const normalizeDocumentEntry = (entry) => {
  // Direct file-like input (e.g., uploader wrapper or File)
  const maybeFile = extractBrowserFile(entry);
  if (maybeFile) {
    const name = /** @type {any} */ (maybeFile).name || (entry && entry.name) || 'document';
    const type = maybeFile.type || inferTypeFromName(name) || DOCX;
    return {
      type,
      data: maybeFile,
      name,
    };
  }

  // Config object with a `data` property that could be file-like
  if (entry && typeof entry === 'object' && 'data' in entry) {
    const file = extractBrowserFile(entry.data);
    if (file) {
      const type = entry.type || file.type || inferTypeFromName(file.name) || DOCX;
      return {
        ...entry,
        type,
        data: file,
        name: entry.name || file.name || 'document',
      };
    }
  }

  // Unchanged (e.g., URL-based configs handled later)
  return entry;
};
