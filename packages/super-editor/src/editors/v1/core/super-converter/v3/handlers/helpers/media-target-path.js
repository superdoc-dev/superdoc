/**
 * Normalize a relationship target to the media key shape stored in docx media maps.
 *
 * Relationship targets are commonly "media/image.png" while imported media is
 * keyed as "word/media/image.png". Keep existing behavior for other relative
 * targets by prefixing "word/" after stripping leading package slashes.
 *
 * @param {string} targetPath
 * @returns {string}
 */
export function normalizeTargetPath(targetPath = '') {
  if (!targetPath) return targetPath;
  const trimmed = targetPath.replace(/^\/+/, '');
  if (trimmed.startsWith('word/')) return trimmed;
  return `word/${trimmed}`;
}
