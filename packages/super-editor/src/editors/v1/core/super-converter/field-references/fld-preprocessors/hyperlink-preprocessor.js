import { generateDocxRandomId } from '@helpers/generateDocxRandomId.js';

/**
 * Parses a HYPERLINK field instruction into the attribute set that belongs on
 * a `<w:hyperlink>` element, registering an external-link relationship in
 * `word/_rels/document.xml.rels` when needed.
 *
 * Side-effect: a `<Relationship>` is appended to the rels file when the
 * instruction is a URL form and the rels container exists.
 *
 * @param {string} instruction
 * @param {import('../../v2/docxHelper').ParsedDocx} [docx]
 * @returns {Record<string, string | boolean> | null} Attribute set, or null
 *   when the instruction has no recognisable target.
 */
export function resolveHyperlinkAttributes(instruction, docx) {
  const urlMatch = instruction.match(/^\s*HYPERLINK\s+"([^"]+)"/i);
  if (urlMatch && urlMatch.length >= 2) {
    const url = urlMatch[1];
    const rels = docx?.['word/_rels/document.xml.rels'];
    const relationships = rels?.elements?.find((el) => el.name === 'Relationships');
    if (relationships) {
      const rId = 'rId' + generateDocxRandomId();
      relationships.elements.push({
        type: 'element',
        name: 'Relationship',
        attributes: {
          Id: rId,
          Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
          Target: url,
          TargetMode: 'External',
        },
      });
      return { 'r:id': rId };
    }
    return { 'w:anchor': url };
  }

  const availableSwitches = {
    'w:anchor': /(?:\\)?l "(?<value>[^"]+)"/,
    new_window: /(?:\\n|\n)/,
    'w:tgtFrame': /(?:\\t|\t) "(?<value>[^"]+)"/,
    'w:tooltip': /(?:\\)?o "(?<value>[^"]+)"/,
  };

  const parsedSwitches = {};
  for (const [key, pattern] of Object.entries(availableSwitches)) {
    const match = instruction.match(pattern);
    if (match) {
      parsedSwitches[key] = match.groups?.value || true;
    }
  }

  if (parsedSwitches.new_window) {
    parsedSwitches['w:tgtFrame'] = '_blank';
    delete parsedSwitches.new_window;
  }

  if (Object.keys(parsedSwitches).length === 0) {
    return null;
  }

  return { ...parsedSwitches };
}

/**
 * Slips a `<w:hyperlink>` *inside* one paragraph, wrapping just its visible runs.
 *
 * @param {import('../../v2/types/index.js').OpenXmlNode} paragraph
 * @param {Record<string, string | boolean>} linkAttributes
 * @returns {import('../../v2/types/index.js').OpenXmlNode} A copy of the paragraph with its runs wrapped.
 */
function wrapParagraphRunsInHyperlink(paragraph, linkAttributes) {
  const children = Array.isArray(paragraph.elements) ? paragraph.elements : [];
  const wrappedChildren = [];
  let pendingRuns = null;

  const flushPendingRuns = () => {
    if (!pendingRuns || pendingRuns.length === 0) {
      pendingRuns = null;
      return;
    }
    wrappedChildren.push({
      name: 'w:hyperlink',
      type: 'element',
      attributes: { ...linkAttributes },
      elements: pendingRuns,
    });
    pendingRuns = null;
  };

  for (const child of children) {
    if (child?.name === 'w:r') {
      if (!pendingRuns) pendingRuns = [];
      pendingRuns.push(child);
      continue;
    }
    // Paragraph properties (w:pPr) and any other structural child must stay a
    // direct child of the paragraph, outside the inline hyperlink.
    flushPendingRuns();
    wrappedChildren.push(child);
  }
  flushPendingRuns();

  return { ...paragraph, elements: wrappedChildren };
}

/**
 * Turns a HYPERLINK field code into real `<w:hyperlink>` tag(s).
 *
 * Old Word docs don't store a link as one tidy tag. They store "plumbing": a
 * `begin` marker, the URL instruction, a `separate` marker, the visible text,
 * then an `end` marker. By the time we get here that plumbing has been stripped
 * and `nodesToCombine` holds just the visible content the link should cover. Our
 * job is to wrap that content in a `<w:hyperlink>`.
 *
 * Common case — the whole link lives on one line, so `nodesToCombine` is just
 * inline runs. One `<w:hyperlink>` around all of them is correct:
 *
 *   <w:hyperlink><w:r>CSP - 1</w:r></w:hyperlink>
 *
 * Cross-paragraph case — the plumbing started on one line and finished on the
 * next (very common when a link fills a table cell), so `nodesToCombine` holds
 * whole `<w:p>` blocks, not loose runs. A `<w:hyperlink>` is *inline* (like
 * `<b>`): it lives inside a line of text and cannot contain a `<w:p>`. Wrapping
 * the paragraphs in one hyperlink...
 *
 *   <w:hyperlink>                <-- paragraphs can't live inside an inline tag
 *     <w:p>CSP - 1</w:p>
 *     <w:p>Data in transit</w:p>
 *   </w:hyperlink>
 *
 * ...makes the importer throw the paragraphs away (it only reads runs out of a
 * hyperlink), which empties the table cell. An empty cell breaks the tableCell
 * `block+` schema and aborts the whole document load.
 *
 * So for the cross-paragraph case we keep each paragraph and drop a *separate*
 * `<w:hyperlink>` inside each one, all pointing at the same target — exactly how
 * Word itself writes a link that spans more than one line:
 *
 *   <w:p><w:hyperlink r:id="rId5"><w:r>CSP - 1</w:r></w:hyperlink></w:p>
 *   <w:p><w:hyperlink r:id="rId5"><w:r>Data in transit</w:r></w:hyperlink></w:p>
 *
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The visible content the link should cover.
 * @param {string} instruction The instruction text.
 * @param {{ docx?: import('../../v2/docxHelper').ParsedDocx }} [options]
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 1216
 */
export function preProcessHyperlinkInstruction(nodesToCombine, instruction, options = {}) {
  const docx = options.docx;
  const linkAttributes = resolveHyperlinkAttributes(instruction, docx) ?? {};

  // A `<w:p>` in the gathered content means the link spans a paragraph break, so
  // we can't use the simple "one hyperlink around everything" shape.
  const spansParagraphBoundary = nodesToCombine.some((node) => node?.name === 'w:p');
  if (!spansParagraphBoundary) {
    return [
      {
        name: 'w:hyperlink',
        type: 'element',
        attributes: linkAttributes,
        elements: nodesToCombine,
      },
    ];
  }

  return nodesToCombine.map((node) => {
    if (node?.name === 'w:p') {
      return wrapParagraphRunsInHyperlink(node, linkAttributes);
    }
    // A loose run sitting between paragraphs still gets its own inline link.
    return {
      name: 'w:hyperlink',
      type: 'element',
      attributes: { ...linkAttributes },
      elements: [node],
    };
  });
}
