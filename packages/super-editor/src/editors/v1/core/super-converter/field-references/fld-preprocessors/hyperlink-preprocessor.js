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
 * Processes a HYPERLINK instruction and creates a `w:hyperlink` node.
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes to combine.
 * @param {string} instruction The instruction text.
 * @param {{ docx?: import('../../v2/docxHelper').ParsedDocx }} [options]
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 1216
 */
export function preProcessHyperlinkInstruction(nodesToCombine, instruction, options = {}) {
  const docx = options.docx;
  const linkAttributes = resolveHyperlinkAttributes(instruction, docx) ?? {};

  return [
    {
      name: 'w:hyperlink',
      type: 'element',
      attributes: linkAttributes,
      elements: nodesToCombine,
    },
  ];
}
