const FALLBACK_NAME = 'image';

const stripDiacritics = (value) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

const sanitizeSegment = (segment, { allowDots = false } = {}) => {
  if (!segment) return '';

  const normalized = stripDiacritics(segment)
    .replace(/[\s\u2000-\u206f]+/g, '_')
    .replace(/[\\/]+/g, '_');

  const allowedPattern = allowDots ? /[^0-9A-Za-z._-]+/g : /[^0-9A-Za-z_-]+/g;

  let sanitized = normalized.replace(allowedPattern, '_');
  sanitized = sanitized.replace(/_+/g, '_');
  sanitized = sanitized.replace(/^[_.-]+/, '');
  sanitized = sanitized.replace(/[_-]+$/, '');

  return sanitized;
};

const splitFileName = (name) => {
  const trimmed = name?.trim?.() ?? '';
  const lastDot = trimmed.lastIndexOf('.');

  if (lastDot <= 0 || lastDot === trimmed.length - 1) {
    return { base: trimmed, ext: '' };
  }

  return {
    base: trimmed.slice(0, lastDot),
    ext: trimmed.slice(lastDot + 1),
  };
};

export const sanitizeImageFileName = (inputName) => {
  const { base, ext } = splitFileName(inputName || '');

  const sanitizedBase = sanitizeSegment(base, { allowDots: true }) || FALLBACK_NAME;
  const sanitizedExt = sanitizeSegment(ext, { allowDots: false }).toLowerCase();

  if (!sanitizedExt) return sanitizedBase;

  return `${sanitizedBase}.${sanitizedExt}`;
};

export const ensureUniqueFileName = (preferredName, existingNames = new Set()) => {
  const sanitized = sanitizeImageFileName(preferredName);
  if (!existingNames || typeof existingNames.has !== 'function') {
    return sanitized;
  }

  const existingSet = new Set();
  existingNames.forEach((name) => existingSet.add(sanitizeImageFileName(name)));

  if (!existingSet.has(sanitized)) {
    return sanitized;
  }

  const { base, ext } = splitFileName(sanitized);
  let counter = 1;
  let candidate = sanitized;
  const suffix = () => `${base}-${counter}${ext ? `.${ext}` : ''}`;

  while (existingSet.has(candidate)) {
    candidate = suffix();
    counter += 1;
  }

  return candidate;
};

export const buildMediaPath = (fileName) => `word/media/${fileName}`;
