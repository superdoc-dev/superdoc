/**
 * Generate a string ID following docx ID format (see: paraId, rsidR etc.)
 * Returns uppercase hex to match the OOXML spec (e.g. w14:paraId values).
 * @returns {string} - 8 character uppercase hex string
 */
export function generateDocxRandomId(length = 8) {
  const max = 0x7fffffff;
  const value = Math.floor(Math.random() * (max + 1));
  return value.toString(16).toUpperCase().padStart(length, '0').slice(0, length);
}

/**
 * Generate a random signed 32-bit integer as a string.
 * @returns {string} A random signed 32-bit integer as a string
 */
export function generateRandomSigned32BitIntStrId() {
  const val = Math.floor(Math.random() * 0x7fffffff);
  return val.toString();
}
