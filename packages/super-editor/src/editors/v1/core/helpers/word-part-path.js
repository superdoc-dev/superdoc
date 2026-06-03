/**
 * Normalize OOXML part targets (e.g. `header1.xml`, `word/header1.xml`) to `word/...` paths.
 */
export function normalizeWordPartPath(target = '') {
  const normalized = String(target)
    .replace(/\\/g, '/')
    .replace(/^(\.\/|\/)+/, '')
    .replace(/^word\//, '');

  return `word/${normalized}`;
}

/**
 * Resolve the `.rels` part path for a given OOXML part path per OPC rules:
 * `word/header1.xml` → `word/_rels/header1.xml.rels`
 * `word/headers/header1.xml` → `word/headers/_rels/header1.xml.rels`
 */
export function getWordPartRelsPath(partPath = '') {
  const normalized = String(partPath).replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');

  if (lastSlash < 0 || lastSlash === normalized.length - 1) {
    const fileName = lastSlash < 0 ? normalized : normalized.slice(lastSlash + 1);
    return `word/_rels/${fileName}.rels`;
  }

  const directory = normalized.slice(0, lastSlash);
  const fileName = normalized.slice(lastSlash + 1);
  return `${directory}/_rels/${fileName}.rels`;
}
