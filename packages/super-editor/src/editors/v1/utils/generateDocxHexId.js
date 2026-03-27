const DOCX_HEX_ID_LENGTH = 8;

/**
 * Generates an uppercase 8-character hexadecimal identifier compatible with
 * OOXML attributes such as `w14:paraId` and `w14:textId`.
 *
 * Callers are responsible for using the value only on schema-valid elements.
 *
 * @returns {string}
 */
export function generateDocxHexId() {
  return Array.from({ length: DOCX_HEX_ID_LENGTH }, () => Math.floor(Math.random() * 16).toString(16))
    .join('')
    .toUpperCase();
}
