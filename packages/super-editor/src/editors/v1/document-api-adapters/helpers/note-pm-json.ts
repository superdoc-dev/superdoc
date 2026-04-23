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

function isLeadingNoteReferenceRun(value: unknown): value is PmJsonNode {
  if (!isEmptyRunNode(value)) {
    return false;
  }

  const styleId = (value.attrs as { runProperties?: { styleId?: unknown } } | undefined)?.runProperties?.styleId;
  return styleId === 'FootnoteReference' || styleId === 'EndnoteReference';
}

function isWhitespaceOnlyTextNode(value: unknown): value is PmJsonNode {
  return isPmJsonNode(value) && value.type === 'text' && typeof value.text === 'string' && /^\s*$/.test(value.text);
}

function isInvisibleNotePassthroughNode(value: unknown): value is PmJsonNode {
  return isPmJsonNode(value) && value.type === 'passthroughInline';
}

function stripLeadingWhitespaceFromTextNode(value: unknown): unknown {
  if (!isPmJsonNode(value) || value.type !== 'text' || typeof value.text !== 'string') {
    return value;
  }

  const trimmed = value.text.replace(/^\s+/, '');
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed === value.text ? value : { ...value, text: trimmed };
}

function stripLeadingNoteSeparatorFromRun(value: unknown): unknown {
  if (!isPmJsonNode(value) || value.type !== 'run' || !Array.isArray(value.content)) {
    return value;
  }

  const remainingContent = [...value.content];
  while (remainingContent.length > 0) {
    const firstChild = remainingContent[0];
    if (isPmJsonNode(firstChild) && firstChild.type === 'tab') {
      remainingContent.shift();
      continue;
    }
    if (isWhitespaceOnlyTextNode(firstChild)) {
      remainingContent.shift();
      continue;
    }

    const normalizedFirstChild = stripLeadingWhitespaceFromTextNode(firstChild);
    if (normalizedFirstChild == null) {
      remainingContent.shift();
      continue;
    }

    remainingContent[0] = normalizedFirstChild;
    break;
  }

  if (remainingContent.length === 0) {
    return null;
  }

  return {
    ...value,
    content: remainingContent,
  };
}

function stripLeadingNoteSeparatorChildren(children: unknown[]): unknown[] {
  const remainingChildren = [...children];

  while (remainingChildren.length > 0) {
    const firstChild = remainingChildren[0];
    if (!isPmJsonNode(firstChild)) {
      break;
    }

    if (firstChild.type === 'run') {
      const normalizedRun = stripLeadingNoteSeparatorFromRun(firstChild);
      if (normalizedRun == null) {
        remainingChildren.shift();
        continue;
      }
      remainingChildren[0] = normalizedRun;
      break;
    }

    if (firstChild.type === 'tab' || isWhitespaceOnlyTextNode(firstChild)) {
      remainingChildren.shift();
      continue;
    }

    const normalizedText = stripLeadingWhitespaceFromTextNode(firstChild);
    if (normalizedText == null) {
      remainingChildren.shift();
      continue;
    }

    remainingChildren[0] = normalizedText;
    break;
  }

  return remainingChildren;
}

function normalizeNotePmNode(value: unknown): unknown {
  if (!isPmJsonNode(value)) {
    return value;
  }

  const normalized: PmJsonNode = { ...value };
  if (!Array.isArray(value.content)) {
    return normalized;
  }

  const originalChildren = value.content;
  const normalizedChildren = originalChildren
    .map((child) => normalizeNotePmNode(child))
    .filter((child) => !isInvisibleNotePassthroughNode(child))
    .filter((child) => !(value.type === 'paragraph' && isEmptyRunNode(child)));

  if (value.type === 'paragraph' && originalChildren[0] && isLeadingNoteReferenceRun(originalChildren[0])) {
    normalized.content = stripLeadingNoteSeparatorChildren(normalizedChildren);
    return normalized;
  }

  normalized.content = normalizedChildren;
  return normalized;
}

/**
 * Normalize note PM JSON so interactive layout and story editors share the same
 * position space.
 *
 * The note importer preserves note-only content from OOXML:
 * the empty footnote/endnote reference run, the separator Word places
 * immediately after it (typically a tab or a whitespace-only run), and any
 * hidden passthrough field-code nodes.
 *
 * The rendered footnote surface does not expose those invisible note-only
 * nodes as editable PM positions, so leaving them in the hidden story editor
 * shifts the visible click surface and the active editor into different
 * coordinate spaces.
 * Keeping both paths on the same normalized PM JSON fixes the mismatch at the
 * source.
 */
export function normalizeNotePmJson<T extends Record<string, unknown>>(docJson: T): T {
  const normalized = normalizeNotePmNode(docJson);
  return (isPmJsonNode(normalized) ? normalized : docJson) as T;
}
