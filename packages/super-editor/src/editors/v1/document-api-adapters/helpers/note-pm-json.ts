type PmJsonNode = {
  type?: unknown;
  content?: unknown;
  [key: string]: unknown;
};

function isPmJsonNode(value: unknown): value is PmJsonNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEmptyRunNode(value: unknown): value is PmJsonNode {
  if (!isPmJsonNode(value) || value.type !== 'run') {
    return false;
  }

  return !Array.isArray(value.content) || value.content.length === 0;
}

function normalizeNotePmNode(value: unknown): unknown {
  if (!isPmJsonNode(value)) {
    return value;
  }

  const normalized: PmJsonNode = { ...value };
  if (!Array.isArray(value.content)) {
    return normalized;
  }

  const normalizedChildren = value.content
    .map((child) => normalizeNotePmNode(child))
    .filter((child) => !(value.type === 'paragraph' && isEmptyRunNode(child)));

  normalized.content = normalizedChildren;
  return normalized;
}

/**
 * Normalize note PM JSON so interactive layout and story editors share the same
 * position space.
 *
 * The note importer preserves the leading OOXML footnote/endnote reference run
 * as an empty `run` node. Story editors immediately normalize those empty runs
 * away, but the presentation-footnote layout previously converted the raw
 * content as-is. That left the rendered note and the active note editor offset
 * by two PM positions, which made clicks in the rendered note type into the
 * wrong place. Keeping both paths on the same normalized PM JSON fixes the
 * mismatch at the source.
 */
export function normalizeNotePmJson<T extends Record<string, unknown>>(docJson: T): T {
  const normalized = normalizeNotePmNode(docJson);
  return (isPmJsonNode(normalized) ? normalized : docJson) as T;
}
