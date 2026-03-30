export const sanitizeDocxMediaName = (value, fallback = 'image') => {
  if (!value) return fallback;

  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, '_');
  return sanitized || fallback;
};

export const getFallbackImageNameFromDataUri = (src = '', fallback = 'image') => {
  if (!src || typeof src !== 'string') return fallback;

  const [prefix] = src.split(';');
  const [, maybeType] = prefix.split('/');
  const extension = maybeType?.toLowerCase();

  return extension ? `${fallback}.${extension}` : fallback;
};
