import { generateDocxRandomId } from '@helpers/generateDocxRandomId.js';

/**
 * Processes a HYPERLINK instruction and creates a `w:hyperlink` node.
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes to combine.
 * @param {string} instruction The instruction text.
 * @param {import('../../v2/docxHelper').ParsedDocx} [docx] - The docx object.
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 1216
 */
export function preProcessHyperlinkInstruction(nodesToCombine, instruction, docx) {
  const urlMatch = instruction.match(/HYPERLINK\s+"([^"]+)"/);
  let linkAttributes;
  if (urlMatch && urlMatch.length >= 2) {
    const url = urlMatch[1];

    const rels = docx['word/_rels/document.xml.rels'];
    const relationships = rels?.elements.find((el) => el.name === 'Relationships');
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
      linkAttributes = { 'r:id': rId };
    } else {
      linkAttributes = { 'w:anchor': url };
    }
  } else {
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

    linkAttributes = { ...parsedSwitches };
  }

  return [
    {
      name: 'w:hyperlink',
      type: 'element',
      attributes: linkAttributes,
      elements: nodesToCombine,
    },
  ];
}
