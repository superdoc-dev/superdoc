/**
 * Spec B — classify the content of a typed `w:footnote` record into one of three
 * rendering modes, per ECMA-376 §17.11.1 / §17.11.23 / Annex L.1.12.5:
 *
 *   - `default-marker`: paragraph contains exactly the marker element
 *     (`<w:r><w:separator/></w:r>` or `<w:r><w:continuationSeparator/></w:r>`).
 *     The renderer uses Word's default visual (Spec A widths).
 *
 *   - `suppression`: paragraph is empty (`<w:p/>` with no runs). User opted
 *     out of the default — the renderer emits no separator/notice fragment.
 *
 *   - `explicit`: paragraph has `w:pBdr` or text content. The renderer should
 *     convert it via toFlowBlocks and emit those fragments instead of the
 *     synthetic default.
 *
 * The classifier is XML-tree-only — no PM conversion required. Consumers can
 * still pass `originalXml` to `toFlowBlocks` for explicit case rendering.
 */

export type XmlNode = {
  name?: string;
  elements?: XmlNode[];
  attributes?: Record<string, unknown>;
  text?: string;
};

export type NoteSeparatorClassification = 'default-marker' | 'suppression' | 'explicit';

/**
 * Walks the original XML of a `<w:footnote w:type="separator|continuationSeparator|continuationNotice">`
 * record and returns its classification.
 */
export function classifyNoteSeparatorContent(originalXml: XmlNode | null | undefined): NoteSeparatorClassification {
  if (!originalXml) return 'suppression';

  const paragraphs = (originalXml.elements ?? []).filter((el) => el?.name === 'w:p');
  if (paragraphs.length === 0) return 'suppression';

  // Aggregate signals across all paragraphs.
  let hasMarkerElement = false;
  let hasExplicitContent = false;

  for (const p of paragraphs) {
    if (paragraphHasPBdr(p)) {
      hasExplicitContent = true;
      continue;
    }
    if (paragraphHasText(p)) {
      hasExplicitContent = true;
      continue;
    }
    if (paragraphHasMarker(p)) {
      hasMarkerElement = true;
    }
  }

  if (hasExplicitContent) return 'explicit';
  if (hasMarkerElement) return 'default-marker';
  return 'suppression';
}

function paragraphHasPBdr(p: XmlNode): boolean {
  const pPr = (p.elements ?? []).find((el) => el.name === 'w:pPr');
  if (!pPr) return false;
  const pBdr = (pPr.elements ?? []).find((el) => el.name === 'w:pBdr');
  return Boolean(pBdr && (pBdr.elements ?? []).length > 0);
}

function paragraphHasText(p: XmlNode): boolean {
  for (const child of p.elements ?? []) {
    if (child.name === 'w:r') {
      for (const grand of child.elements ?? []) {
        if (grand.name === 'w:t') {
          const t = grand.text ?? extractInnerText(grand);
          if (typeof t === 'string' && t.length > 0) return true;
        }
      }
    }
  }
  return false;
}

function paragraphHasMarker(p: XmlNode): boolean {
  for (const child of p.elements ?? []) {
    if (child.name === 'w:r') {
      for (const grand of child.elements ?? []) {
        if (grand.name === 'w:separator' || grand.name === 'w:continuationSeparator') return true;
      }
    }
  }
  return false;
}

function extractInnerText(node: XmlNode): string {
  if (typeof node.text === 'string') return node.text;
  if (!Array.isArray(node.elements)) return '';
  return node.elements.map((c) => (typeof c.text === 'string' ? c.text : extractInnerText(c))).join('');
}
