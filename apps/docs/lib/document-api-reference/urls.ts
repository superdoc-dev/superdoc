export function referenceUrl(path: string) {
  const normalized = path.endsWith('/index') ? path.slice(0, -'/index'.length) : path;
  return `/document-api/reference/${normalized}`;
}

export function referenceSchemaUrl(path: string) {
  return `/reference/document-api/${path}.json`;
}
