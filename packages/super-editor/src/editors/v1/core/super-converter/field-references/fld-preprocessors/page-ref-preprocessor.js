/**
 * Processes a PAGEREF instruction and creates a `sd:pageReference` node.
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes to combine.
 * @param {string} instrText The instruction text.
 * @param {object} [_options]
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 1234
 */
import { translator as wRPrTranslator } from '../../v3/handlers/w/rpr/index.js';
import { parsePageRefInstruction } from '../shared/pageref-instruction.js';

export function preProcessPageRefInstruction(nodesToCombine, instrText, options = {}) {
  const parsed = parsePageRefInstruction(instrText);
  const instructionTokens = options.instructionTokens ?? null;
  const firstInstrTextRunRPr = options.firstInstrTextRunRPr ?? null;
  const fieldRunProperties =
    parsed.fieldResultFormat === 'charformat' && firstInstrTextRunRPr
      ? wRPrTranslator.encode({ ...(options.docx ? { docx: options.docx } : {}), nodes: [firstInstrTextRunRPr] })
      : null;
  const pageRefNode = {
    name: 'sd:pageReference',
    type: 'element',
    attributes: {
      instruction: parsed.instruction,
      ...(instructionTokens?.length ? { instructionTokens } : {}),
      ...(parsed.bookmarkId ? { bookmarkId: parsed.bookmarkId } : {}),
      ...(parsed.hasHyperlinkSwitch ? { hasHyperlinkSwitch: true } : {}),
      ...(parsed.hasRelativePositionSwitch ? { hasRelativePositionSwitch: true } : {}),
      ...(parsed.pageNumberFieldFormat ? { pageNumberFieldFormat: parsed.pageNumberFieldFormat } : {}),
      ...(parsed.numericPictureFormat ? { numericPictureFormat: parsed.numericPictureFormat } : {}),
      ...(parsed.fieldResultFormat ? { fieldResultFormat: parsed.fieldResultFormat } : {}),
      ...(fieldRunProperties ? { fieldRunProperties } : {}),
    },
    elements: nodesToCombine,
  };
  return [pageRefNode];
}
