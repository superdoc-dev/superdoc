//@ts-check
/**
 * Strip all inline styles(but alignment) and non-semantic attributes from HTML
 * Preserves structure while removing presentation
 *
 * @param {string} html - Raw HTML string
 * @param {Document | null | undefined} [domDocument] - Optional DOM document (e.g. from JSDOM) for Node environments
 * @returns {string} Clean HTML with semantic structure only
 */
export function stripHtmlStyles(html, domDocument) {
  if (!html) return '';

  const win = domDocument?.defaultView ?? (typeof window !== 'undefined' ? window : null);
  const DOMParserConstructor = win?.DOMParser ?? (typeof DOMParser !== 'undefined' ? DOMParser : null);
  if (!DOMParserConstructor) {
    throw new Error(
      '[super-editor] HTML import requires a DOM. Provide { document } (e.g. from JSDOM), set DOM globals, or run in a browser environment.',
    );
  }

  const parser = new DOMParserConstructor();
  const doc = parser.parseFromString(html, 'text/html');

  // Supported attributes to preserve
  const SUPPORTED_ATTRS = [
    'href',
    'src',
    'alt',
    'title',
    'colspan',
    'rowspan',
    'headers',
    'scope',
    'lang',
    'dir',
    'cite',
    'start',
    'type',
    'styleid',
  ];

  const cleanNode = (node) => {
    // Element nodes are always nodeType 1.
    if (node.nodeType !== 1) return;

    // Process spans with only text inside
    if (node.nodeName.toLowerCase() === 'span' && !node.children.length) {
      node.innerHTML = preserveSpaces(node.innerHTML);
    }

    [...node.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();

      if (name === 'style') {
        const cleanedStyle = cleanStyle(attr.value);
        if (!cleanedStyle) {
          node.removeAttribute(attr.name);
        } else node.setAttribute(attr.name, cleanedStyle);

        return;
      }

      const shouldKeep = SUPPORTED_ATTRS.includes(name) || name.startsWith('data-'); // Keep all data-* attributes

      if (!shouldKeep) {
        node.removeAttribute(attr.name);
      }
    });
    [...node.children].forEach(cleanNode);
  };

  cleanNode(doc.body);
  return doc.body.innerHTML;
}

/**
 * Strip all styles except of alignment
 *
 * @param {string} style - Style attribute value
 * @returns {string} Clean style string with supported styling
 */
function cleanStyle(style) {
  if (!style) return '';

  const declarations = style
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const textAlign = declarations.find((d) => d.startsWith('text-align'));

  return textAlign ? `${textAlign};` : '';
}

/**
 * Replaces all leading and trailing spaces inside innerHtml with special space symbol
 *
 * @param {string} innerHtml - innerHtml of DOM node
 * @returns {string} Updated innerHTML
 */
function preserveSpaces(innerHtml) {
  return innerHtml.replace(/^\s+/, '&nbsp;').replace(/\s+$/, '&nbsp;');
}
